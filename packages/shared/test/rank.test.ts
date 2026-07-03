import { describe, expect, it } from 'vitest';
import { INITIAL_RANK, between, sequence } from '../src/rank.js';

describe('rank.between', () => {
  it('produces a rank strictly greater than prev and less than next', () => {
    const r = between('U', 'V');
    expect(r > 'U').toBe(true);
    expect(r < 'V').toBe(true);
  });

  it('appends after an endpoint when next is undefined', () => {
    const r = between('U', undefined);
    expect(r > 'U').toBe(true);
  });

  it('prepends before an endpoint when prev is undefined', () => {
    const r = between(undefined, 'U');
    expect(r < 'U').toBe(true);
  });

  it('handles many successive midpoint insertions without collision', () => {
    let lo = 'A';
    const hi = 'B';
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = between(lo, hi);
      expect(r > lo).toBe(true);
      expect(r < hi).toBe(true);
      expect(seen.has(r)).toBe(false);
      seen.add(r);
      lo = r;
    }
  });

  it('throws on out-of-order endpoints', () => {
    expect(() => between('Z', 'A')).toThrow();
  });

  it('sequence produces monotonically increasing ranks', () => {
    const ranks = sequence(10, INITIAL_RANK);
    for (let i = 1; i < ranks.length; i++) {
      const current = ranks[i];
      const previous = ranks[i - 1];
      if (!current || !previous) throw new Error('missing rank in sequence');
      expect(current > previous).toBe(true);
    }
  });
});
