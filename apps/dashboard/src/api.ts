export const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';
const BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Die Session liegt als httpOnly-Cookie (von der API gesetzt) – daher `credentials: include`. */
export async function api<T>(
  path: string,
  init?: { method: 'PUT' | 'POST' | 'DELETE'; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...(init
        ? {
            method: init.method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(init.body ?? {}),
          }
        : {}),
    });
  } catch {
    throw new ApiError(0, 'Die API ist nicht erreichbar.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
    const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
    throw new ApiError(res.status, msg ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface Me {
  id: string;
  username?: string;
  globalName?: string;
  avatar?: string | null;
}
export interface GuildSelectionEntry {
  id: string;
  name: string;
  icon: string | null;
  botPresent: boolean;
  canManage: boolean;
  permissions: string[];
}
export interface GuildOverview {
  id: string;
  name: string;
  icon: string | null;
  memberCount: number;
  applications: number;
  submissions: { total: number; pending: number; accepted: number; denied: number };
  health: { ok: boolean; message: string }[];
}

export const loginUrl = `${BASE}/auth/discord`;
export const inviteUrl = (guildId: string) =>
  `${BASE}/auth/discord/invite?guildId=${encodeURIComponent(guildId)}`;
export const guildIcon = (id: string, icon: string | null) =>
  icon ? `https://cdn.discordapp.com/icons/${id}/${icon}.png?size=64` : null;
export const userAvatar = (me: Me) =>
  me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null;

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
  position: number;
  manageable: boolean;
  blockedReason?: 'missing-manage-roles' | 'managed-role' | 'everyone' | 'hierarchy';
}
export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
  kind: 'text' | 'voice' | 'category';
  parentId: string | null;
}
export interface SelectionSlot {
  key: string;
  kind: 'role' | 'text' | 'voice' | 'category';
  label: string;
  description: string;
  requiresManageable?: boolean;
  value: string | null;
}
export interface BotPermissions {
  ok: boolean;
  administrator: boolean;
  checks: { key: string; label: string; ok: boolean }[];
}
export const BLOCK_REASON: Record<string, string> = {
  'missing-manage-roles': 'Bot hat „Rollen verwalten“ nicht',
  'managed-role': 'Integrationsrolle',
  everyone: '@everyone',
  hierarchy: 'liegt über der Bot-Rolle',
};
