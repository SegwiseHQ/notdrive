import type { Editor, Range } from '@tiptap/core';
import {
  CalendarDays,
  Check,
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Text,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { toast } from 'sonner';
import { apiOrigin, http } from '../../lib/http.js';

export interface SlashItem {
  title: string;
  description: string;
  keywords?: string[];
  Icon: React.ComponentType<{ className?: string }>;
  // `itemId` is plumbed in by the SlashCommand extension; commands that need
  // server-side state (uploads, mutations) use it.
  command: (args: { editor: Editor; range: Range; itemId?: string }) => void;
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Text',
    description: 'Plain paragraph',
    keywords: ['p', 'paragraph', 'text'],
    Icon: Text,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('paragraph').run(),
  },
  {
    title: 'Heading 1',
    description: 'Big section heading',
    keywords: ['h1', 'title'],
    Icon: Heading1,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    keywords: ['h2'],
    Icon: Heading2,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    keywords: ['h3'],
    Icon: Heading3,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    title: 'Bulleted list',
    description: 'Unordered list',
    keywords: ['ul', 'bullet', 'list'],
    Icon: List,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: 'Numbered list',
    description: 'Ordered list',
    keywords: ['ol', 'ordered', 'number'],
    Icon: ListOrdered,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: 'To-do',
    description: 'Checkboxes',
    keywords: ['task', 'todo', 'checkbox'],
    Icon: CheckSquare,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    title: 'Quote',
    description: 'Blockquote',
    keywords: ['blockquote'],
    Icon: Quote,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: 'Code block',
    description: 'Fenced code',
    keywords: ['code', 'pre'],
    Icon: Code,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    keywords: ['hr', 'rule', 'line'],
    Icon: Minus,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: 'Today',
    description: "Insert today's date",
    keywords: ['date', 'today', 'now', 'time'],
    Icon: CalendarDays,
    command: ({ editor, range }) => {
      const today = new Date().toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      // Trailing space so the caret leaves the inserted text cleanly.
      editor.chain().focus().deleteRange(range).insertContent(`${today} `).run();
    },
  },
  {
    title: 'Image',
    description: 'Upload an image from your computer',
    keywords: ['img', 'image', 'photo', 'picture', 'upload'],
    Icon: ImageIcon,
    command: ({ editor, range, itemId }) => {
      if (!itemId) {
        toast.error('Cannot upload — page is still saving. Try again in a moment.');
        return;
      }
      // Strip the "/image" trigger immediately so the placeholder doesn't
      // sit in the editor while the file picker is open / upload runs.
      editor.chain().focus().deleteRange(range).run();

      // Programmatic file picker — avoids needing a permanent <input>.
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const uploadingId = toast.loading('Uploading image…');
        try {
          const { url } = await http.uploadItemAsset(itemId, file);
          // url is relative to the API origin; need an absolute URL for <img>.
          const absolute = `${apiOrigin()}${url}`;
          editor.chain().focus().setImage({ src: absolute }).run();
          toast.success('Image inserted', { id: uploadingId });
        } catch (err) {
          toast.error(`Upload failed: ${(err as Error).message}`, { id: uploadingId });
        }
      };
      input.click();
    },
  },
];

interface Props {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<{ onKeyDown: (e: KeyboardEvent) => boolean }, Props>(
  ({ items, command }, ref) => {
    const [selected, setSelected] = useState(0);

    useEffect(() => {
      setSelected(0);
    }, [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          setSelected((s) => (s + 1) % Math.max(items.length, 1));
          return true;
        }
        if (e.key === 'ArrowUp') {
          setSelected((s) => (s - 1 + items.length) % Math.max(items.length, 1));
          return true;
        }
        if (e.key === 'Enter') {
          const item = items[selected];
          if (item) command(item);
          return true;
        }
        return false;
      },
    }));

    if (items.length === 0) {
      return (
        <div className="w-64 rounded-md border border-border bg-card p-2 text-xs text-muted-foreground shadow-lg">
          No matches
        </div>
      );
    }

    return (
      <div className="w-72 max-h-80 overflow-auto rounded-md border border-border bg-card p-1 shadow-lg">
        {items.map((item, i) => (
          <button
            key={item.title}
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(i)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition ${
              i === selected ? 'bg-muted' : 'hover:bg-muted/70'
            }`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
              <item.Icon className="size-4 text-muted-foreground" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            </span>
            {i === selected && <Check className="size-3 text-muted-foreground" />}
          </button>
        ))}
      </div>
    );
  },
);
SlashMenu.displayName = 'SlashMenu';
