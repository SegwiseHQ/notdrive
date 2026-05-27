import { customAlphabet } from 'nanoid';

const alpha = '0123456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
export const newId = customAlphabet(alpha, 21);
export const newSessionId = customAlphabet(alpha, 32);
export const newInviteToken = customAlphabet(alpha, 40);

export function now(): number {
  return Date.now();
}
