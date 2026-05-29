import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Use `bigint` stored as number for epoch-ms to match SQLite integer column.
const ts = (name: string) => bigint(name, { mode: 'number' });

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
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  created_by: text('created_by').notNull().references(() => users.id),
  auto_share_mode: text('auto_share_mode').notNull().default('off'),
  auto_share_role: text('auto_share_role').notNull().default('reader'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const workspace_members = pgTable(
  'workspace_members',
  {
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
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
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  role: text('role').notNull(),
  token: text('token').notNull().unique(),
  invited_by: text('invited_by').notNull().references(() => users.id),
  expires_at: ts('expires_at').notNull(),
  accepted_at: ts('accepted_at'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const items = pgTable(
  'items',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    drive_file_id: text('drive_file_id'),
    parent_id: text('parent_id'),
    rank: text('rank').notNull(),
    is_archived: boolean('is_archived').notNull().default(false),
    archived_at: ts('archived_at'),
    body: text('body'),
    appdata_file_id: text('appdata_file_id'),
    created_by: text('created_by').notNull().references(() => users.id),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
    updated_at: ts('updated_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    idxParent: index('items_parent').on(t.workspace_id, t.parent_id, t.rank),
    idxArchived: index('items_archived').on(t.workspace_id, t.is_archived),
    idxDriveFile: index('items_drive_file').on(t.drive_file_id),
  }),
);

export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('gray'),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({ uniq: uniqueIndex('tags_ws_name_ci').on(t.workspace_id, sql`lower(${t.name})`) }),
);

export const item_tags = pgTable(
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

// Per-user starring. Replaces the legacy workspace-wide items.is_favorite flag.
// PK is (user_id, item_id) so each user has at most one favorite row per item.
// Cascades from users + items so leaving a workspace or deleting an item both
// clean these up automatically.
export const user_item_favorites = pgTable(
  'user_item_favorites',
  {
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
    created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.user_id, t.item_id] }),
    idxWsUser: index('uif_ws_user').on(t.workspace_id, t.user_id),
  }),
);

export const views = pgTable('views', {
  id: text('id').primaryKey(),
  workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  query: text('query').notNull().default(''),
  sort: jsonb('sort'),
  layout: text('layout').notNull().default('list'),
  created_at: ts('created_at').notNull().default(sql`(EXTRACT(EPOCH FROM now()) * 1000)::bigint`),
});

export const item_events = pgTable(
  'item_events',
  {
    id: text('id').primaryKey(),
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    item_id: text('item_id').notNull().references(() => items.id, { onDelete: 'cascade' }),
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
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
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
    workspace_id: text('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
    user_id: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    start_page_token: text('start_page_token'),
    last_polled_at: ts('last_polled_at'),
  },
  (t) => ({ pk: primaryKey({ columns: [t.workspace_id, t.user_id] }) }),
);

export const job_leases = pgTable('job_leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  expires_at: ts('expires_at').notNull(),
});
