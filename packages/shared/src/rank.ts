// LexoRank-style fractional ranks using a base-62 alphabet.
// Ranks compare lexicographically so midpoints can be generated between
// any two siblings without renumbering.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length; // 62
const MIN = ALPHABET[0]!;
const MAX = ALPHABET[BASE - 1]!;

function indexOf(ch: string): number {
  const i = ALPHABET.indexOf(ch);
  if (i < 0) throw new Error(`invalid rank char: ${ch}`);
  return i;
}

function charAt(n: number): string {
  return ALPHABET[n]!;
}

// Normalize trailing '0' padding used for comparisons.
function pad(a: string, len: number): string {
  if (a.length >= len) return a;
  return a + MIN.repeat(len - a.length);
}

/**
 * Generate a rank strictly between `prev` and `next`.
 * Pass undefined for an open endpoint (beginning or end of the list).
 * Returned rank always compares strictly greater than prev and less than next.
 */
export function between(prev: string | undefined, next: string | undefined): string {
  const lo = prev ?? '';
  const hi = next ?? '';
  if (prev !== undefined && next !== undefined && prev >= next) {
    throw new Error(`rank out of order: ${prev} >= ${next}`);
  }

  // Extend both strings to the same length so digit-wise midpoint makes sense.
  const len = Math.max(lo.length, hi.length) + 1;
  const a = pad(lo, len);
  const b = hi === '' ? MAX.repeat(len) : pad(hi, len);

  let result = '';
  let carry = 0;
  for (let i = 0; i < len; i++) {
    const ai = indexOf(a[i]!);
    const bi = indexOf(b[i]!);
    const sum = ai + bi + carry;
    const digit = Math.floor(sum / 2);
    carry = (sum % 2) * BASE;
    result += charAt(digit);
  }

  // If still equal to one endpoint, extend with a midpoint digit.
  if (prev !== undefined && result <= prev) {
    result += charAt(Math.floor(BASE / 2));
  }
  if (next !== undefined && result >= next) {
    // Back off by one and append mid digit.
    result = prev !== undefined ? prev : MIN;
    result += charAt(Math.floor(BASE / 2));
  }
  return result;
}

/** Initial rank when the list is empty. */
export const INITIAL_RANK = 'U';

/** Produce `count` evenly spaced ranks after `after` (undefined = start). */
export function sequence(count: number, after?: string): string[] {
  const out: string[] = [];
  let cursor = after;
  for (let i = 0; i < count; i++) {
    const r = between(cursor, undefined);
    out.push(r);
    cursor = r;
  }
  return out;
}
