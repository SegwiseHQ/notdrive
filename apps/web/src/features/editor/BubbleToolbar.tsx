import { BubbleMenu, type Editor } from '@tiptap/react';
import { Bold, Code, Italic, MessageSquarePlus, Strikethrough } from 'lucide-react';

interface Props {
  editor: Editor | null;
  /**
   * Fired when the user clicks "Comment" with a non-empty selection.
   * Carries the absolute character range + the plain text inside it so the
   * parent can open the comments drawer with a pre-filled anchor preview.
   */
  onComment?: (selection: { from: number; to: number; text: string }) => void;
}

/**
 * Floating formatting toolbar that appears when text is selected.
 *
 * TipTap's StarterKit already binds the keyboard shortcuts (Cmd+B for bold,
 * Cmd+I italic, Cmd+Shift+X strikethrough, Cmd+E inline code) — this just
 * exposes them in a visible UI so the formatting commands are discoverable
 * without memorising the shortcuts.
 */
export function BubbleToolbar({ editor, onComment }: Props) {
  if (!editor) return null;

  const triggerComment = () => {
    const { from, to } = editor.state.selection;
    if (from === to) return;
    // .textBetween joins block boundaries with a separator — use a single
    // space so paragraph breaks inside the selection become readable
    // anchor previews instead of slamming words together.
    const text = editor.state.doc.textBetween(from, to, ' ');
    if (!text.trim()) return;
    onComment?.({ from, to, text });
  };

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
      {onComment && (
        <>
          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
          <ToolbarButton active={false} onClick={triggerComment} title="Comment">
            <MessageSquarePlus className="size-3.5" />
          </ToolbarButton>
        </>
      )}
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
