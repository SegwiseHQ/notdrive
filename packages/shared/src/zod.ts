import { z } from 'zod';
import { DARK_MODES, ITEM_TYPES, ROLES, TAG_COLORS, VIEW_LAYOUTS } from './enums.js';

// z.coerce.boolean() is a trap: Boolean("false") === true. Use this instead.
const boolish = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0' || v === '') return false;
  return v;
}, z.boolean());

export const idSchema = z.string().min(1).max(64);
export const workspaceIdSchema = idSchema;

export const itemTypeSchema = z.enum(ITEM_TYPES);
export const roleSchema = z.enum(ROLES);
export const viewLayoutSchema = z.enum(VIEW_LAYOUTS);
export const darkModeSchema = z.enum(DARK_MODES);
export const tagColorSchema = z.enum(TAG_COLORS);

export const visibilitySchema = z.enum(['workspace', 'private']);

export const itemCreateSchema = z.object({
  type: itemTypeSchema.default('page'),
  title: z.string().min(1).max(280),
  parent_id: idSchema.nullable().optional(),
  drive_file_id: z.string().min(1).max(128).nullable().optional(),
  visibility: visibilitySchema.optional(),
});

export const itemPatchSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  is_favorite: z.boolean().optional(),
  body: z.string().max(500_000).nullable().optional(),
  visibility: visibilitySchema.optional(),
});

export const itemMoveSchema = z
  .object({
    parent_id: idSchema.nullable(),
    before_id: idSchema.optional(),
    after_id: idSchema.optional(),
  })
  .refine((v) => !(v.before_id && v.after_id), 'supply only one of before_id or after_id');

export const itemListQuerySchema = z.object({
  parent_id: idSchema.optional(),
  root: boolish.optional(),
  archived: boolish.optional(),
  favorite: boolish.optional(),
  linked_only: boolish.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  cursor: z.string().optional(),
});

export const tagCreateSchema = z.object({
  name: z.string().min(1).max(64),
  color: tagColorSchema.default('gray'),
});

export const tagPatchSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  color: tagColorSchema.optional(),
});

export const viewCreateSchema = z.object({
  name: z.string().min(1).max(140),
  query: z.string().max(2000).default(''),
  layout: viewLayoutSchema.default('list'),
  sort: z
    .object({
      field: z.enum(['title', 'modified', 'created', 'updated']),
      dir: z.enum(['asc', 'desc']),
    })
    .nullable()
    .optional(),
});

export const viewPatchSchema = viewCreateSchema.partial();

export const linkFileSchema = z.object({
  drive_file_id: z.string().min(1).max(128),
});

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(1000),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const driveTreeQuerySchema = z.object({
  depth: z.coerce.number().int().min(1).max(6).default(4),
  root: z.string().optional(),
});

export const driveSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const DRIVE_NATIVE_MIMES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.script',
  'application/vnd.google-apps.site',
  'application/vnd.google-apps.folder',
] as const;
export type DriveNativeMime = (typeof DRIVE_NATIVE_MIMES)[number];

export const driveCreateSchema = z.object({
  name: z.string().min(1).max(200),
  mime_type: z.enum(DRIVE_NATIVE_MIMES),
  parent_folder_id: z.string().optional(),
  create_page: boolish.optional().default(true),
});
export type DriveCreateInput = z.infer<typeof driveCreateSchema>;

export const DRIVE_ROLES = ['reader', 'commenter', 'writer'] as const;
export type DriveRoleLiteral = (typeof DRIVE_ROLES)[number];

export const permissionCreateSchema = z
  .object({
    type: z.enum(['user', 'group', 'domain', 'anyone']),
    role: z.enum(DRIVE_ROLES),
    email: z.string().email().optional(),
    domain: z.string().min(1).max(200).optional(),
    send_notification_email: boolish.optional(),
    email_message: z.string().max(2000).optional(),
  })
  .refine(
    (v) =>
      (v.type === 'user' || v.type === 'group' ? !!v.email : true) &&
      (v.type === 'domain' ? !!v.domain : true),
    { message: 'email required for user/group, domain required for domain' },
  );

export const permissionPatchSchema = z.object({
  role: z.enum(DRIVE_ROLES),
});

export const linkShareSchema = z.object({
  role: z.enum(DRIVE_ROLES).default('reader'),
});

export const workspaceCreateSchema = z.object({
  name: z.string().min(1).max(120),
});

export const AUTO_SHARE_MODES = ['off', 'domain', 'all'] as const;
export type AutoShareMode = (typeof AUTO_SHARE_MODES)[number];

export const workspacePatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  auto_share_mode: z.enum(AUTO_SHARE_MODES).optional(),
  auto_share_role: z.enum(DRIVE_ROLES).optional(),
});

export const inviteCreateSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(1),
});

export const memberPatchSchema = z.object({
  role: roleSchema,
});

export const mePatchSchema = z.object({
  dark_mode: darkModeSchema.optional(),
});

export const commentCreateSchema = z.object({
  body: z.string().min(1).max(8000),
  // Inline-thread creation: a short quoted snippet of the selected text
  // when the user clicks "Comment" in the bubble toolbar. Stored verbatim
  // on comment_threads.anchor. Omit for page-level threads.
  anchor: z.string().min(1).max(280).optional(),
  // Reply to an existing thread (page-level or inline). When set, `anchor`
  // is ignored — the comment is appended to that thread.
  thread_id: idSchema.optional(),
});

export const commentPatchSchema = z.object({
  body: z.string().min(1).max(8000),
});

export const notificationsMarkReadSchema = z.object({
  ids: z.array(idSchema).min(1).max(200),
});

export type CommentCreateInput = z.infer<typeof commentCreateSchema>;
export type CommentPatchInput = z.infer<typeof commentPatchSchema>;

export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemPatchInput = z.infer<typeof itemPatchSchema>;
export type ItemMoveInput = z.infer<typeof itemMoveSchema>;
export type TagCreateInput = z.infer<typeof tagCreateSchema>;
export type ViewCreateInput = z.infer<typeof viewCreateSchema>;
export type LinkFileInput = z.infer<typeof linkFileSchema>;
