import { type Ast, parseQuery } from '@notdrive/shared';
import type { ItemDTO } from '@notdrive/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, driver, schema } from '../db/index.js';
import { hydrate, visibilityClause } from './items.js';

/**
 * Execute a free-text smart query against items in a workspace.
 *
 * Strategy:
 *   1. Translate the AST into a set of candidate item_ids via a recursive
 *      evaluator that resolves each term to a Set<string> and combines with
 *      set operations per AND/OR/NOT.
 *   2. Hydrate selected rows through the shared hydrator.
 *
 * FTS is used for text terms when available; other terms are SQL-native.
 */
export async function search(workspaceId: string, userId: string, queryText: string, limit: number): Promise<ItemDTO[]> {
  const ast = parseQuery(queryText);
  if (ast.kind === 'empty') return [];

  // Universe is restricted to items the caller can see, so private items
  // belonging to others never enter the candidate set.
  const allRows = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(and(eq(schema.items.workspace_id, workspaceId), visibilityClause(userId)));
  const universe = new Set(allRows.map((r) => r.id));
  if (universe.size === 0) return [];

  const hits = await evalAst(workspaceId, userId, universe, ast);
  if (hits.size === 0) return [];

  const ids = Array.from(hits).slice(0, limit);
  const rows = await db
    .select()
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        visibilityClause(userId),
        inArray(schema.items.id, ids),
      ),
    );
  return hydrate(workspaceId, userId, rows);
}

async function evalAst(workspaceId: string, userId: string, universe: Set<string>, node: Ast): Promise<Set<string>> {
  switch (node.kind) {
    case 'term':
      return evalTerm(workspaceId, userId, universe, node.term);
    case 'not': {
      const inner = await evalAst(workspaceId, userId, universe, node.inner);
      return new Set([...universe].filter((x) => !inner.has(x)));
    }
    case 'and': {
      const l = await evalAst(workspaceId, userId, universe, node.left);
      const r = await evalAst(workspaceId, userId, universe, node.right);
      return new Set([...l].filter((x) => r.has(x)));
    }
    case 'or': {
      const l = await evalAst(workspaceId, userId, universe, node.left);
      const r = await evalAst(workspaceId, userId, universe, node.right);
      return new Set([...l, ...r]);
    }
    case 'empty':
      return universe;
  }
}

async function evalTerm(workspaceId: string, userId: string, _universe: Set<string>, term: import('@notdrive/shared').Term): Promise<Set<string>> {
  switch (term.kind) {
    case 'text':
      return textMatch(workspaceId, term.value);
    case 'tag':
      return tagMatch(workspaceId, term.name);
    case 'mime':
      return mimeMatch(workspaceId, term.value);
    case 'modified':
      return modifiedMatch(workspaceId, term.op, term.value);
    case 'is':
      return isFlag(workspaceId, userId, term.flag);
    case 'in':
      return inParent(workspaceId, term.value);
  }
}

async function textMatch(workspaceId: string, needle: string): Promise<Set<string>> {
  if (driver === 'sqlite') {
    // FTS5 MATCH against title/drive_name/tag_names.
    const q = needle.replace(/[^\p{L}\p{N}\s_-]/gu, ' ').trim();
    if (!q) return new Set();
    const rows = (await db.all(sql`
      SELECT f.item_id AS id
      FROM items_fts f
      JOIN items i ON i.id = f.item_id
      WHERE i.workspace_id = ${workspaceId} AND f MATCH ${q}
    `)) as Array<{ id: string }>;
    return new Set(rows.map((r) => r.id));
  }
  // Postgres: tsvector covering title + (HTML-stripped) body; LIKE on drive_file_cache.name as fallback.
  const q = needle.replace(/\s+/g, ' & ');
  const rows = (await db.execute(sql`
    SELECT i.id FROM items i
    LEFT JOIN drive_file_cache d
      ON d.workspace_id = i.workspace_id AND d.drive_file_id = i.drive_file_id
    WHERE i.workspace_id = ${workspaceId}
      AND (i.search_tsv @@ to_tsquery('simple', ${q})
           OR d.name ILIKE ${'%' + needle + '%'})
  `)) as unknown as { rows: Array<{ id: string }> };
  return new Set(rows.rows.map((r) => r.id));
}

