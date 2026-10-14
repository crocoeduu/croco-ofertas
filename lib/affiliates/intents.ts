import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getOAuthEnv } from '../env';
function signature(value: string): string { return createHmac('sha256',getOAuthEnv().clientSecret).update(`croco-affiliate-intent:${value}`).digest('base64url'); }
export function makeIntent(context: string, now=Date.now()): string {
  const value=`${now}.${randomBytes(16).toString('base64url')}`;
  return `${value}.${signature(`${context}:${value}`)}`;
}
export function verifyIntent(token: unknown, context: string, now=Date.now()): boolean {
  if(typeof token!=='string'||token.length>150)return false;
  const [stamp,random,mac,...extra]=token.split('.');if(extra.length||!/^\d{13}$/.test(stamp??'')||!/^[A-Za-z0-9_-]{22}$/.test(random??''))return false;
  const time=Number(stamp);if(time>now||time<now-300000)return false;
  const expected=signature(`${context}:${stamp}.${random}`);
  return !!mac && mac.length===expected.length && timingSafeEqual(Buffer.from(mac),Buffer.from(expected));
}
