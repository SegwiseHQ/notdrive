import type { DriveRoleLiteral } from '@notdrive/shared';
import { driveClientFor } from './client.js';
import { withDriveLimit } from './limiter.js';

export type DriveRole = DriveRoleLiteral;
export type DrivePermissionType = 'user' | 'group' | 'domain' | 'anyone';

export interface DrivePermission {
  id: string;
  type: DrivePermissionType;
  role: DriveRole | 'owner' | 'organizer' | 'fileOrganizer';
  email: string | null;
  display_name: string | null;
  domain: string | null;
  photo_link: string | null;
  allow_file_discovery: boolean | null;
  deleted: boolean;
}

const PERMISSION_FIELDS =
  'id,type,role,emailAddress,displayName,domain,photoLink,allowFileDiscovery,deleted';
const LIST_FIELDS = `permissions(${PERMISSION_FIELDS})`;

function toDto(p: {
  id?: string | null;
  type?: string | null;
  role?: string | null;
  emailAddress?: string | null;
  displayName?: string | null;
  domain?: string | null;
  photoLink?: string | null;
  allowFileDiscovery?: boolean | null;
  deleted?: boolean | null;
}): DrivePermission {
  return {
    id: p.id ?? '',
    type: (p.type as DrivePermissionType) ?? 'user',
    role: (p.role as DriveRole) ?? 'reader',
    email: p.emailAddress ?? null,
    display_name: p.displayName ?? null,
    domain: p.domain ?? null,
    photo_link: p.photoLink ?? null,
    allow_file_discovery: p.allowFileDiscovery ?? null,
    deleted: !!p.deleted,
  };
}

export async function listPermissions(userId: string, fileId: string): Promise<DrivePermission[]> {
  const drive = await driveClientFor(userId);
  const out: DrivePermission[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withDriveLimit(userId, () =>
      drive.permissions.list({
        fileId,
        fields: `nextPageToken,${LIST_FIELDS}`,
        supportsAllDrives: true,
        pageToken,
      }),
    );
    for (const p of res.data.permissions ?? []) out.push(toDto(p));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

export async function addPermission(
  userId: string,
  fileId: string,
  input: {
    type: DrivePermissionType;
    role: DriveRole;
    email?: string;
    domain?: string;
    allow_file_discovery?: boolean;
    send_notification_email?: boolean;
    email_message?: string;
  },
): Promise<DrivePermission> {
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.permissions.create({
      fileId,
      supportsAllDrives: true,
      sendNotificationEmail:
        input.type === 'user' || input.type === 'group'
          ? (input.send_notification_email ?? true)
          : false,
      emailMessage: input.email_message,
      fields: PERMISSION_FIELDS,
      requestBody: {
        type: input.type,
        role: input.role,
        ...(input.email ? { emailAddress: input.email } : {}),
        ...(input.domain ? { domain: input.domain } : {}),
        ...(input.allow_file_discovery !== undefined
          ? { allowFileDiscovery: input.allow_file_discovery }
          : {}),
      },
    }),
  );
  return toDto(res.data);
}

export async function updatePermission(
  userId: string,
  fileId: string,
  permissionId: string,
  role: DriveRole,
): Promise<DrivePermission> {
  const drive = await driveClientFor(userId);
  const res = await withDriveLimit(userId, () =>
    drive.permissions.update({
      fileId,
      permissionId,
      supportsAllDrives: true,
      fields: PERMISSION_FIELDS,
      requestBody: { role },
    }),
  );
  return toDto(res.data);
}

export async function removePermission(
  userId: string,
  fileId: string,
  permissionId: string,
): Promise<void> {
  const drive = await driveClientFor(userId);
  await withDriveLimit(userId, () =>
    drive.permissions.delete({
      fileId,
      permissionId,
      supportsAllDrives: true,
    }),
  );
}

/**
 * Ensure the file has a public "anyone with the link" permission at the given
 * role (default reader). Returns the webViewLink to copy.
 */
export async function enableLinkSharing(
  userId: string,
  fileId: string,
  role: DriveRole = 'reader',
): Promise<{ web_view_link: string | null; permission: DrivePermission }> {
  const drive = await driveClientFor(userId);

  const existing = (await listPermissions(userId, fileId)).find((p) => p.type === 'anyone');
  let permission: DrivePermission;
  if (existing) {
    permission =
      existing.role === role ? existing : await updatePermission(userId, fileId, existing.id, role);
  } else {
    permission = await addPermission(userId, fileId, {
      type: 'anyone',
      role,
      allow_file_discovery: false,
    });
  }

  const meta = await withDriveLimit(userId, () =>
    drive.files.get({
      fileId,
      fields: 'webViewLink',
      supportsAllDrives: true,
    }),
  );
  return { web_view_link: meta.data.webViewLink ?? null, permission };
}

export async function disableLinkSharing(userId: string, fileId: string): Promise<void> {
  const anyone = (await listPermissions(userId, fileId)).find((p) => p.type === 'anyone');
  if (anyone) await removePermission(userId, fileId, anyone.id);
}
