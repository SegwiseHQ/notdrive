export const ITEM_TYPES = ['page', 'file'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export function roleAtLeast(actual: Role, required: Role): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

export const VIEW_LAYOUTS = ['list', 'grid', 'timeline', 'tagboard'] as const;
export type ViewLayout = (typeof VIEW_LAYOUTS)[number];

export const DARK_MODES = ['system', 'light', 'dark'] as const;
export type DarkMode = (typeof DARK_MODES)[number];

export const EVENT_KINDS = [
  'created',
  'opened',
  'updated',
  'archived',
  'restored',
  'linked',
  'unlinked',
  'purged',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];
