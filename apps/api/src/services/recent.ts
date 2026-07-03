import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { hydrate, visibilityClause } from './items.js';

export async function listRecent(workspaceId: string, userId: string, limit = 40) {
  const events = await db
    .select({
      kind: schema.item_events.kind,
      at: schema.item_events.created_at,
      item_id: schema.item_events.item_id,
    })
    .from(schema.item_events)
    .where(
      and(eq(schema.item_events.workspace_id, workspaceId), eq(schema.item_events.user_id, userId)),
    )
    .orderBy(desc(schema.item_events.created_at))
    .limit(limit * 3);

  const seen = new Set<string>();
  const picked: typeof events = [];
  for (const e of events) {
    if (seen.has(e.item_id)) continue;
    seen.add(e.item_id);
    picked.push(e);
    if (picked.length >= limit) break;
  }
  if (picked.length === 0) return [];

  const itemRows = await db
    .select()
    .from(schema.items)
    .where(and(eq(schema.items.workspace_id, workspaceId), visibilityClause(userId)));
  const byId = new Map(itemRows.map((r) => [r.id, r]));

  const pairs = picked
    .map((p) => {
      const row = byId.get(p.item_id);
      return row ? { p, row } : null;
    })
    .filter((x): x is { p: (typeof picked)[number]; row: (typeof itemRows)[number] } => x !== null);
  const hydrated = await hydrate(
    workspaceId,
    userId,
    pairs.map((x) => x.row),
  );
  return pairs.map(({ p }, i) => {
    const item = hydrated[i];
    if (!item) throw new Error('recent item hydration returned fewer rows than requested');
    return { kind: p.kind, at: p.at, item };
  });
}
