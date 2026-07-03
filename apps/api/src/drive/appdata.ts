import { Readable } from 'node:stream';
import { logger } from '../util/logger.js';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';

/**
 * Store-of-last-resort for NotDrive native page bodies.
 *
 * Drive has a hidden per-user "appDataFolder" that only this OAuth app can
 * read/write. It never shows up in the user's Drive UI, but it *is* backed up
 * by Google and survives NotDrive DB loss. We mirror `items.body` into a file
 * named `page-<item_id>.html` there, fire-and-forget on every save.
 *
 * DB remains the read-path source of truth (fast + local).
 * appDataFolder is the durability layer.
 *
 * Requires the `drive.appdata` OAuth scope — the broader `drive` scope alone
 * does NOT grant appDataFolder access. Users minted before that scope was
 * requested must re-auth.
 */

const PARENT = 'appDataFolder';
const MIME = 'text/html';

/**
 * googleapis pipes our `Readable` through a PassThrough; when the API
 * rejects before the body has drained, the cleanup sequence can emit a late
 * ERR_STREAM_PUSH_AFTER_EOF that escapes the awaited promise and crashes the
 * process. Attaching a swallow-listener upstream prevents that.
 */
function safeBodyStream(body: string): Readable {
  const stream = Readable.from([body]);
  stream.on('error', (err) => {
    logger.warn({ err: (err as Error).message }, 'appdata body stream error (ignored)');
  });
  return stream;
}

export async function pushBody(
  userId: string,
  itemId: string,
  body: string,
  existingFileId: string | null,
): Promise<string> {
  const drive = await driveClientFor(userId);

  if (existingFileId) {
    try {
      await withDriveLimit(userId, () =>
        drive.files.update({
          fileId: existingFileId,
          media: { mimeType: MIME, body: safeBodyStream(body) },
        }),
      );
      return existingFileId;
    } catch (err) {
      // The cached id may be stale (file deleted / trashed). Fall through to create.
      logger.warn({ itemId, err: (err as Error).message }, 'appdata update failed; recreating');
    }
  }

  const res = await withDriveLimit(userId, () =>
    drive.files.create({
      requestBody: {
        name: `page-${itemId}.html`,
        mimeType: MIME,
        parents: [PARENT],
      },
      media: { mimeType: MIME, body: safeBodyStream(body) },
      fields: 'id',
    }),
  );
  const fileId = res.data.id;
  if (!fileId) throw new Error('Drive appData create did not return a file id');
  return fileId;
}

export async function pullBody(userId: string, fileId: string): Promise<string | null> {
  try {
    const drive = await driveClientFor(userId);
    const res = await withDriveLimit(userId, () =>
      drive.files.get({ fileId, alt: 'media' }, { responseType: 'text' }),
    );
    return res.data as unknown as string;
  } catch (err) {
    logger.warn({ fileId, err: (err as Error).message }, 'appdata pull failed');
    return null;
  }
}

export async function deleteBlob(userId: string, fileId: string): Promise<void> {
  try {
    const drive = await driveClientFor(userId);
    await withDriveLimit(userId, () => drive.files.delete({ fileId }));
  } catch (err) {
    logger.warn({ fileId, err: (err as Error).message }, 'appdata delete failed');
  }
}
