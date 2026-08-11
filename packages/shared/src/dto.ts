import type { DarkMode, EventKind, ItemType, Role, TagColor, ViewLayout } from './enums.js';
import type { AutoShareMode, DriveRoleLiteral } from './zod.js';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  dark_mode: DarkMode;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  created_by: string;
  created_at: number;
  auto_share_mode: AutoShareMode;
  auto_share_role: DriveRoleLiteral;
  role: Role;
}

export interface MeDTO {
  user: UserDTO;
  workspaces: WorkspaceDTO[];
  current_workspace: WorkspaceDTO | null;
}

export interface ItemDTO {
  id: string;
  workspace_id: string;
  type: ItemType;
  title: string;
  parent_id: string | null;
  drive_file_id: string | null;
  rank: string;
  is_favorite: boolean;
  is_archived: boolean;
  archived_at: number | null;
  body: string | null;
  // 'workspace' = visible to all members. 'private' = only owner_id can see.
  visibility: 'workspace' | 'private';
  owner_id: string | null;
  created_at: number;
  updated_at: number;
  tag_ids: string[];
  drive?: DriveFileDTO | null;
}

export interface TagDTO {
  id: string;
  workspace_id: string;
  name: string;
  color: TagColor;
}

export interface ViewDTO {
  id: string;
  workspace_id: string;
  user_id: string;
  name: string;
  query: string;
  layout: ViewLayout;
  sort: { field: 'title' | 'modified' | 'created' | 'updated'; dir: 'asc' | 'desc' } | null;
  created_at: number;
}

export interface DriveFileDTO {
  drive_file_id: string;
  name: string;
  mime_type: string;
  icon_link: string | null;
  thumbnail_link: string | null;
  web_view_link: string | null;
  modified_time: number | null;
  trashed: boolean;
}

export interface DriveTreeNode {
  id: string;
  name: string;
  mime_type: string;
  is_folder: boolean;
  modified_time: number | null;
  children: DriveTreeNode[] | null;
}

export function sortDriveNodes(list: DriveTreeNode[]): DriveTreeNode[] {
  return [...list].sort((a, b) => {
    if (a.modified_time !== b.modified_time) {
      if (a.modified_time === null) return 1;
      if (b.modified_time === null) return -1;
      return b.modified_time - a.modified_time;
    }
    if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export interface RecentEntryDTO {
  kind: EventKind;
  at: number;
  item: ItemDTO;
}

export interface CommentAuthorDTO {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface CommentDTO {
  id: string;
  thread_id: string;
  body: string;
  author: CommentAuthorDTO | null;
  created_at: number;
  edited_at: number | null;
}

export interface CommentThreadDTO {
  id: string;
  item_id: string;
  anchor: string | null;
  resolved_at: number | null;
  created_at: number;
  comments: CommentDTO[];
}

export interface CommentThreadListDTO {
  threads: CommentThreadDTO[];
}

export const NOTIFICATION_KINDS = ['comment.mention', 'comment.reply'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationDTO {
  id: string;
  kind: NotificationKind;
  item_id: string | null;
  item_title: string | null;
  thread_id: string | null;
  comment_id: string | null;
  comment_excerpt: string | null;
  actor: CommentAuthorDTO | null;
  read_at: number | null;
  created_at: number;
}

export interface NotificationListResponseDTO {
  unread_count: number;
  notifications: NotificationDTO[];
}
