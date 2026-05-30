import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useRef } from 'react';
import { SlashCommand } from './slashCommand.js';
import { buildMentionExtension } from './mentionExtension.js';
import type { MentionItem } from './MentionMenu.js';

interface EditorProps {
  initialBody: string | null;
  onChange: (body: string) => void;
  /**
   * Workspace members for @ mentions. Pass an empty array when the list
   * isn't loaded yet — the popup will say "No workspace members match".
   * The ref-based getter inside the extension always reads the latest value,
   * so re-renders with a populated list update automatically.
   */
  members?: MentionItem[];
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
export function PageEditor({ initialBody, onChange, members = [] }: EditorProps) {
  // Mutable ref so the mention extension always sees the latest member list
  // without rebuilding the editor when members load asynchronously.
  const membersRef = useRef(members);
  membersRef.current = members;

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
      buildMentionExtension(() => membersRef.current),
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
