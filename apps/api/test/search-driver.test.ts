import { parseQuery } from '@notdrive/shared';
import { describe, expect, it } from 'vitest';
import { ftsTermsFromAst } from '../src/search/driver.js';

describe('ftsTermsFromAst', () => {
  it('extracts text terms across AND/OR/NOT trees', () => {
    const ast = parseQuery('"quarterly report" OR draft AND NOT tag:archived');
    const terms = ftsTermsFromAst(ast);
    expect(terms).toContain('quarterly report');
    expect(terms).toContain('draft');
  });

  it('ignores structured terms', () => {
    const ast = parseQuery('tag:ads modified:<7d is:favorite mime:pdf in:design');
    expect(ftsTermsFromAst(ast)).toEqual([]);
  });
});