async function tagMatch(workspaceId: string, name: string): Promise<Set<string>> {
  const rows = await db
    .select({ item_id: schema.item_tags.item_id })
    .from(schema.item_tags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.item_tags.tag_id))
    .where(and(eq(schema.tags.workspace_id, workspaceId), sql`lower(${schema.tags.name}) = lower(${name})`));
  return new Set(rows.map((r) => r.item_id));
}

async function mimeMatch(workspaceId: string, needle: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .innerJoin(
      schema.drive_file_cache,
      and(
        eq(schema.drive_file_cache.workspace_id, schema.items.workspace_id),
        eq(schema.drive_file_cache.drive_file_id, schema.items.drive_file_id),
      ),
    )
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        sql`lower(${schema.drive_file_cache.mime_type}) LIKE ${'%' + needle + '%'}`,
      ),
    );
  return new Set(rows.map((r) => r.id));
}

async function modifiedMatch(
  workspaceId: string,
  op: '<' | '>' | '=',
  value: import('@notdrive/shared').ModifiedValue,
): Promise<Set<string>> {
  const threshold = value.kind === 'relative_days'
    ? Date.now() - value.days * 86_400_000
    : Date.parse(value.iso);
  const rows = await db
    .select({ id: schema.items.id, modified: schema.drive_file_cache.modified_time, updated: schema.items.updated_at })
    .from(schema.items)
    .leftJoin(
      schema.drive_file_cache,
      and(
        eq(schema.drive_file_cache.workspace_id, schema.items.workspace_id),
        eq(schema.drive_file_cache.drive_file_id, schema.items.drive_file_id),
      ),
    )
    .where(eq(schema.items.workspace_id, workspaceId));
  return new Set(
    rows
      .filter((r) => {
        const ts = r.modified ?? r.updated;
        if (op === '<') return ts > threshold; // "modified:<7d" means modified in the last 7 days
        if (op === '>') return ts < threshold;
        return ts >= threshold - 86_400_000 && ts <= threshold + 86_400_000;
      })
      .map((r) => r.id),
  );
}

async function isFlag(
  workspaceId: string,
  userId: string,
  flag: 'favorite' | 'archived' | 'page' | 'file',
): Promise<Set<string>> {
  if (flag === 'favorite') {
    // Per-user starring.
    const rows = await db
      .select({ id: schema.user_item_favorites.item_id })
      .from(schema.user_item_favorites)
      .where(
        and(
          eq(schema.user_item_favorites.workspace_id, workspaceId),
          eq(schema.user_item_favorites.user_id, userId),
        ),
      );
    return new Set(rows.map((r) => r.id));
  }

  const conds = [eq(schema.items.workspace_id, workspaceId)];
  switch (flag) {
    case 'archived':
      conds.push(eq(schema.items.is_archived, true));
      break;
    case 'page':
      conds.push(eq(schema.items.type, 'page'));
      break;
    case 'file':
      conds.push(eq(schema.items.type, 'file'));
      break;
  }
  const rows = await db.select({ id: schema.items.id }).from(schema.items).where(and(...conds));
  return new Set(rows.map((r) => r.id));
}

async function inParent(workspaceId: string, titleNeedle: string): Promise<Set<string>> {
  const parents = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        sql`lower(${schema.items.title}) LIKE ${'%' + titleNeedle.toLowerCase() + '%'}`,
      ),
    );
  const parentIds = new Set(parents.map((p) => p.id));
  if (parentIds.size === 0) return new Set();
  const kids = await db
    .select({ id: schema.items.id })
    .from(schema.items)
    .where(
      and(
        eq(schema.items.workspace_id, workspaceId),
        inArray(schema.items.parent_id, Array.from(parentIds)),
      ),
    );
  return new Set(kids.map((k) => k.id));
}
