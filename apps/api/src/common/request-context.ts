import type { Request } from 'express';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  robloxUserId: string | null;
  sessionId: string;
}
export type AppRequest = Request & { requestId: string; user?: AuthUser };
