import type { Editor, JSONContent, Range } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { toast } from 'sonner';
import { http } from '../../lib/http.js';
import { resolveItemAssetUrl } from '../../lib/itemAssets.js';

export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

export function imageFiles(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => IMAGE_MIME_TYPES.includes(file.type));
}

const UPLOAD_INSERT = 'uploadInsert';
let nextUploadSeq = 0;

export interface PendingRange extends Range {
  isPoint: boolean;
  /** Paste order, so images pasted at one caret keep that order whichever upload ends first. */
  seq: number;
  /** Set by the editor's setBody (Refresh): the range no longer points into the page. */
  cancelled?: boolean;
}

/**
 * Keeps pending upload ranges in step with the document. Plugin state sees every
 * transaction, including ones other plugins append (e.g. paste rules).
 */
export function trackUploadRanges(pending: Set<PendingRange>): Plugin {
  return new Plugin({
    key: new PluginKey('uploadRanges'),
    state: {
      init: () => null,
      apply(tr) {
        // A caret point stays before text typed at it and before images of earlier
        // pastes, but moves past images of later pastes inserted at the same point.
        const insertedSeq: number | undefined = tr.getMeta(UPLOAD_INSERT);
        for (const range of pending) {
          if (range.isPoint) {
            const assoc = insertedSeq !== undefined && range.seq > insertedSeq ? 1 : -1;
            range.from = tr.mapping.map(range.from, assoc);
            range.to = range.from;
          } else {
            // A selection grows over neither text typed before it nor after it.
            range.from = tr.mapping.map(range.from, 1);
            range.to = Math.max(range.from, tr.mapping.map(range.to, -1));
          }
        }
        return null;
      },
    },
  });
}

/**
 * Uploads `files` in order, then inserts the images over `range`, captured when
 * the user acted. The range follows edits made during the uploads, is replaced
 * only if an upload succeeds, and the user's cursor stays put.
 */
export async function uploadAndInsertImages(
  editor: Editor,
  itemId: string | undefined,
  files: File[],
  range: Range,
): Promise<void> {
  if (!itemId) {
    toast.error('Cannot upload — page is still saving. Try again in a moment.');
    return;
  }
  const target: PendingRange = {
    ...range,
    isPoint: range.from === range.to,
    seq: nextUploadSeq++,
  };
  // The PasteAndDrop extension owns this set and maps it with trackUploadRanges.
  const pending: Set<PendingRange> = editor.storage.pasteAndDrop.pendingUploads;
  pending.add(target);
  const images: JSONContent[] = [];
  const uploadedToasts: Array<string | number> = [];
  try {
    for (const file of files) {
      if (editor.isDestroyed) break;
      const uploadingId = toast.loading('Uploading image…');
      try {
        const { url } = await http.uploadItemAsset(itemId, file);
        // The API returns a portable relative URL; render it from the API
        // origin because production web hosting does not proxy asset paths.
        images.push({ type: 'image', attrs: { src: resolveItemAssetUrl(url) } });
        uploadedToasts.push(uploadingId);
      } catch (err) {
        toast.error(`Upload failed: ${(err as Error).message}`, { id: uploadingId });
      }
    }
  } finally {
    pending.delete(target);
  }
  // The user left the page or reloaded its content during the upload; there is nowhere to insert.
  if (editor.isDestroyed || target.cancelled) {
    for (const id of uploadedToasts) toast.dismiss(id);
    return;
  }
  if (images.length > 0) {
    editor
      .chain()
      .setMeta(UPLOAD_INSERT, target.seq)
      .insertContentAt({ from: target.from, to: target.to }, images, { updateSelection: false })
      .run();
  }
  for (const id of uploadedToasts) toast.success('Image inserted', { id });
}
