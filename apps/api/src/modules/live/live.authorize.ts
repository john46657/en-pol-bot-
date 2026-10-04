import { verifySession } from '@nexus/auth';
import { permissions, type AccessContext } from '@nexus/permissions';
import { allowedAreas } from '@nexus/realtime';

/**
 * Autorisierung einer Live-Verbindung (WebSocket-Upgrade). Gleiche Regeln wie die REST-API:
 * gültige Session, Mitglied des Servers, **Herkunft (Origin) aus der Dashboard-Liste** (Schutz vor fremden Webseiten),
 * und nur die Bereiche, für die mindestens ein Recht vorliegt.
 */
export interface LiveDeps {
  secret: string;
  issuer: string;
  allowedOrigins: string[];
  getMember(guildId: string, userId: string): Promise<{ isMember: boolean; roleIds: string[] }>;
  getAccess(guildId: string, userId: string, roleIds: string[]): Promise<{ canManageGuild: boolean }>;
}

export type LiveAuth = { ok: true; userId: string; guildId: string; areas: Set<string>; ctx: AccessContext } | { ok: false; status: 400 | 401 | 403; message: string };

const cookieValue = (header: string | undefined, name: string): string | undefined => {
  for (const part of (header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
};

export async function authorizeLive(req: { url?: string | undefined; headers: Record<string, string | string[] | undefined> }, deps: LiveDeps): Promise<LiveAuth> {
  const origin = typeof req.headers['origin'] === 'string' ? req.headers['origin'] : undefined;
  if (!origin || !deps.allowedOrigins.includes(origin)) return { ok: false, status: 403, message: 'Herkunft nicht erlaubt.' };
  const guildId = new URL(req.url ?? '', 'http://x').searchParams.get('guildId') ?? '';
  if (!/^\d{5,25}$/.test(guildId)) return { ok: false, status: 400, message: 'Server fehlt.' };
  const token = cookieValue(typeof req.headers['cookie'] === 'string' ? req.headers['cookie'] : undefined, 'nexus_session');
  if (!token) return { ok: false, status: 401, message: 'Nicht angemeldet.' };
  let userId: string;
  try {
    userId = (await verifySession(token, { secret: deps.secret, issuer: deps.issuer })).sub;
  } catch {
    return { ok: false, status: 401, message: 'Sitzung ungültig oder abgelaufen.' };
  }
  const member = await deps.getMember(guildId, userId).catch(() => ({ isMember: false, roleIds: [] as string[] }));
  if (!member.isMember) return { ok: false, status: 403, message: 'Kein Mitglied dieses Servers.' };
  const access = await deps.getAccess(guildId, userId, member.roleIds).catch(() => ({ canManageGuild: false }));
  const ctx: AccessContext = { guildId, userId, roleIds: member.roleIds, bypass: access.canManageGuild };
  const areas = await allowedAreas((keys) => permissions.canAny(ctx, keys));
  if (areas.size === 0) return { ok: false, status: 403, message: 'Keine Berechtigung für Live-Daten.' };
  return { ok: true, userId, guildId, areas, ctx };
}
