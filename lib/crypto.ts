import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { AppError } from './errors';
export interface EncryptedValue { ciphertext: string; iv: string; authTag: string }
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export function encrypt(value: string, key: Buffer, context: string): EncryptedValue {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
}
export function decrypt(value: EncryptedValue, key: Buffer, context: string): string {
  try {
    if (Buffer.from(value.iv, 'base64').length !== 12 || Buffer.from(value.authTag, 'base64').length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.iv, 'base64'));
    cipher.setAAD(Buffer.from(context));
    cipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(value.ciphertext, 'base64')), cipher.final()]).toString('utf8');
  } catch { throw new AppError('STORAGE_ERROR'); }
}
