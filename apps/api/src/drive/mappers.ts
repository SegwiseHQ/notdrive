import type { DriveTreeNode } from '@notdrive/shared';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Convert a Drive v3 file object to NotDrive's DriveTreeNode shape. Used by
 * any endpoint returning flat lists (search, trash) — tree endpoints fill in
 * `children` separately during traversal.
 */
export function mapFileToNode(f: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  modifiedTime?: string | null;
}): DriveTreeNode {
  if (!f.id) throw new Error('Drive file is missing id');
  return {
    id: f.id,
    name: f.name ?? '(unnamed)',
    mime_type: f.mimeType ?? 'application/octet-stream',
    is_folder: f.mimeType === FOLDER_MIME,
    modified_time: f.modifiedTime ? Date.parse(f.modifiedTime) : null,
    children: null,
  };
}

export { FOLDER_MIME };
