import type { DriveTreeNode } from '@notdrive/shared';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { mapFileToNode } from './mappers.js';

/**
 * Search the user's entire Drive by name (case-insensitive, contains).
 * Unlike the prefetched /drive/tree, this hits Drive's search index directly,
 * so depth-capped folders are reachable.
 */
export async function searchDrive(
  userId: string,
  query: string,
  limit = 50,
): Promise<DriveTreeNode[]> {
  const q = query.trim();
  if (!q) return [];

  const safe = q.replace(/'/g, "\\'");
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.files.list({
      q: `name contains '${safe}' and trashed = false`,
      fields: 'files(id,name,mimeType,modifiedTime)',
      pageSize: Math.min(limit, 100),
      orderBy: 'folder,modifiedTime desc,name',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    }),
  );

  return (res.data.files ?? []).map(mapFileToNode);
}
