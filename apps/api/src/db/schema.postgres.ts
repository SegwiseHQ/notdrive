import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Use `bigint` stored as number for epoch-ms to match SQLite integer column.
const ts = (name: string) => bigint(name, { mode: 'number' });

// drizzle-pg has no first-class bytea type; this is the standard shim.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  google_id: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatar_url: text('avatar_url'),
  dark_mode: text('dark_mode').notNull().default('system'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const oauth_accounts = pgTable(
  'oauth_accounts',
  {
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    access_token_ct: text('access_token_ct').notNull(),
    access_token_iv: text('access_token_iv').notNull(),
    refresh_token_ct: text('refresh_token_ct'),
    refresh_token_iv: text('refresh_token_iv'),
    expires_at: ts('expires_at').notNull(),
    scope: text('scope').notNull(),
    updated_at: ts('updated_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.user_id, t.provider] }) }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    user_agent: text('user_agent'),
    expires_at: ts('expires_at').notNull(),
    last_seen_at: ts('last_seen_at').notNull(),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({ idxUser: index('sessions_user').on(t.user_id) }),
);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  created_by: text('created_by')
    .notNull()
    .references(() => users.id),
  auto_share_mode: text('auto_share_mode').notNull().default('off'),
  auto_share_role: text('auto_share_role').notNull().default('reader'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const workspace_members = pgTable(
  'workspace_members',
  {
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    joined_at: ts('joined_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspace_id, t.user_id] }),
    idxUser: index('wm_user').on(t.user_id),
  }),
);

export const workspace_invites = pgTable('workspace_invites', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  token: text('token').notNull().unique(),
  invited_by: text('invited_by')
    .notNull()
    .references(() => users.id),
  expires_at: ts('expires_at').notNull(),
  accepted_at: ts('accepted_at'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const items = pgTable(
  'items',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    drive_file_id: text('drive_file_id'),
    parent_id: text('parent_id'),
    rank: text('rank').notNull(),
    is_archived: boolean('is_archived').notNull().default(false),
    archived_at: ts('archived_at'),
    body: text('body'),
    appdata_file_id: text('appdata_file_id'),
    // 'workspace' = visible to every workspace member (default).
    // 'private'   = visible only to owner_id.
    // Child items inherit visibility + owner_id from their parent at create time.
    visibility: text('visibility').notNull().default('workspace'),
    owner_id: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    created_by: text('created_by')
      .notNull()
      .references(() => users.id),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
    updated_at: ts('updated_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    idxParent: index('items_parent').on(t.workspace_id, t.parent_id, t.rank),
    idxArchived: index('items_archived').on(t.workspace_id, t.is_archived),
    idxDriveFile: index('items_drive_file').on(t.drive_file_id),
    // Speeds up the private-items filter on every list/search.
    idxVisibility: index('items_visibility').on(t.workspace_id, t.visibility, t.owner_id),
    // Defense in depth: catches bad writes that bypass app-level zod validation.
    visibilityCheck: check(
      'items_visibility_check',
      sql`${t.visibility} IN ('workspace', 'private')`,
    ),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({ uniq: uniqueIndex('tags_ws_name_ci').on(t.workspace_id, sql`lower(${t.name})`) }),
);

export const item_tags = pgTable(
  'item_tags',
  {
    item_id: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    tag_id: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.tag_id] }),
    idxTag: index('item_tags_tag').on(t.tag_id),
  }),
);

// Per-user starring. Replaces the legacy workspace-wide items.is_favorite flag.
// PK is (user_id, item_id) so each user has at most one favorite row per item.
// Cascades from users + items so leaving a workspace or deleting an item both
// clean these up automatically.
export const user_item_favorites = pgTable(
  'user_item_favorites',
  {
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.item_id] }),
    idxWsUser: index('uif_ws_user').on(t.workspace_id, t.user_id),
  }),
);

export const views = pgTable('views', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  sort: jsonb('sort'),
  layout: text('layout').notNull().default('list'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

// Binary blobs (typically images) attached to an item — produced by the
// markdown-zip importer when the zip contains image files referenced from
// pages. ACL is derived from the parent item at read time (no duplicated
// visibility column to keep in sync). Cascade-deletes when the owning item
// is deleted.
export const item_assets = pgTable(
  'item_assets',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    item_id: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    content_type: text('content_type').notNull(),
    byte_size: bigint('byte_size', { mode: 'number' }).notNull(),
    data: bytea('data').notNull(),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    idxWs: index('item_assets_ws').on(t.workspace_id),
    idxItem: index('item_assets_item').on(t.item_id),
  }),
);

export const item_events = pgTable(
  'item_events',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    reason: text('reason'),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    idxUser: index('ie_user_time').on(t.workspace_id, t.user_id, t.created_at),
    idxItem: index('ie_item_time').on(t.item_id, t.created_at),
  }),
);

export const drive_file_cache = pgTable(
  'drive_file_cache',
  {
    drive_file_id: text('drive_file_id').notNull(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime_type: text('mime_type').notNull(),
    icon_link: text('icon_link'),
    thumbnail_link: text('thumbnail_link'),
    web_view_link: text('web_view_link'),
    modified_time: ts('modified_time'),
    trashed: boolean('trashed').notNull().default(false),
    raw: jsonb('raw'),
    fetched_at: ts('fetched_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.drive_file_id, t.workspace_id] }) }),
);

export const drive_sync_state = pgTable(
  'drive_sync_state',
  {
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    start_page_token: text('start_page_token'),
    last_polled_at: ts('last_polled_at'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspace_id, t.user_id] }) }),
);

// One thread per (item, anchor). `anchor` is NULL for page-level threads
// (today) and reserved for inline-anchored comments (a TipTap mark) in the
// future. The thread row itself is cheap; comments hang off it.
export const comment_threads = pgTable(
  'comment_threads',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    item_id: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    anchor: text('anchor'),
    resolved_at: ts('resolved_at'),
    resolved_by: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    created_by: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    idxItem: index('ct_item').on(t.workspace_id, t.item_id, t.created_at),
  }),
);

// Mentions are stored inline in `body` as `@[label](user_id)` tokens —
// matches the wire format the @-mention picker produces in the composer. The
// server parses these on create to fan out notifications.
export const comments = pgTable(
  'comments',
  {
    id: text('id').primaryKey(),
    thread_id: text('thread_id')
      .notNull()
      .references(() => comment_threads.id, { onDelete: 'cascade' }),
    user_id: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull(),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
    edited_at: ts('edited_at'),
    // Soft delete so reply chains stay coherent ("[deleted]" placeholders
    // beat dangling thread_id references).
    deleted_at: ts('deleted_at'),
  },
  (t) => ({
    idxThread: index('comments_thread').on(t.thread_id, t.created_at),
  }),
);

// Per-recipient row. Created when someone @-mentions you or replies to a
// thread you participated in. UI marks rows as read on click.
export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    item_id: text('item_id').references(() => items.id, { onDelete: 'cascade' }),
    thread_id: text('thread_id').references(() => comment_threads.id, { onDelete: 'cascade' }),
    comment_id: text('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    actor_id: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    read_at: ts('read_at'),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    // Powers the bell badge unread count + the dropdown list (most-recent
    // first per recipient).
    idxRecipient: index('notif_recipient').on(t.workspace_id, t.user_id, t.read_at, t.created_at),
    kindCheck: check('notif_kind_check', sql`${t.kind} IN ('comment.mention', 'comment.reply')`),
  }),
);

export const job_leases = pgTable('job_leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expires_at: ts('expires_at').notNull(),
});
