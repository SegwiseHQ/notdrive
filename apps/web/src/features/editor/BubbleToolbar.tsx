import type { Editor } from '@tiptap/react';
import { Bold, Code, Italic, MessageSquarePlus, Strikethrough } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import tippy, { type Instance as TippyInstance } from 'tippy.js';

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
  const onCommentRef = useRef(onComment);
  onCommentRef.current = onComment;

  useEffect(() => {
    if (!editor) return;

    const element = document.createElement('div');
    const root = createRoot(element);
    let popup: TippyInstance | null = null;
    let disposed = false;

    const shouldShow = () => {
      if (editor.isDestroyed) return false;
      if (!editor.isFocused) return false;
      const { from, to } = editor.state.selection;
      if (from === to) return false;
      if (editor.isActive('image')) return false;
      if (editor.isActive('horizontalRule')) return false;
      return true;
    };

    const getSelectionRect = () => {
      if (editor.isDestroyed) return editor.view.dom.getBoundingClientRect();
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const left = Math.min(start.left, end.left);
      const right = Math.max(start.right, end.right);
      const top = Math.min(start.top, end.top);
      const bottom = Math.max(start.bottom, end.bottom);
      return new DOMRect(left, top, right - left, bottom - top);
    };

    const triggerComment = () => {
      const { from, to } = editor.state.selection;
      if (from === to) return;
      // .textBetween joins block boundaries with a separator — use a single
      // space so paragraph breaks inside the selection become readable
      // anchor previews instead of slamming words together.
      const text = editor.state.doc.textBetween(from, to, ' ');
      if (!text.trim()) return;
      onCommentRef.current?.({ from, to, text });
    };

    const render = () => {
      root.render(
        <ToolbarContent
          editor={editor}
          onComment={onCommentRef.current ? triggerComment : undefined}
        />,
      );
    };

    const update = () => {
      if (disposed || !popup) return;
      render();
      if (!shouldShow()) {
        popup.hide();
        return;
      }
      popup.setProps({ getReferenceClientRect: getSelectionRect });
      popup.show();
    };

    popup = tippy(editor.view.dom, {
      getReferenceClientRect: getSelectionRect,
      appendTo: () => document.body,
      content: element,
      duration: 100,
      interactive: true,
      placement: 'top',
      trigger: 'manual',
    });

    render();
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    editor.on('focus', update);
    editor.on('blur', update);
    update();

    return () => {
      disposed = true;
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
      editor.off('focus', update);
      editor.off('blur', update);
      // Unmount React while tippy still owns the content element. Destroying
      // tippy first can detach/move DOM that React still believes it owns,
      // which is the removeChild crash seen during page navigation.
      root.unmount();
      popup?.destroy();
      element.remove();
    };
  }, [editor]);

  return null;
}

function ToolbarContent({
  editor,
  onComment,
}: {
  editor: Editor;
  onComment?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-md">
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
          <ToolbarButton active={false} onClick={onComment} title="Comment">
            <MessageSquarePlus className="size-3.5" />
          </ToolbarButton>
        </>
      )}
    </div>
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
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      title={title}
      className={`flex size-7 items-center justify-center rounded transition ${
        active
          ? 'bg-muted text-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}
