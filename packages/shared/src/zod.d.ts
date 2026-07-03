import type { z } from 'zod';
export declare const idSchema: z.ZodString;
export declare const workspaceIdSchema: z.ZodString;
export declare const itemTypeSchema: z.ZodEnum<['page', 'file']>;
export declare const roleSchema: z.ZodEnum<['viewer', 'member', 'admin', 'owner']>;
export declare const viewLayoutSchema: z.ZodEnum<['list', 'grid', 'timeline', 'tagboard']>;
export declare const darkModeSchema: z.ZodEnum<['system', 'light', 'dark']>;
export declare const tagColorSchema: z.ZodEnum<
  ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink']
>;
export declare const itemCreateSchema: z.ZodObject<
  {
    type: z.ZodDefault<z.ZodEnum<['page', 'file']>>;
    title: z.ZodString;
    parent_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    drive_file_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    type: 'page' | 'file';
    title: string;
    parent_id?: string | null | undefined;
    drive_file_id?: string | null | undefined;
  },
  {
    title: string;
    type?: 'page' | 'file' | undefined;
    parent_id?: string | null | undefined;
    drive_file_id?: string | null | undefined;
  }
>;
export declare const itemPatchSchema: z.ZodObject<
  {
    title: z.ZodOptional<z.ZodString>;
    is_favorite: z.ZodOptional<z.ZodBoolean>;
    body: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    title?: string | undefined;
    is_favorite?: boolean | undefined;
    body?: string | null | undefined;
  },
  {
    title?: string | undefined;
    is_favorite?: boolean | undefined;
    body?: string | null | undefined;
  }
>;
export declare const itemMoveSchema: z.ZodEffects<
  z.ZodObject<
    {
      parent_id: z.ZodNullable<z.ZodString>;
      before_id: z.ZodOptional<z.ZodString>;
      after_id: z.ZodOptional<z.ZodString>;
    },
    'strip',
    z.ZodTypeAny,
    {
      parent_id: string | null;
      before_id?: string | undefined;
      after_id?: string | undefined;
    },
    {
      parent_id: string | null;
      before_id?: string | undefined;
      after_id?: string | undefined;
    }
  >,
  {
    parent_id: string | null;
    before_id?: string | undefined;
    after_id?: string | undefined;
  },
  {
    parent_id: string | null;
    before_id?: string | undefined;
    after_id?: string | undefined;
  }
>;
export declare const itemListQuerySchema: z.ZodObject<
  {
    parent_id: z.ZodOptional<z.ZodString>;
    root: z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
    archived: z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
    favorite: z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
    linked_only: z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
    limit: z.ZodDefault<z.ZodNumber>;
    cursor: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    limit: number;
    archived?: boolean | undefined;
    favorite?: boolean | undefined;
    parent_id?: string | undefined;
    root?: boolean | undefined;
    linked_only?: boolean | undefined;
    cursor?: string | undefined;
  },
  {
    archived?: unknown;
    favorite?: unknown;
    parent_id?: string | undefined;
    root?: unknown;
    linked_only?: unknown;
    limit?: number | undefined;
    cursor?: string | undefined;
  }
>;
export declare const tagCreateSchema: z.ZodObject<
  {
    name: z.ZodString;
    color: z.ZodDefault<
      z.ZodEnum<
        ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink']
      >
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    color:
      | 'gray'
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'teal'
      | 'blue'
      | 'indigo'
      | 'purple'
      | 'pink';
  },
  {
    name: string;
    color?:
      | 'gray'
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'teal'
      | 'blue'
      | 'indigo'
      | 'purple'
      | 'pink'
      | undefined;
  }
>;
export declare const tagPatchSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodOptional<
      z.ZodEnum<
        ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink']
      >
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    color?:
      | 'gray'
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'teal'
      | 'blue'
      | 'indigo'
      | 'purple'
      | 'pink'
      | undefined;
  },
  {
    name?: string | undefined;
    color?:
      | 'gray'
      | 'red'
      | 'orange'
      | 'yellow'
      | 'green'
      | 'teal'
      | 'blue'
      | 'indigo'
      | 'purple'
      | 'pink'
      | undefined;
  }
>;
export declare const viewCreateSchema: z.ZodObject<
  {
    name: z.ZodString;
    query: z.ZodDefault<z.ZodString>;
    layout: z.ZodDefault<z.ZodEnum<['list', 'grid', 'timeline', 'tagboard']>>;
    sort: z.ZodOptional<
      z.ZodNullable<
        z.ZodObject<
          {
            field: z.ZodEnum<['title', 'modified', 'created', 'updated']>;
            dir: z.ZodEnum<['asc', 'desc']>;
          },
          'strip',
          z.ZodTypeAny,
          {
            field: 'created' | 'updated' | 'modified' | 'title';
            dir: 'asc' | 'desc';
          },
          {
            field: 'created' | 'updated' | 'modified' | 'title';
            dir: 'asc' | 'desc';
          }
        >
      >
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    query: string;
    layout: 'list' | 'grid' | 'timeline' | 'tagboard';
    sort?:
      | {
          field: 'created' | 'updated' | 'modified' | 'title';
          dir: 'asc' | 'desc';
        }
      | null
      | undefined;
  },
  {
    name: string;
    sort?:
      | {
          field: 'created' | 'updated' | 'modified' | 'title';
          dir: 'asc' | 'desc';
        }
      | null
      | undefined;
    query?: string | undefined;
    layout?: 'list' | 'grid' | 'timeline' | 'tagboard' | undefined;
  }
