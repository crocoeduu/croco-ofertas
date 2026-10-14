import 'server-only';
import type { NextRequest } from 'next/server';
import { getDatabase } from '../database';
import { AppError } from '../errors';
import { storageError } from '../storage-error';
import { digest } from '../crypto';
import { requireOfferSession } from '../offers/security';

// OAuth proves identity; this separate, server-controlled allowlist grants a role.
// There is no public signup, bootstrap endpoint or client-controlled role field.
export function administratorId(): string | null {
  const id = process.env.ADMIN_MELI_USER_ID;
  return id && /^[1-9][0-9]{0,18}$/.test(id) ? id : null;
}
export async function isAdministrator(owner: string): Promise<boolean> {
  const id = administratorId(); if (!id || !/^[a-f0-9]{64}$/.test(owner)) return false;
  const db = getDatabase(); if (!db) throw new AppError('STORAGE_ERROR');
  try {
    const result = await db.query('SELECT 1 FROM public.meli_connections WHERE owner_hash=$1 AND user_id=$2::bigint AND session_expires_at>NOW()', [owner,id]);
    return result.rowCount === 1;
  } catch (error) { throw storageError(error); }
}
export async function administratorSession(session: string | undefined): Promise<boolean> {
  return !!session && /^[A-Za-z0-9_-]{43}$/.test(session) && await isAdministrator(digest(session));
}
export async function requireAdministrator(request: NextRequest, mutation = false): Promise<string> {
  const owner = await requireOfferSession(request,mutation);
  if (!await isAdministrator(owner)) throw new AppError('ADMIN_REQUIRED');
  return owner;
}
