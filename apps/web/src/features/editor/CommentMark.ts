import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * TipTap Mark wrapping text anchored to an inline comment thread.
 *
 * The marked text travels with the document — edits, copy-paste, and
 * undo/redo all preserve the `threadId` attribute. We do NOT store
 * absolute character offsets anywhere; the mark IS the anchor.
 *
 * Wire format (parse + render):
 *   <span data-thread-id="abc123">commented text</span>
 *
 * `inclusive: false` means typing immediately after a comment doesn't
 * silently extend the comment range — that would let a user accidentally
 * "comment" on text they just typed.
 *
 * No keyboard shortcut. Created via the imperative `setMark('comment',
 * { threadId })` from CommentsPanel after the server returns the new
 * thread id; removed automatically when the marked text is deleted.
 */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    commentMark: {
      setCommentMark: (threadId: string) => ReturnType;
      unsetCommentMark: () => ReturnType;
    };
  }
}

export const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '', // can overlap with other marks (bold, italic, etc.)
  // Allow stacking — two overlapping selections can both have a comment.
  // Without this, applying a comment over an existing one removes the prior.
  // The renderer still produces one <span> per applied mark.
  // (Default is to merge same-name marks; we accept the duplication.)

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-thread-id'),
        renderHTML: (attrs) =>
          attrs.threadId ? { 'data-thread-id': attrs.threadId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-thread-id]',
        // Reject empty thread ids so stray attributes don't accidentally
        // promote arbitrary spans into comment anchors.
        getAttrs: (node) => {
          const id = (node as HTMLElement).getAttribute('data-thread-id');
          return id && id.length > 0 ? { threadId: id } : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class:
          'rounded-sm bg-yellow-200/40 dark:bg-yellow-700/30 cursor-pointer hover:bg-yellow-200/70 dark:hover:bg-yellow-700/50 transition-colors',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCommentMark:
        (threadId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { threadId }),
      unsetCommentMark:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
