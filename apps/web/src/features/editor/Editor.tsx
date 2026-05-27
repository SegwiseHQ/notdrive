import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { SlashCommand } from './slashCommand.js';

interface EditorProps {
  initialBody: string | null;
  onChange: (body: string) => void;
}

/**
 * Block editor with Notion-style "/" command menu. Serializes to HTML.
 *
 * The editor is the source of truth once mounted — `initialBody` seeds it
 * once at mount. We deliberately do NOT sync from `initialBody` on later
 * renders. Doing so created a race: a save fires, the server response
 * invalidates the query, the parent re-renders with the saved body, and the
 * resulting `setContent` clobbered whatever the user typed in between.
 *
 * Navigation between pages remounts this component via `key={item.id}` in
 * the parent, so we still pick up fresh content for new pages without
 * needing a runtime sync.
 */
export function PageEditor({ initialBody, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Heading';
          return "Type '/' for commands";
        },
      }),
      SlashCommand,
    ],
    content: initialBody ?? '',
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[40vh] [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:text-muted-foreground [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:h-0 [&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:p-0 [&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:gap-2 [&_ul[data-type=taskList]_li>label]:mt-1.5',
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  return <EditorContent editor={editor} />;
}
