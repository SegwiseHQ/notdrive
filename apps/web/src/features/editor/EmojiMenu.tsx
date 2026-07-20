import { forwardRef, useImperativeHandle } from 'react';
import type { EmojiSuggestionItem } from './emojiSuggestions.js';

interface Props {
  items: EmojiSuggestionItem[];
  command: (item: EmojiSuggestionItem) => void;
}

export const EmojiMenu = forwardRef<{ onKeyDown: (event: KeyboardEvent) => boolean }, Props>(
  ({ items, command }, ref) => {
    const item = items[0];

    useImperativeHandle(ref, () => ({
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || !item) return false;
        command(item);
        return true;
      },
    }));

    if (!item) return null;

    return (
      <div className="w-72 rounded-md border border-border bg-card p-1 shadow-lg">
        <button
          type="button"
          onClick={() => command(item)}
          className="flex w-full items-center gap-3 rounded bg-muted px-2 py-1.5 text-left text-sm transition hover:bg-muted/70"
        >
          <span
            className="flex size-8 shrink-0 items-center justify-center text-xl"
            aria-hidden="true"
          >
            {item.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">Convert to {item.emoji}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {item.emoticon} · {item.label}
            </span>
          </span>
          <span className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Enter
          </span>
        </button>
      </div>
    );
  },
);
EmojiMenu.displayName = 'EmojiMenu';
