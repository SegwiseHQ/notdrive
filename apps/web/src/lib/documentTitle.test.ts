import { describe, expect, it } from 'vitest';
import { APP_NAME, formatDocumentTitle } from './documentTitle.js';

describe('formatDocumentTitle', () => {
  it('puts the page name ahead of the app name', () => {
    expect(formatDocumentTitle('Sprint 71')).toBe(`Sprint 71 · ${APP_NAME}`);
  });

  it('trims surrounding whitespace', () => {
    expect(formatDocumentTitle('  Sprint 71  ')).toBe(`Sprint 71 · ${APP_NAME}`);
  });

  it('falls back to the app name when there is no page name', () => {
    expect(formatDocumentTitle(null)).toBe(APP_NAME);
    expect(formatDocumentTitle(undefined)).toBe(APP_NAME);
    expect(formatDocumentTitle('')).toBe(APP_NAME);
    expect(formatDocumentTitle('   ')).toBe(APP_NAME);
  });
});
