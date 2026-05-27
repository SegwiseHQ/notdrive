import type { DriveTreeNode } from '@notdrive/shared';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { mapFileToNode } from './mappers.js';

/**
 * List files in the user's Drive trash. Only files they own (otherwise
 * `restoreFromTrash` wouldn't work anyway).
 */
export async function listTrashedDriveFiles(
  userId: string,
  limit = 100,
): Promise<DriveTreeNode[]> {
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.files.list({
      q: "trashed = true and 'me' in owners",
      fields: 'files(id,name,mimeType,modifiedTime)',
      pageSize: Math.min(limit, 200),
      orderBy: 'modifiedTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }),
  );
  return (res.data.files ?? []).map(mapFileToNode);
}
