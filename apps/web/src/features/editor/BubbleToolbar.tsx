import { BubbleMenu, type Editor } from '@tiptap/react';
import { Bold, Code, Italic, Strikethrough } from 'lucide-react';

interface Props {
  editor: Editor | null;
}

/**
 * Floating formatting toolbar that appears when text is selected.
 *
 * TipTap's StarterKit already binds the keyboard shortcuts (Cmd+B for bold,
 * Cmd+I italic, Cmd+Shift+X strikethrough, Cmd+E inline code) — this just
 * exposes them in a visible UI so the formatting commands are discoverable
 * without memorising the shortcuts.
 */
export function BubbleToolbar({ editor }: Props) {
  if (!editor) return null;

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 100, placement: 'top' }}
      // Don't render the toolbar over empty selections (caret with no range)
      // or over images / horizontal rules where text formatting is meaningless.
      shouldShow={({ editor, from, to }) => {
        if (from === to) return false;
        if (editor.isActive('image')) return false;
        if (editor.isActive('horizontalRule')) return false;
        return true;
      }}
      className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-md"
    >
      <ToolbarButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        title="Bold (⌘B)"
      >
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        title="Italic (⌘I)"
      >
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        title="Strikethrough (⌘⇧X)"
      >
        <Strikethrough className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
        title="Inline code (⌘E)"
      >
        <Code className="size-3.5" />
      </ToolbarButton>
    </BubbleMenu>
  );
}

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex size-7 items-center justify-center rounded transition ${
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
