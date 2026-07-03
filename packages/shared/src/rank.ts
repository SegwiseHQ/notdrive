// LexoRank-style fractional ranks using a base-62 alphabet.
// Ranks compare lexicographically so midpoints can be generated between
// any two siblings without renumbering.

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = ALPHABET.length; // 62

function indexOf(ch: string): number {
  const i = ALPHABET.indexOf(ch);
  if (i < 0) throw new Error(`invalid rank char: ${ch}`);
  return i;
}

function charAt(n: number): string {
  const ch = ALPHABET.charAt(n);
  if (!ch) throw new Error(`invalid rank index: ${n}`);
  return ch;
}

/**
 * Generate a rank strictly between `prev` and `next`.
 * Pass undefined for an open endpoint (beginning or end of the list).
 * Returned rank always compares strictly greater than prev and less than next.
 */
export function between(prev: string | undefined, next: string | undefined): string {
  if (prev !== undefined && next !== undefined && prev >= next) {
    throw new Error(`rank out of order: ${prev} >= ${next}`);
  }

  let result = '';
  let i = 0;
  while (true) {
    const lo = prev && i < prev.length ? indexOf(prev.charAt(i)) : 0;
    const hi = next && i < next.length ? indexOf(next.charAt(i)) : BASE - 1;
    if (hi - lo > 1) {
      return result + charAt(Math.floor((lo + hi) / 2));
    }
    result += charAt(lo);
    i++;
  }
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