>;
export declare const viewPatchSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    query: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    layout: z.ZodOptional<z.ZodDefault<z.ZodEnum<['list', 'grid', 'timeline', 'tagboard']>>>;
    sort: z.ZodOptional<
      z.ZodOptional<
        z.ZodNullable<
          z.ZodObject<
            {
              field: z.ZodEnum<['title', 'modified', 'created', 'updated']>;
              dir: z.ZodEnum<['asc', 'desc']>;
            },
            'strip',
            z.ZodTypeAny,
            {
              field: 'created' | 'updated' | 'modified' | 'title';
              dir: 'asc' | 'desc';
            },
            {
              field: 'created' | 'updated' | 'modified' | 'title';
              dir: 'asc' | 'desc';
            }
          >
        >
      >
    >;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    sort?:
      | {
          field: 'created' | 'updated' | 'modified' | 'title';
          dir: 'asc' | 'desc';
        }
      | null
      | undefined;
    query?: string | undefined;
    layout?: 'list' | 'grid' | 'timeline' | 'tagboard' | undefined;
  },
  {
    name?: string | undefined;
    sort?:
      | {
          field: 'created' | 'updated' | 'modified' | 'title';
          dir: 'asc' | 'desc';
        }
      | null
      | undefined;
    query?: string | undefined;
    layout?: 'list' | 'grid' | 'timeline' | 'tagboard' | undefined;
  }
>;
export declare const linkFileSchema: z.ZodObject<
  {
    drive_file_id: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    drive_file_id: string;
  },
  {
    drive_file_id: string;
  }
>;
export declare const searchQuerySchema: z.ZodObject<
  {
    q: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
  },
  'strip',
  z.ZodTypeAny,
  {
    limit: number;
    q: string;
  },
  {
    q: string;
    limit?: number | undefined;
  }
>;
export declare const driveTreeQuerySchema: z.ZodObject<
  {
    depth: z.ZodDefault<z.ZodNumber>;
    root: z.ZodOptional<z.ZodString>;
  },
  'strip',
  z.ZodTypeAny,
  {
    depth: number;
    root?: string | undefined;
  },
  {
    root?: string | undefined;
    depth?: number | undefined;
  }
>;
export declare const driveSearchQuerySchema: z.ZodObject<
  {
    q: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
  },
  'strip',
  z.ZodTypeAny,
  {
    limit: number;
    q: string;
  },
  {
    q: string;
    limit?: number | undefined;
  }
>;
export declare const DRIVE_NATIVE_MIMES: readonly [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation',
  'application/vnd.google-apps.drawing',
  'application/vnd.google-apps.form',
  'application/vnd.google-apps.script',
  'application/vnd.google-apps.site',
  'application/vnd.google-apps.folder',
];
export type DriveNativeMime = (typeof DRIVE_NATIVE_MIMES)[number];
export declare const driveCreateSchema: z.ZodObject<
  {
    name: z.ZodString;
    mime_type: z.ZodEnum<
      [
        'application/vnd.google-apps.document',
        'application/vnd.google-apps.spreadsheet',
        'application/vnd.google-apps.presentation',
        'application/vnd.google-apps.drawing',
        'application/vnd.google-apps.form',
        'application/vnd.google-apps.script',
        'application/vnd.google-apps.site',
        'application/vnd.google-apps.folder',
      ]
    >;
    parent_folder_id: z.ZodOptional<z.ZodString>;
    create_page: z.ZodDefault<z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
    mime_type:
      | 'application/vnd.google-apps.document'
      | 'application/vnd.google-apps.spreadsheet'
      | 'application/vnd.google-apps.presentation'
      | 'application/vnd.google-apps.drawing'
      | 'application/vnd.google-apps.form'
      | 'application/vnd.google-apps.script'
      | 'application/vnd.google-apps.site'
      | 'application/vnd.google-apps.folder';
    create_page: boolean;
    parent_folder_id?: string | undefined;
  },
  {
    name: string;
    mime_type:
      | 'application/vnd.google-apps.document'
      | 'application/vnd.google-apps.spreadsheet'
      | 'application/vnd.google-apps.presentation'
      | 'application/vnd.google-apps.drawing'
      | 'application/vnd.google-apps.form'
      | 'application/vnd.google-apps.script'
      | 'application/vnd.google-apps.site'
      | 'application/vnd.google-apps.folder';
    parent_folder_id?: string | undefined;
    create_page?: unknown;
  }
