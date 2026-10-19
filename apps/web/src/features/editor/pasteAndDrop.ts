import { Extension, type Range } from '@tiptap/core';
import { type EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import {
  type PendingRange,
  imageFiles,
  trackUploadRanges,
  uploadAndInsertImages,
} from './imageUpload.js';

interface PasteAndDropOptions {
  getItemId: () => string | undefined;
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

/** Uploads pasted or dropped image files. */
export const PasteAndDrop = Extension.create<
  PasteAndDropOptions,
  { pendingUploads: Set<PendingRange> }
>({
  name: 'pasteAndDrop',

  addOptions() {
    return { getItemId: () => undefined };
  },

  addStorage() {
    return { pendingUploads: new Set<PendingRange>() };
  },

  addProseMirrorPlugins() {
    const { editor, options } = this;

    const upload = (files: File[], range: Range) =>
      void uploadAndInsertImages(editor, options.getItemId(), files, range);

    return [
      trackUploadRanges(this.storage.pendingUploads),
      new Plugin({
        key: new PluginKey('pasteAndDrop'),
        props: {
          handlePaste: (view, event) => {
            const clipboard = event.clipboardData;
            const text = clipboard?.getData('text/plain') ?? '';
            const html = clipboard?.getData('text/html') ?? '';
            // Office apps put a rendered PNG next to their HTML and text; the file wins
            // only when one is missing (screenshot, Finder copy, browser "Copy image").
            const files = html && text ? [] : imageFiles(clipboard?.files);
            if (files.length === 0) return false;
            upload(files, imageRange(view.state));
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
