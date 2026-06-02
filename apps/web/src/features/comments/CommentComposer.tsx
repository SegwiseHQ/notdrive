import { useCallback, useEffect, useRef, useState } from 'react';
import { MentionMenu, type MentionItem } from '../editor/MentionMenu.js';
import { encodeMention } from './mentions.js';

interface Props {
  members: MentionItem[];
  onSubmit: (body: string) => void | Promise<void>;
  busy?: boolean;
  /** Prefill (used when editing). */
  initial?: string;
  /** Label for the submit button. */
  submitLabel?: string;
  /** Render Cancel button next to Submit. */
  onCancel?: () => void;
}

/**
 * Plain-text composer with an inline @-mention picker. The textarea stores
 * the raw wire format (`@[label](user_id)`) — the server parses these tokens
 * on create to fan out notifications. Display rendering happens in CommentList,
 * not here.
 *
 * The mention popup is a plain absolutely-positioned div rather than a Tippy
 * mount because we don't need the editor's caret-tracking machinery — the
 * trigger position is "end of textarea" which is good enough for a small
 * single-line popup at the bottom of the composer.
 */
export function CommentComposer({
  members,
  onSubmit,
  busy,
  initial = '',
  submitLabel = 'Comment',
  onCancel,
}: Props) {
  const [text, setText] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // Mention state. `triggerIndex` is the offset of the `@` that opened the
  // popup; null means the popup is closed.
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  // Auto-resize the textarea up to ~10 lines.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [text]);

  const closePopup = useCallback(() => {
    setTriggerIndex(null);
    setQuery('');
  }, []);

  const filtered = (() => {
    if (triggerIndex == null) return [];
    const q = query.toLowerCase();
    if (!q) return members.slice(0, 8);
    return members
      .filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
      .slice(0, 8);
  })();

  const insertMention = useCallback(
    (item: MentionItem) => {
      if (triggerIndex == null) return;
      const ta = taRef.current;
      if (!ta) return;
      const caret = ta.selectionStart ?? text.length;
      const before = text.slice(0, triggerIndex);
      const after = text.slice(caret);
      const mention = encodeMention(item);
      const next = `${before}${mention} ${after}`;
      setText(next);
      closePopup();
      // Restore focus + caret to right after the inserted mention.
      requestAnimationFrame(() => {
        ta.focus();
        const pos = before.length + mention.length + 1;
        ta.setSelectionRange(pos, pos);
      });
    },
    [closePopup, text, triggerIndex],
  );

  const menuRef = useRef<{ onKeyDown: (e: KeyboardEvent) => boolean } | null>(null);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);

    const caret = e.target.selectionStart ?? v.length;
    // Walk left from the caret to find an `@` that isn't preceded by a word
    // character — that's the trigger boundary. Stop on whitespace.
    let i = caret - 1;
    let q: string | null = null;
    while (i >= 0) {
      const ch = v[i];
      if (ch === '@') {
        const prev = i > 0 ? v[i - 1] : '';
        if (!prev || /[\s(]/.test(prev)) {
          q = v.slice(i + 1, caret);
        }
        break;
      }
      if (!ch || /\s/.test(ch)) break;
      i--;
    }
    if (q != null && !q.includes('\n') && q.length <= 30) {
      setTriggerIndex(i);
      setQuery(q);
    } else {
      closePopup();
    }
  };

  const submit = async () => {
    const body = text.trim();
    if (!body || busy) return;
    await onSubmit(body);
    setText('');
    closePopup();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Let the mention menu handle arrow/enter while it's open.
    if (triggerIndex != null && filtered.length > 0 && menuRef.current) {
      const handled = menuRef.current.onKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
        return;
      }
    }
    if (triggerIndex != null && e.key === 'Escape') {
      e.preventDefault();
      closePopup();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Write a comment… Use @ to mention. ⌘+Enter to send."
        rows={2}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          className="rounded-md bg-foreground px-3 py-1 text-xs font-medium text-background hover:opacity-90 disabled:opacity-40"
        >
          {busy ? 'Sending…' : submitLabel}
        </button>
      </div>
      {triggerIndex != null && filtered.length > 0 && (
        <div className="absolute left-2 bottom-full mb-1 z-10">
          <MentionMenu
            ref={menuRef}
            items={filtered}
            command={(item) => {
              const matched = filtered.find((m) => m.id === item.id);
              if (matched) insertMention(matched);
            }}
          />
        </div>
      )}
    </div>
  );
}
