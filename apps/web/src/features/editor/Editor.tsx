import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { BubbleToolbar } from './BubbleToolbar.js';
import { SlashCommand } from './slashCommand.js';
import { buildMentionExtension } from './mentionExtension.js';
import type { MentionItem } from './MentionMenu.js';

// Built outside the component so the language registry is created once. The
// `common` set bundles ~35 popular languages (JS/TS, Python, Go, Rust, Java,
// C/C++, JSON, HTML, CSS, Bash, SQL, YAML, Markdown, Ruby, PHP, etc.) — good
// trade-off between bundle size and coverage.
const lowlight = createLowlight(common);

interface EditorProps {
  initialBody: string | null;
  onChange: (body: string) => void;
  /** Item id this editor is editing — required for /image uploads. */
  itemId?: string;
  /**
   * Workspace members for @ mentions. Pass an empty array when the list
   * isn't loaded yet — the popup will say "No workspace members match".
   * The ref-based getter inside the extension always reads the latest value,
   * so re-renders with a populated list update automatically.
   */
  members?: MentionItem[];
}

/**
 * Imperative API exposed via React.forwardRef. ItemPage uses this when the
 * user clicks "Refresh" on a remote-update banner — replacing the editor's
 * content in-place avoids remounting, which previously crashed React's
 * reconciler ("removeChild" NotFoundError) because TipTap + tippy.js
 * (bubble menu, mentions) leave DOM nodes outside React's tree and the
 * cleanup order during a remount races.
 */
export interface PageEditorHandle {
  /** Replace the editor's HTML body in place. Used to accept remote updates. */
  setBody: (html: string) => void;
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
 * needing a runtime sync. Refresh-on-remote-update uses the imperative
 * `setBody` handle (above) so the editor stays mounted and TipTap's DOM
 * helpers don't race with React's unmount.
 */
export const PageEditor = forwardRef<PageEditorHandle, EditorProps>(
  function PageEditor({ initialBody, onChange, itemId, members = [] }, ref) {
    // Mutable ref so the mention extension always sees the latest member list
    // without rebuilding the editor when members load asynchronously.
    const membersRef = useRef(members);
    membersRef.current = members;

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          // Disable the built-in code-block; CodeBlockLowlight replaces it
          // with the same schema name but adds syntax highlighting.
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({
          lowlight,
          // null = auto-detect language from the content. Users can also
          // type ```js (etc.) markdown shortcuts to set the language at
          // creation time; StarterKit's input rule still fires.
          defaultLanguage: null,
          HTMLAttributes: {
            // `not-prose` opts the <pre> subtree out of @tailwindcss/typography
            // styles — otherwise prose overrides highlight.js's token colors.
            // `spellcheck=false` stops the browser from underlining code
            // identifiers as misspelled words.
            class: 'not-prose rounded-md border border-border bg-muted/30 p-3 font-mono text-[12.5px]',
            spellcheck: 'false',
          },
        }),
        // Allow inline images. The /image slash command uploads via the API
        // and inserts an <img src="/item-assets/:id"> node here.
        Image.configure({
          inline: false,
          allowBase64: false,
          HTMLAttributes: { class: 'rounded-md border border-border' },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({
          placeholder: ({ node }) => {
            if (node.type.name === 'heading') return 'Heading';
            return "Type '/' for commands";
          },
        }),
        SlashCommand.configure({ itemId }),
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

    useImperativeHandle(
      ref,
      () => ({
        setBody: (html: string) => {
          // setContent triggers onUpdate by default; pass `false` so we don't
          // immediately fire a save with the just-loaded server content.
          editor?.commands.setContent(html, false);
        },
      }),
      [editor],
    );

    return (
      <>
        <BubbleToolbar editor={editor} />
        <EditorContent editor={editor} />
      </>
    );
  },
);
