import { useEffect } from 'react';

/** Suffix every tab title carries, and the fallback when a page has no name. */
export const APP_NAME = 'NotDrive';

/**
 * Build the `<title>` string for a page. Keeps the page's own name first so
 * it survives the browser truncating a narrow tab, with the app name trailing
 * for context. Blank / unknown names fall back to the bare app name rather
 * than rendering a lonely separator.
 */
export function formatDocumentTitle(title: string | null | undefined): string {
  const trimmed = title?.trim();
  return trimmed ? `${trimmed} · ${APP_NAME}` : APP_NAME;
}

/**
 * Keeps `document.title` in sync with the heading the page is showing, so tab
 * names read "Sprint 71 · NotDrive" instead of every tab saying "NotDrive".
 *
 * Pass the same string the page renders as its h1. Pass null/undefined while
 * the name is still loading — the tab shows the app name until it arrives.
 * On unmount the title resets, so a route that forgets to call this doesn't
 * inherit the previous page's name.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
