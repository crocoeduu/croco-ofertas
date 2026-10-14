import 'server-only';
import type { PoolClient } from 'pg';
import { getDatabase, transaction } from '../database';
import { getOAuthEnv, getStorageEnv } from '../env';
import { decrypt, encrypt, type EncryptedValue } from '../crypto';
import { AppError } from '../errors';
import { storageError } from '../storage-error';
import { refreshMercadoLivreToken } from './oauth';
import type { OAuthTokenResponse, StoredTokens, TokenStorage } from './types';
interface TokenRow { owner_hash: string; user_id: string; access_token: EncryptedValue; refresh_token: EncryptedValue; expires_at: Date; scope: string }
function key() { const config = getStorageEnv(); if (!config) throw new AppError('STORAGE_ERROR'); return config.key; }
function unpack(row: TokenRow): StoredTokens {
  return { accessToken: decrypt(row.access_token, key(), `${row.owner_hash}:access`), refreshToken: decrypt(row.refresh_token, key(), `${row.owner_hash}:refresh`), userId: Number(row.user_id), expiresAt: row.expires_at, scope: row.scope };
}
async function write(client: Pick<PoolClient, 'query'>, ownerHash: string, tokens: OAuthTokenResponse) {
  if (!/^[a-f0-9]{64}$/.test(ownerHash)) throw new AppError('STORAGE_ERROR');
  await client.query(`INSERT INTO meli_connections (owner_hash,user_id,access_token,refresh_token,expires_at,scope,session_expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '30 days')
    ON CONFLICT(owner_hash) DO UPDATE SET user_id=EXCLUDED.user_id,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,expires_at=EXCLUDED.expires_at,scope=EXCLUDED.scope,session_expires_at=EXCLUDED.session_expires_at,updated_at=NOW()`,
    [ownerHash, tokens.user_id, encrypt(tokens.access_token, key(), `${ownerHash}:access`), encrypt(tokens.refresh_token, key(), `${ownerHash}:refresh`), new Date(Date.now() + tokens.expires_in * 1000), tokens.scope]);
}
export async function saveMercadoLivreTokens(ownerHash: string, tokens: OAuthTokenResponse) {
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try { await write(db, ownerHash, tokens); } catch (error) { throw storageError(error); }
}
export async function getMercadoLivreTokens(ownerHash: string): Promise<StoredTokens | null> {
  const db = getDatabase(); if (!db) return null;
  try { const result = await db.query<TokenRow>('SELECT * FROM meli_connections WHERE owner_hash=$1 AND session_expires_at>NOW()', [ownerHash]); return result.rows[0] ? unpack(result.rows[0]) : null; }
  catch (error) { throw storageError(error); }
}
export const updateMercadoLivreTokens = saveMercadoLivreTokens;
export const tokenStorage: TokenStorage = { saveMercadoLivreTokens, getMercadoLivreTokens, updateMercadoLivreTokens };
export async function hasConnection(ownerHash: string): Promise<boolean> {
  const db = getDatabase(); if (!db) return false;
  try { const result = await db.query('SELECT 1 FROM meli_connections WHERE owner_hash=$1 AND session_expires_at>NOW()', [ownerHash]); return result.rowCount === 1; }
  catch (error) { throw storageError(error); }
}
export async function getValidAccessToken(ownerHash: string): Promise<string> {
  // Serialize refresh per session across serverless instances. Do not retry a rotated refresh token.
  return transaction(async client => {
    const result = await client.query<TokenRow>('SELECT * FROM meli_connections WHERE owner_hash=$1 AND session_expires_at>NOW() FOR UPDATE', [ownerHash]);
    if (!result.rows[0]) throw new AppError('CONNECTION_MISSING');
    const stored = unpack(result.rows[0]);
    if (stored.expiresAt.getTime() > Date.now() + 60_000) return stored.accessToken;
    const refreshed = await refreshMercadoLivreToken(getOAuthEnv(), stored.refreshToken);
    if (refreshed.user_id !== stored.userId) throw new AppError('TOKEN_ENDPOINT_ERROR');
    await write(client, ownerHash, refreshed);
    return refreshed.access_token;
  });
}
