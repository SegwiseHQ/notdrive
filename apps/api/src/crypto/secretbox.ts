import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { loadServerEnv } from '../env.js';

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const { APP_ENCRYPTION_KEY } = loadServerEnv();
  const k = Buffer.from(APP_ENCRYPTION_KEY, 'base64');
  if (k.length !== 32) throw new Error('APP_ENCRYPTION_KEY must decode to exactly 32 bytes');
  cachedKey = k;
  return k;
}

export interface Sealed {
  ct: string; // base64 ciphertext + auth tag
  iv: string; // base64 12-byte nonce
}

export function seal(plaintext: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: Buffer.concat([ct, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

export function open(sealed: Sealed): string {
  const buf = Buffer.from(sealed.ct, 'base64');
  const ct = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const iv = Buffer.from(sealed.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
