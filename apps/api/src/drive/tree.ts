import { LRUCache } from 'lru-cache';
import type { DriveTreeNode } from '@notdrive/shared';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';
import { loadServerEnv } from '../env.js';
import { logger } from '../util/logger.js';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const STALE_MS = 5 * 60 * 1000; // serve-cached threshold
const MAX_TTL_MS = 30 * 60 * 1000; // hard eviction

interface CacheEntry {
  node: DriveTreeNode;
  fetchedAt: number;
  refreshing: boolean;
}

const cache = new LRUCache<string, CacheEntry>({
  max: 500,
  ttl: MAX_TTL_MS,
});

function keyOf(userId: string, root: string, depth: number) {
  return `${userId}|${root}|${depth}`;
}

async function listChildren(userId: string, parentId: string) {
  const drive = await driveClientFor(userId);
  const items: Array<{ id: string; name: string; mimeType: string; modifiedTime: string | null }> = [];
  let pageToken: string | undefined;
  do {
    const res = await withDriveLimit(userId, () =>
      drive.files.list({
        q: `'${parentId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id,name,mimeType,modifiedTime)',
        pageSize: 1000, // bumped from 200
        orderBy: 'folder,name',
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    for (const f of res.data.files ?? []) {
      items.push({
        id: f.id!,
        name: f.name ?? '(unnamed)',
        mimeType: f.mimeType ?? 'application/octet-stream',
        modifiedTime: f.modifiedTime ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return items;
}

async function buildNode(
  userId: string,
  id: string,
  name: string,
  mimeType: string,
  modifiedTime: string | null,
  depthLeft: number,
): Promise<DriveTreeNode> {
  const isFolder = mimeType === FOLDER_MIME;
  const node: DriveTreeNode = {
    id,
    name,
    mime_type: mimeType,
    is_folder: isFolder,
    modified_time: modifiedTime ? Date.parse(modifiedTime) : null,
    children: isFolder ? [] : null,
  };
  if (isFolder && depthLeft > 0) {
    const kids = await listChildren(userId, id);
    // Parallel recursion — the Bottleneck limiter serialises real HTTP calls,
    // but walking in parallel lets us overlap waiting on the reservoir.
    node.children = await Promise.all(
      kids.map((k) => buildNode(userId, k.id, k.name, k.mimeType, k.modifiedTime, depthLeft - 1)),
    );
  }
  return node;
}

async function doFetch(userId: string, root: string, depth: number): Promise<DriveTreeNode> {
  const drive = await driveClientFor(userId);
  const rootMeta = await withDriveLimit(userId, () =>
    drive.files.get({
      fileId: root,
      fields: 'id,name,mimeType,modifiedTime',
      supportsAllDrives: true,
    }),
  );
  return buildNode(
    userId,
    rootMeta.data.id ?? root,
    rootMeta.data.name ?? 'My Drive',
    rootMeta.data.mimeType ?? FOLDER_MIME,
    rootMeta.data.modifiedTime ?? null,
    depth,
  );
}

export async function fetchDriveTree(
  userId: string,
  options: { root?: string; depth?: number } = {},
): Promise<DriveTreeNode> {
  const root = options.root ?? 'root';
  const depth = options.depth ?? loadServerEnv().DRIVE_TREE_DEPTH;
  const key = keyOf(userId, root, depth);
  const now = Date.now();
  const hit = cache.get(key);

  // Stale-while-revalidate: return cached immediately, kick off refresh in the background.
  if (hit) {
    const age = now - hit.fetchedAt;
    if (age > STALE_MS && !hit.refreshing) {
      hit.refreshing = true;
      doFetch(userId, root, depth)
        .then((node) => {
          cache.set(key, { node, fetchedAt: Date.now(), refreshing: false });
          logger.debug({ userId, age }, 'drive tree refreshed in background');
        })
        .catch((err) => {
          hit.refreshing = false;
          logger.warn({ err: (err as Error).message }, 'drive tree bg refresh failed');
        });
    }
    return hit.node;
  }

  const node = await doFetch(userId, root, depth);
  cache.set(key, { node, fetchedAt: now, refreshing: false });
  return node;
}

export function invalidateTreeCache(userId?: string) {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}|`)) cache.delete(key);
  }
}
