import { describe, expect, it } from 'vitest';
import { QueryParseError, collectTerms, parseQuery, resolveModifiedToEpochMs } from '../src/query.js';

describe('parseQuery', () => {
  it('parses a mixed query', () => {
    const ast = parseQuery('tag:ads AND modified:<7d NOT is:archived "quarterly report"');
    const terms = collectTerms(ast);
    expect(terms).toHaveLength(4);
    expect(terms[0]).toEqual({ kind: 'tag', name: 'ads' });
    expect(terms[1]).toMatchObject({ kind: 'modified', op: '<' });
    expect(terms[2]).toEqual({ kind: 'is', flag: 'archived' });
    expect(terms[3]).toEqual({ kind: 'text', value: 'quarterly report', phrase: true });
  });

  it('defaults AND between adjacent terms', () => {
    const ast = parseQuery('foo bar');
    expect(ast.kind).toBe('and');
  });

  it('handles OR and parens', () => {
    const ast = parseQuery('(tag:a OR tag:b) AND mime:pdf');
    expect(ast.kind).toBe('and');
  });

  it('accepts is: variants', () => {
    for (const flag of ['favorite', 'archived', 'page', 'file']) {
      const terms = collectTerms(parseQuery(`is:${flag}`));
      expect(terms).toEqual([{ kind: 'is', flag }]);
    }
  });

  it('rejects unknown keys', () => {
    expect(() => parseQuery('nope:foo')).toThrow(QueryParseError);
  });

  it('rejects invalid modified values', () => {
    expect(() => parseQuery('modified:soon')).toThrow(QueryParseError);
  });

  it('empty input returns empty AST', () => {
    expect(parseQuery('').kind).toBe('empty');
  });

  it('resolveModifiedToEpochMs handles relative days', () => {
    const now = 1_700_000_000_000;
    const ms = resolveModifiedToEpochMs({ kind: 'relative_days', days: 7 }, now);
    expect(ms).toBe(now - 7 * 86_400_000);
  });

  it('resolveModifiedToEpochMs handles iso dates', () => {
    const ms = resolveModifiedToEpochMs({ kind: 'date', iso: '2026-04-20' });
    expect(Number.isFinite(ms)).toBe(true);
  });
});
