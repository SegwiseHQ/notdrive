import { logger } from '../util/logger.js';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { invalidateTreeCache } from './tree.js';

/**
 * Move a Drive file to the user's Drive trash (recoverable for 30 days).
 * Drive's `/changes` poll picks up the trashed flag → linked NotDrive items
 * auto-archive via the existing changes handler.
 *
 * Server-side tree cache is busted so the next GET /drive/tree call refetches
 * from Drive instead of returning a stale tree that still contains this file.
 */
export async function trashDriveFile(userId: string, fileId: string): Promise<void> {
  const drive = await driveClientFor(userId);
  await withDriveLimit(userId, () =>
    drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    }),
  );
  invalidateTreeCache(userId);
  logger.info({ fileId, userId }, 'drive file trashed');
}

export async function untrashDriveFile(userId: string, fileId: string): Promise<void> {
  const drive = await driveClientFor(userId);
  await withDriveLimit(userId, () =>
    drive.files.update({
      fileId,
      requestBody: { trashed: false },
      supportsAllDrives: true,
    }),
  );
  invalidateTreeCache(userId);
  logger.info({ fileId, userId }, 'drive file untrashed');
}

/**
 * Permanently delete a Drive file (owner only). Irreversible.
 * Drive returns 403 if the caller isn't the file owner.
 */
export async function permanentlyDeleteDriveFile(userId: string, fileId: string): Promise<void> {
  const drive = await driveClientFor(userId);
  await withDriveLimit(userId, () => drive.files.delete({ fileId, supportsAllDrives: true }));
  invalidateTreeCache(userId);
  logger.info({ fileId, userId }, 'drive file permanently deleted');
}
