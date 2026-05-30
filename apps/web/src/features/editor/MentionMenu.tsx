import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

export interface MentionItem {
  id: string;
  label: string;
  email: string;
  avatar_url: string | null;
}

interface Props {
  items: MentionItem[];
  // TipTap's Mention extension passes `command({ id, label })` to insert
  // the mention node — see MentionExtension.ts's `command` config.
  command: (item: { id: string; label: string }) => void;
}

export const MentionMenu = forwardRef<{ onKeyDown: (e: KeyboardEvent) => boolean }, Props>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (e: KeyboardEvent) => {
        if (items.length === 0) return false;
        if (e.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % items.length);
          return true;
        }
        if (e.key === 'ArrowUp') {
          setSelected((s) => (s - 1 + items.length) % items.length);
          return true;
        }
        if (e.key === 'Enter') {
          const item = items[selected];
          if (item) command({ id: item.id, label: item.label });
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-64 rounded-md border border-border bg-card p-2 text-xs text-muted-foreground shadow-lg">
          No workspace members match
        </div>
      );
    }

    return (
      <div className="w-72 max-h-72 overflow-auto rounded-md border border-border bg-card p-1 shadow-lg">
        {items.map((item, i) => (
          <button
            key={item.id}
            onClick={() => command({ id: item.id, label: item.label })}
            onMouseEnter={() => setSelected(i)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
              i === selected ? 'bg-muted' : 'hover:bg-muted/70'
            }`}
          >
            {item.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.avatar_url}
                alt=""
                className="size-6 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                {item.label.charAt(0).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.email}</span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);
MentionMenu.displayName = 'MentionMenu';
