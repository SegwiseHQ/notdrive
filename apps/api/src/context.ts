import type { Role } from '@notdrive/shared';

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  dark_mode: 'system' | 'light' | 'dark';
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: number;
  last_seen_at: number;
}

export interface Membership {
  workspace_id: string;
  role: Role;
  workspace_name: string;
}

export interface Variables {
  user: AuthedUser;
  session: Session;
  membership: Membership;
  requestId: string;
}

export type AppVariables = Variables;
