import { looksLikeMarkdown, markdownToHtml } from '@notdrive/shared';
import { Extension, type Range } from '@tiptap/core';
import { DOMParser, Slice } from '@tiptap/pm/model';
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import {
  type PendingRange,
  imageFiles,
  trackUploadRanges,
  uploadAndInsertImages,
} from './imageUpload.js';

const RICH_HTML =
  /<(a|b|strong|em|i|u|ul|ol|li|table|h[1-6]|blockquote|img|pre|code)[\s>]|data-pm-slice/i;

interface PasteAndDropOptions {
  getItemId: () => string | undefined;
}

function vscodeLanguage(data: string | undefined): string | undefined {
  try {
    return data ? JSON.parse(data).mode : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where image uploads go: the drop point or the selection, the anchor cell for a
 * multi-cell selection (its from/to spans unselected cells), and after a code
 * block rather than splitting it.
 */
function imageRange(state: EditorState, dropPos?: number): Range {
  const { selection } = state;
  let range: Range = { from: selection.from, to: selection.to };
  if (dropPos !== undefined) range = { from: dropPos, to: dropPos };
  else if (selection instanceof CellSelection) {
    const anchor = selection.$anchorCell.pos + 1;
    range = { from: anchor, to: anchor };
  }
  const $from = state.doc.resolve(range.from);
  if ($from.parent.type.name !== 'codeBlock') return range;
  const after = $from.after();
  return { from: after, to: after };
}

/** Formats pasted markdown and uploads pasted or dropped image files. */
export const PasteAndDrop = Extension.create<
  PasteAndDropOptions,
  { pendingUploads: Set<PendingRange> }
>({
  name: 'pasteAndDrop',
  // Run before CodeBlock's paste handler, which would wrap VS Code markdown in a code block.
  priority: 1000,

  addOptions() {
    return { getItemId: () => undefined };
  },

  addStorage() {
    return { pendingUploads: new Set<PendingRange>() };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;
    // ClipboardEvent has no shiftKey, so track it to keep Cmd+Shift+V a plain-text paste.
    let shiftHeld = false;

    const upload = (files: File[], range: Range) =>
      void uploadAndInsertImages(editor, options.getItemId(), files, range);

    return [
      trackUploadRanges(this.storage.pendingUploads),
      new Plugin({
        key: new PluginKey('pasteAndDrop'),
        props: {
          handleDOMEvents: {
            keydown: (_view, event) => {
              // Shift+Insert is a normal paste shortcut, not paste-as-plain-text.
              shiftHeld = event.shiftKey && event.key !== 'Insert';
              return false;
            },
            keyup: (_view, event) => {
              if (event.key === 'Shift') shiftHeld = false;
              return false;
            },
            blur: () => {
              shiftHeld = false;
              return false;
            },
          },
          handlePaste: (view, event) => {
            const clipboard = event.clipboardData;
            const text = clipboard?.getData('text/plain') ?? '';
            const html = clipboard?.getData('text/html') ?? '';
            // Office apps put a rendered PNG next to their HTML and text; the file wins
            // only when one is missing (screenshot, Finder copy, browser "Copy image").
            const files = html && text ? [] : imageFiles(clipboard?.files);
            if (files.length > 0) {
              upload(files, imageRange(view.state));
              return true;
            }
            if (editor.isActive('codeBlock')) return false;
            // VS Code names the copied file's language; CodeBlock turns non-markdown into code.
            const vscodeMode = vscodeLanguage(clipboard?.getData('vscode-editor-data'));
            // When we skip conversion, CodeBlock would still wrap VS Code markdown in a
            // code block; ProseMirror's plain-text paste keeps it as plain text instead.
            const skip = () => {
              if (vscodeMode !== 'markdown') return false;
              view.pasteText(text);
              return true;
            };
            // The table plugin fills a multi-cell selection; markdown cannot.
            if (shiftHeld || view.state.selection instanceof CellSelection) return skip();
            if (vscodeMode && vscodeMode !== 'markdown') return false;
            // Rich HTML (Word, browsers, code from web pages, NotDrive itself) pastes as
            // usual. VS Code sends only styled div/span, which we drop for the markdown text.
            if (RICH_HTML.test(html)) return false;
            // A copy from a VS Code markdown file is markdown even without strong signals.
            if (vscodeMode !== 'markdown' && !looksLikeMarkdown(text)) return false;
            try {
              const dom = document.createElement('div');
              dom.innerHTML = markdownToHtml(text, { paste: true });
              // A full parse fills required nodes, such as the paragraph in an empty cell.
              const { content } = DOMParser.fromSchema(view.state.schema).parse(dom);
              // Nested tables are not wanted; inside a table, a pasted table stays plain text.
              let hasTable = false;
              content.descendants((node) => {
                if (node.type.name === 'table') hasTable = true;
                return !hasTable;
              });
              if (hasTable && editor.isActive('table')) return skip();
              // Open only edge paragraphs, so inline markdown joins the current paragraph
              // while headings, lists and code stay whole blocks. A plain transaction
              // (not a paste) keeps TipTap paste rules off the parsed content.
              const slice = new Slice(
                content,
                content.firstChild?.type.name === 'paragraph' ? 1 : 0,
                content.lastChild?.type.name === 'paragraph' ? 1 : 0,
              );
              view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
            } catch (err) {
              console.error('Markdown paste failed', err);
              return skip();
            }
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false;
            const files = imageFiles(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
            upload(files, imageRange(view.state, pos));
            return true;
          },
        },
      }),
    ];
  },
});
