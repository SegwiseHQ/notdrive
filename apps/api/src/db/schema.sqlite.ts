import { sql } from 'drizzle-orm';
import { blob, check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  google_id: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatar_url: text('avatar_url'),
  dark_mode: text('dark_mode').notNull().default('system'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const oauth_accounts = sqliteTable(
  'oauth_accounts',
  {
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    access_token_ct: text('access_token_ct').notNull(),
    access_token_iv: text('access_token_iv').notNull(),
    refresh_token_ct: text('refresh_token_ct'),
    refresh_token_iv: text('refresh_token_iv'),
    expires_at: integer('expires_at').notNull(),
    scope: text('scope').notNull(),
    updated_at: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.user_id, t.provider] }) }),
);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  user_agent: text('user_agent'),
  expires_at: integer('expires_at').notNull(),
  last_seen_at: integer('last_seen_at').notNull(),
  created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => ({ idxUser: index('sessions_user').on(t.user_id) }));

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  created_by: text('created_by').notNull().references(() => users.id),
  // 'off' (no auto-share), 'domain' (only mirror files already shared
  // domain-wide or anyone-with-link), 'all' (mirror every linked file).
  auto_share_mode: text('auto_share_mode').notNull().default('off'),
  auto_share_role: text('auto_share_role').notNull().default('reader'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const workspace_members = sqliteTable(
  'workspace_members',
  {
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    joined_at: integer('joined_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspace_id, t.user_id] }),
    idxUser: index('wm_user').on(t.user_id),
  }),
);

export const workspace_invites = sqliteTable('workspace_invites', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  token: text('token').notNull().unique(),
  invited_by: text('invited_by').notNull().references(() => users.id),
  expires_at: integer('expires_at').notNull(),
  accepted_at: integer('accepted_at'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

export const items = sqliteTable(
  'items',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    drive_file_id: text('drive_file_id'),
    parent_id: text('parent_id'),
    rank: text('rank').notNull(),
    is_archived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    archived_at: integer('archived_at'),
    body: text('body'),
    appdata_file_id: text('appdata_file_id'),
    // Mirror of postgres visibility/owner_id columns. See schema.postgres.ts.
    visibility: text('visibility').notNull().default('workspace'),
    owner_id: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
    created_by: text('created_by').notNull().references(() => users.id),
    created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
    updated_at: integer('updated_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    idxParent: index('items_parent').on(t.workspace_id, t.parent_id, t.rank),
    idxArchived: index('items_archived').on(t.workspace_id, t.is_archived),
    idxDriveFile: index('items_drive_file').on(t.drive_file_id),
    idxVisibility: index('items_visibility').on(t.workspace_id, t.visibility, t.owner_id),
    // Defense in depth: catches bad writes that bypass app-level zod validation.
    visibilityCheck: check('items_visibility_check', sql`${t.visibility} IN ('workspace', 'private')`),
  }),
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({ uniq: uniqueIndex('tags_ws_name_ci').on(t.workspace_id, sql`lower(${t.name})`) }),
);

export const item_tags = sqliteTable(
  'item_tags',
  {
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    tag_id: text('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.item_id, t.tag_id] }),
    idxTag: index('item_tags_tag').on(t.tag_id),
  }),
);

// Per-user starring. Mirror of postgres user_item_favorites.
export const user_item_favorites = sqliteTable(
  'user_item_favorites',
  {
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.item_id] }),
    idxWsUser: index('uif_ws_user').on(t.workspace_id, t.user_id),
  }),
);

export const views = sqliteTable('views', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  sort: text('sort'),
  layout: text('layout').notNull().default('list'),
  created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
});

// Binary blobs (typically images) attached to an item. Mirror of postgres
// item_assets. See schema.postgres.ts for the design rationale.
export const item_assets = sqliteTable(
  'item_assets',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    content_type: text('content_type').notNull(),
    byte_size: integer('byte_size').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
    created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    idxWs: index('item_assets_ws').on(t.workspace_id),
    idxItem: index('item_assets_item').on(t.item_id),
  }),
);

export const item_events = sqliteTable(
  'item_events',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    reason: text('reason'),
    created_at: integer('created_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    idxUser: index('ie_user_time').on(t.workspace_id, t.user_id, t.created_at),
    idxItem: index('ie_item_time').on(t.item_id, t.created_at),
  }),
);

export const drive_file_cache = sqliteTable(
  'drive_file_cache',
  {
    drive_file_id: text('drive_file_id').notNull(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    mime_type: text('mime_type').notNull(),
    icon_link: text('icon_link'),
    thumbnail_link: text('thumbnail_link'),
    web_view_link: text('web_view_link'),
    modified_time: integer('modified_time'),
    trashed: integer('trashed', { mode: 'boolean' }).notNull().default(false),
    raw: text('raw'),
    fetched_at: integer('fetched_at').notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({ pk: primaryKey({ columns: [t.drive_file_id, t.workspace_id] }) }),
);

export const drive_sync_state = sqliteTable(
  'drive_sync_state',
  {
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    start_page_token: text('start_page_token'),
    last_polled_at: integer('last_polled_at'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspace_id, t.user_id] }) }),
);

export const job_leases = sqliteTable('job_leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expires_at: integer('expires_at').notNull(),
});
