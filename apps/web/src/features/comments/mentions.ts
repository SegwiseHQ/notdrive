import type { MentionItem } from '../editor/MentionMenu.js';

// Wire format for stored mentions. Mirrors the server-side regex in
// apps/api/src/services/comments.ts so mention fan-out and rendering stay
// in sync. Changing this requires migrating existing comment bodies.
const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

export interface MentionToken {
  kind: 'mention';
  label: string;
  userId: string;
}

export interface TextToken {
  kind: 'text';
  text: string;
}

export type CommentToken = MentionToken | TextToken;

/** Split a comment body into a stream of text + mention tokens for rendering. */
export function tokenizeCommentBody(body: string): CommentToken[] {
  const tokens: CommentToken[] = [];
  let last = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    if (start > last) tokens.push({ kind: 'text', text: body.slice(last, start) });
    tokens.push({ kind: 'mention', label: m[1] ?? '', userId: m[2] ?? '' });
    last = start + m[0].length;
  }
  if (last < body.length) tokens.push({ kind: 'text', text: body.slice(last) });
  return tokens;
}

/** Encode a mention pick for storage as `@[label](user_id)`. */
export function encodeMention(item: MentionItem): string {
  return `@[${item.label}](${item.id})`;
}