>;
export type DriveCreateInput = z.infer<typeof driveCreateSchema>;
export declare const DRIVE_ROLES: readonly ['reader', 'commenter', 'writer'];
export type DriveRoleLiteral = (typeof DRIVE_ROLES)[number];
export declare const permissionCreateSchema: z.ZodEffects<
  z.ZodObject<
    {
      type: z.ZodEnum<['user', 'group', 'domain', 'anyone']>;
      role: z.ZodEnum<['reader', 'commenter', 'writer']>;
      email: z.ZodOptional<z.ZodString>;
      domain: z.ZodOptional<z.ZodString>;
      send_notification_email: z.ZodOptional<z.ZodEffects<z.ZodBoolean, boolean, unknown>>;
      email_message: z.ZodOptional<z.ZodString>;
    },
    'strip',
    z.ZodTypeAny,
    {
      type: 'user' | 'group' | 'domain' | 'anyone';
      role: 'reader' | 'commenter' | 'writer';
      domain?: string | undefined;
      email?: string | undefined;
      send_notification_email?: boolean | undefined;
      email_message?: string | undefined;
    },
    {
      type: 'user' | 'group' | 'domain' | 'anyone';
      role: 'reader' | 'commenter' | 'writer';
      domain?: string | undefined;
      email?: string | undefined;
      send_notification_email?: unknown;
      email_message?: string | undefined;
    }
  >,
  {
    type: 'user' | 'group' | 'domain' | 'anyone';
    role: 'reader' | 'commenter' | 'writer';
    domain?: string | undefined;
    email?: string | undefined;
    send_notification_email?: boolean | undefined;
    email_message?: string | undefined;
  },
  {
    type: 'user' | 'group' | 'domain' | 'anyone';
    role: 'reader' | 'commenter' | 'writer';
    domain?: string | undefined;
    email?: string | undefined;
    send_notification_email?: unknown;
    email_message?: string | undefined;
  }
>;
export declare const permissionPatchSchema: z.ZodObject<
  {
    role: z.ZodEnum<['reader', 'commenter', 'writer']>;
  },
  'strip',
  z.ZodTypeAny,
  {
    role: 'reader' | 'commenter' | 'writer';
  },
  {
    role: 'reader' | 'commenter' | 'writer';
  }
>;
export declare const linkShareSchema: z.ZodObject<
  {
    role: z.ZodDefault<z.ZodEnum<['reader', 'commenter', 'writer']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    role: 'reader' | 'commenter' | 'writer';
  },
  {
    role?: 'reader' | 'commenter' | 'writer' | undefined;
  }
>;
export declare const workspaceCreateSchema: z.ZodObject<
  {
    name: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    name: string;
  },
  {
    name: string;
  }
>;
export declare const AUTO_SHARE_MODES: readonly ['off', 'domain', 'all'];
export type AutoShareMode = (typeof AUTO_SHARE_MODES)[number];
export declare const workspacePatchSchema: z.ZodObject<
  {
    name: z.ZodOptional<z.ZodString>;
    auto_share_mode: z.ZodOptional<z.ZodEnum<['off', 'domain', 'all']>>;
    auto_share_role: z.ZodOptional<z.ZodEnum<['reader', 'commenter', 'writer']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    name?: string | undefined;
    auto_share_mode?: 'domain' | 'off' | 'all' | undefined;
    auto_share_role?: 'reader' | 'commenter' | 'writer' | undefined;
  },
  {
    name?: string | undefined;
    auto_share_mode?: 'domain' | 'off' | 'all' | undefined;
    auto_share_role?: 'reader' | 'commenter' | 'writer' | undefined;
  }
>;
export declare const inviteCreateSchema: z.ZodObject<
  {
    email: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<['admin', 'member', 'viewer']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    role: 'viewer' | 'member' | 'admin';
    email: string;
  },
  {
    email: string;
    role?: 'viewer' | 'member' | 'admin' | undefined;
  }
>;
export declare const inviteAcceptSchema: z.ZodObject<
  {
    token: z.ZodString;
  },
  'strip',
  z.ZodTypeAny,
  {
    token: string;
  },
  {
    token: string;
  }
>;
export declare const memberPatchSchema: z.ZodObject<
  {
    role: z.ZodEnum<['viewer', 'member', 'admin', 'owner']>;
  },
  'strip',
  z.ZodTypeAny,
  {
    role: 'viewer' | 'member' | 'admin' | 'owner';
  },
  {
    role: 'viewer' | 'member' | 'admin' | 'owner';
  }
>;
export declare const mePatchSchema: z.ZodObject<
  {
    dark_mode: z.ZodOptional<z.ZodEnum<['system', 'light', 'dark']>>;
  },
  'strip',
  z.ZodTypeAny,
  {
    dark_mode?: 'system' | 'light' | 'dark' | undefined;
  },
  {
    dark_mode?: 'system' | 'light' | 'dark' | undefined;
  }
>;
export type ItemCreateInput = z.infer<typeof itemCreateSchema>;
export type ItemPatchInput = z.infer<typeof itemPatchSchema>;
export type ItemMoveInput = z.infer<typeof itemMoveSchema>;
export type TagCreateInput = z.infer<typeof tagCreateSchema>;
export type ViewCreateInput = z.infer<typeof viewCreateSchema>;
export type LinkFileInput = z.infer<typeof linkFileSchema>;
