import type { DriveCreateInput } from '@notdrive/shared';
import { db, schema } from '../db/index.js';
import { now } from '../util/ids.js';
import { DRIVE_FILE_FIELDS } from './cache.js';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { invalidateTreeCache } from './tree.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Create a new file in the user's Google Drive. Supports every Google-native
 * file type (Doc, Sheet, Slides, Drawing, Form, Script, Site, Folder).
 *
 * The new file is also upserted into `drive_file_cache` so the next /drive/tree
 * render picks it up without waiting for the 60s change poll.
 */
export async function createDriveFile(
  userId: string,
  workspaceId: string,
  input: DriveCreateInput,
) {
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.files.create({
      requestBody: {
        name: input.name,
        mimeType: input.mime_type,
        ...(input.parent_folder_id ? { parents: [input.parent_folder_id] } : {}),
      },
      fields: DRIVE_FILE_FIELDS,
      supportsAllDrives: true,
    }),
  );
  const f = res.data;
  const driveFileId = f.id;
  if (!driveFileId) throw new Error('Drive file create did not return a file id');
  const ts = now();
  const modified = f.modifiedTime ? Date.parse(f.modifiedTime) : ts;

  // Populate the cache so future list / preview reads are instant.
  await db
    .insert(schema.drive_file_cache)
    .values({
      drive_file_id: driveFileId,
      workspace_id: workspaceId,
      name: f.name ?? input.name,
      mime_type: f.mimeType ?? input.mime_type,
      icon_link: f.iconLink ?? null,
      thumbnail_link: f.thumbnailLink ?? null,
      web_view_link: f.webViewLink ?? null,
      modified_time: modified,
      trashed: false,
      raw: JSON.stringify(f),
      fetched_at: ts,
    })
    .onConflictDoUpdate({
      target: [schema.drive_file_cache.drive_file_id, schema.drive_file_cache.workspace_id],
      set: {
        name: f.name ?? input.name,
        mime_type: f.mimeType ?? input.mime_type,
        icon_link: f.iconLink ?? null,
        thumbnail_link: f.thumbnailLink ?? null,
        web_view_link: f.webViewLink ?? null,
        modified_time: modified,
        trashed: false,
        raw: JSON.stringify(f),
        fetched_at: ts,
      },
    });

  // Drive tree cache is stale now; drop it so the UI refetches.
  invalidateTreeCache(userId);

  return {
    drive_file_id: driveFileId,
    name: f.name ?? input.name,
    mime_type: f.mimeType ?? input.mime_type,
    web_view_link: f.webViewLink ?? null,
    is_folder: (f.mimeType ?? input.mime_type) === FOLDER_MIME,
  };
}

export function isFolderMime(mime: string): boolean {
  return mime === FOLDER_MIME;
}
