import AdmZip from 'adm-zip';
import { Marked } from 'marked';
import { createItem } from './items.js';
import { logger } from '../util/logger.js';

const MAX_TOTAL_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_FILES = 1000;
const MAX_BODY_BYTES = 400_000; // matches the 500KB cap on items.body w/ headroom

const md = new Marked({
  gfm: true,
  breaks: false,
});

export interface ImportResult {
  created: number;
  skipped: number;
  total_files: number;
  errors: Array<{ path: string; reason: string }>;
}

interface MdEntry {
  path: string;       // e.g. "docs/getting-started.md"
  segments: string[]; // ["docs", "getting-started.md"]
  raw: string;        // markdown source
}

/**
 * Import a ZIP of Markdown files as NotDrive native pages.
 *
 * Folder structure becomes the page hierarchy: `docs/intro.md` creates a
 * "docs" parent page (if not already created in this import) with "intro" as
 * a child. Folders are deduped within a single import run; titles come from
 * the first H1 if present, otherwise the filename.
 */
export async function importMarkdownZip(
  workspaceId: string,
  userId: string,
  zipBuffer: Buffer,
): Promise<ImportResult> {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  const result: ImportResult = { created: 0, skipped: 0, total_files: 0, errors: [] };

  const mdEntries: MdEntry[] = [];
  let totalBytes = 0;

  for (const e of entries) {
    if (e.isDirectory) continue;
    result.total_files++;
    const name = e.entryName;
    if (!name.toLowerCase().endsWith('.md')) {
      result.skipped++;
      continue;
    }
    if (name.includes('__MACOSX/') || name.split('/').some((s) => s.startsWith('.'))) {
      result.skipped++;
      continue;
    }
    const size = e.header.size;
    if (size > MAX_BODY_BYTES) {
      result.errors.push({ path: name, reason: `file too large (${size} > ${MAX_BODY_BYTES})` });
      continue;
    }
    totalBytes += size;
    if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      result.errors.push({ path: name, reason: 'import would exceed 50 MB total' });
      break;
    }
    if (mdEntries.length >= MAX_FILES) {
      result.errors.push({ path: name, reason: `over ${MAX_FILES} file limit` });
      break;
    }
    const segments = name.split('/').filter(Boolean);
    const raw = e.getData().toString('utf8');
    mdEntries.push({ path: name, segments, raw });
  }

  // Create folder pages first so children can reference them as parent_id.
  // Map from folder path (joined with /) to created item id.
  const folderIds = new Map<string, string>();

  async function ensureFolder(segments: string[]): Promise<string | null> {
    if (segments.length === 0) return null;
    const key = segments.join('/');
    const cached = folderIds.get(key);
    if (cached) return cached;
    const parentId = await ensureFolder(segments.slice(0, -1));
    const id = await createItem({
      workspaceId,
      userId,
      type: 'page',
      title: titleFromFolderName(segments[segments.length - 1] ?? 'Folder'),
      parentId,
      driveFileId: null,
    });
    folderIds.set(key, id);
    return id;
  }

  for (const entry of mdEntries) {
    try {
      const folderSegs = entry.segments.slice(0, -1);
      const fileSeg = entry.segments[entry.segments.length - 1] ?? '';
      const parentId = folderSegs.length ? await ensureFolder(folderSegs) : null;
      const title = titleFromMarkdown(entry.raw) ?? titleFromFileName(fileSeg);
      const html = await md.parse(entry.raw, { async: true });
      await createItem({
        workspaceId,
        userId,
        type: 'page',
        title,
        parentId,
        driveFileId: null,
        body: html,
      });
      result.created++;
    } catch (err) {
      result.errors.push({ path: entry.path, reason: (err as Error).message });
    }
  }

  logger.info(
    {
      workspaceId,
      userId,
      created: result.created,
      skipped: result.skipped,
      errors: result.errors.length,
    },
    'markdown zip import complete',
  );
  return result;
}

/** Strip extension + tidy separators for filename-derived titles. */
function titleFromFileName(name: string): string {
  const noExt = name.replace(/\.md$/i, '');
  return prettify(noExt) || 'Untitled';
}

function titleFromFolderName(name: string): string {
  return prettify(name) || 'Folder';
}

function prettify(s: string): string {
  return s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Return the text of the first H1 in the markdown, if any. */
function titleFromMarkdown(raw: string): string | null {
  const match = /^\s*#\s+(.+?)\s*$/m.exec(raw);
  if (!match) return null;
  const text = match[1]?.trim();
  return text && text.length <= 280 ? text : null;
}
