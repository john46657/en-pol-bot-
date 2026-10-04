import type {
  DiscordChannelSummary,
  DiscordGuildSummary,
  DiscordMemberSummary,
  DiscordRoleSummary,
  MessagePayload,
} from './types.js';

/**
 * Discord REST Gateway (Bot Token).
 *
 * Der einzige Ort, über den Backend-Services mit der Discord API sprechen
 * (API + Bot nutzen dieselben Funktionen → §33: keine zwei Systeme).
 * Antworten werden kurz (60s) gecacht, um Discord zu schonen.
 */

// DISCORD_API_BASE: nur für lokale Tests gegen einen Fake-Discord (scripts/fake-discord.mjs).
const API = process.env['DISCORD_API_BASE'] ?? 'https://discord.com/api/v10';

export class DiscordApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly endpoint: string,
    message: string,
  ) {
    super(`Discord API ${endpoint} → ${status}: ${message}`);
    this.name = 'DiscordApiError';
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 60_000;

export class TtlCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit || hit.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T, ttlMs = TTL_MS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}

function authHeader(botToken: string): Record<string, string> {
  return { Authorization: `Bot ${botToken}` };
}

async function discordFetch<T>(
  botToken: string,
  endpoint: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  botHeader = true,
): Promise<T> {
  const response = await fetch(`${API}${endpoint}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(botHeader ? authHeader(botToken) : {}),
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  if (response.status === 204) return undefined as T;

  const data = (await response.json().catch(() => null)) as
    (T & { message?: string; code?: number; retry_after?: number }) | null;

  if (!response.ok) {
    throw new DiscordApiError(response.status, endpoint, data?.message ?? response.statusText);
  }
  return data as T;
}

// --- Guilds ------------------------------------------------------------------

interface RawGuild {
  id: string;
  name: string;
  icon: string | null;
  owner_id?: string;
  owner?: boolean;
  permissions: string;
}

export async function getBotGuilds(
  botToken: string,
  cache = new TtlCache(),
): Promise<DiscordGuildSummary[]> {
  const cached = cache.get<DiscordGuildSummary[]>('bot-guilds');
  if (cached) return cached;

  const data = await discordFetch<RawGuild[]>(botToken, '/users/@me/guilds');
  const result = data.map((g) => ({
    id: g.id,
    name: g.name,
    icon: g.icon,
    ownerId: g.owner_id ?? '',
    permissions: g.permissions,
  }));
  cache.set('bot-guilds', result);
  return result;
}

export async function getGuild(
  botToken: string,
  guildId: string,
  cache = new TtlCache(),
): Promise<DiscordGuildSummary> {
  const key = `guild:${guildId}`;
  const cached = cache.get<DiscordGuildSummary>(key);
  if (cached) return cached;

  const data = await discordFetch<RawGuild>(botToken, `/guilds/${guildId}`);
  const result = {
    id: data.id,
    name: data.name,
    icon: data.icon,
    ownerId: data.owner_id ?? '',
    permissions: data.permissions,
  };
  cache.set(key, result);
  return result;
}

// --- Channels & Roles --------------------------------------------------------

export async function getGuildChannels(
  botToken: string,
  guildId: string,
  cache = new TtlCache(),
): Promise<DiscordChannelSummary[]> {
  const key = `guild-channels:${guildId}`;
  const cached = cache.get<DiscordChannelSummary[]>(key);
  if (cached) return cached;

  const data = await discordFetch<
    Array<{ id: string; name: string; type: number; parent_id: string | null }>
  >(botToken, `/guilds/${guildId}/channels`);
  const result = data
    .map((c) => ({ id: c.id, name: c.name, type: c.type, parentId: c.parent_id ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
  cache.set(key, result);
  return result;
}

export async function getGuildRoles(
  botToken: string,
  guildId: string,
  cache = new TtlCache(),
): Promise<DiscordRoleSummary[]> {
  const key = `guild-roles:${guildId}`;
  const cached = cache.get<DiscordRoleSummary[]>(key);
  if (cached) return cached;

  const data = await discordFetch<
    Array<{
      id: string;
      name: string;
      color: number;
      position: number;
      permissions: string;
      mentionable: boolean;
    }>
  >(botToken, `/guilds/${guildId}/roles`);
  const result = data
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      position: r.position,
      permissions: r.permissions,
      mentionable: r.mentionable,
    }))
    .sort((a, b) => b.position - a.position);
  cache.set(key, result);
  return result;
}

// --- Mitglieder --------------------------------------------------------------

interface RawMember {
  user: { id: string; username: string; global_name: string | null };
  roles: string[];
}

function mapMember(m: RawMember): DiscordMemberSummary {
  return {
    userId: m.user.id,
    username: m.user.username,
    globalName: m.user.global_name,
    roles: m.roles,
  };
}

export async function getBotMember(
  botToken: string,
  guildId: string,
  cache = new TtlCache(),
): Promise<DiscordMemberSummary> {
  const key = `bot-member:${guildId}`;
  const cached = cache.get<DiscordMemberSummary>(key);
  if (cached) return cached;

  const data = await discordFetch<RawMember>(botToken, `/guilds/${guildId}/members/@me`);
  const result = mapMember(data);
  cache.set(key, result);
  return result;
}

export async function getGuildMember(
  botToken: string,
  guildId: string,
  userId: string,
): Promise<DiscordMemberSummary | null> {
  const data = await discordFetch<RawMember | { message?: string }>(
    botToken,
    `/guilds/${guildId}/members/${userId}`,
  ).catch((error: unknown) => {
    if (error instanceof DiscordApiError && error.status === 404) return null;
    throw error;
  });
  if (!data || !('user' in data)) return null;
  return mapMember(data);
}

/** Discord erwartet den Audit-Log-Grund im Header (URL-kodiert, max. 512 Zeichen). */
const reasonHeader = (reason?: string): Record<string, string> =>
  reason ? { 'X-Audit-Log-Reason': encodeURIComponent(reason.slice(0, 400)) } : {};

/** Vergibt eine Rolle. Wirft `DiscordApiError`, wenn Discord die Änderung ablehnt (z. B. 403 Rollenposition). */
export async function addGuildMemberRole(
  botToken: string,
  guildId: string,
  userId: string,
  roleId: string,
  reason?: string,
): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'PUT',
    headers: reasonHeader(reason),
  });
}

/** Entzieht eine Rolle. Wirft `DiscordApiError`, wenn Discord die Änderung ablehnt. */
export async function removeGuildMemberRole(
  botToken: string,
  guildId: string,
  userId: string,
  roleId: string,
  reason?: string,
): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'DELETE',
    headers: reasonHeader(reason),
  });
}

/** Mitglieder eines Servers (Suche nach Namensteil oder erste Seite). Für Übersichten, begrenzt. */
export async function listGuildMembers(
  botToken: string,
  guildId: string,
  opts: { query?: string; limit?: number } = {},
): Promise<DiscordMemberSummary[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 1000);
  const path = opts.query
    ? `/guilds/${guildId}/members/search?query=${encodeURIComponent(opts.query)}&limit=${Math.min(limit, 100)}`
    : `/guilds/${guildId}/members?limit=${limit}`;
  const data = await discordFetch<RawMember[]>(botToken, path);
  return data.map(mapMember);
}

// --- Nachrichten -------------------------------------------------------------

export async function createChannelMessage(
  botToken: string,
  channelId: string,
  payload: MessagePayload,
): Promise<{ id: string }> {
  const data = await discordFetch<{ id: string }>(botToken, `/channels/${channelId}/messages`, {
    method: 'POST',
    body: payload,
  });
  return { id: data.id };
}

export async function editChannelMessage(
  botToken: string,
  channelId: string,
  messageId: string,
  payload: MessagePayload,
): Promise<void> {
  await discordFetch<void>(botToken, `/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: payload,
  });
}

export async function deleteChannelMessage(
  botToken: string,
  channelId: string,
  messageId: string,
): Promise<void> {
  await fetch(`${API}/channels/${channelId}/messages/${messageId}`, {
    method: 'DELETE',
    headers: authHeader(botToken),
  });
}

/**
 * DM an einen User (§30: Accept/Deny informieren den Bewerber).
 * Legt einen DM-Channel an und sendet dort die Nachricht.
 */
export async function sendDirectMessage(
  botToken: string,
  userId: string,
  payload: MessagePayload,
): Promise<void> {
  const channel = await discordFetch<{ id: string }>(botToken, '/users/@me/channels', {
    method: 'POST',
    body: { recipient_id: userId },
  });
  await createChannelMessage(botToken, channel.id, payload);
}

// --- Kanäle anlegen/löschen, Nachrichten lesen (Ticket-System) ------------------------------------------

export interface PermissionOverwrite {
  /** Rollen- oder Benutzer-ID (@everyone = Server-ID). */
  id: string;
  type: 'role' | 'member';
  allow?: bigint;
  deny?: bigint;
}

/** Häufige Kanalrechte (Bitmasken). */
export const ChannelPerm = {
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  HISTORY: 1n << 16n,
} as const;

const toOverwrite = (o: PermissionOverwrite) => ({ id: o.id, type: o.type === 'role' ? 0 : 1, allow: String(o.allow ?? 0n), deny: String(o.deny ?? 0n) });

export async function createGuildTextChannel(
  botToken: string,
  guildId: string,
  opts: { name: string; parentId?: string | null; topic?: string; overwrites?: PermissionOverwrite[] },
): Promise<{ id: string; name: string }> {
  const data = await discordFetch<{ id: string; name: string }>(botToken, `/guilds/${guildId}/channels`, {
    method: 'POST',
    body: { name: opts.name, type: 0, ...(opts.parentId ? { parent_id: opts.parentId } : {}), ...(opts.topic ? { topic: opts.topic } : {}), permission_overwrites: (opts.overwrites ?? []).map(toOverwrite) },
  });
  return { id: data.id, name: data.name };
}

export async function deleteChannel(botToken: string, channelId: string): Promise<void> {
  await discordFetch<void>(botToken, `/channels/${channelId}`, { method: 'DELETE' });
}

/** Setzt (oder entfernt mit `null`) das Recht eines Mitglieds in einem Kanal. */
export async function setChannelMemberAccess(botToken: string, channelId: string, userId: string, access: { allow: bigint; deny?: bigint } | null): Promise<void> {
  if (access === null) {
    await discordFetch<void>(botToken, `/channels/${channelId}/permissions/${userId}`, { method: 'DELETE' });
    return;
  }
  await discordFetch<void>(botToken, `/channels/${channelId}/permissions/${userId}`, { method: 'PUT', body: { type: 1, allow: String(access.allow), deny: String(access.deny ?? 0n) } });
}

export interface RawChannelMessage {
  id: string;
  content: string;
  timestamp: string;
  author: { id: string; username: string; global_name?: string | null; bot?: boolean };
  attachments: { filename: string; url: string }[];
  embeds: unknown[];
}

/** Alle Nachrichten eines Kanals (älteste zuerst), seitenweise geladen (max. `limit`). Inhalte erfordern den Message-Content-Intent. */
export async function listChannelMessages(botToken: string, channelId: string, limit = 1000): Promise<RawChannelMessage[]> {
  const out: RawChannelMessage[] = [];
  let before: string | undefined;
  while (out.length < limit) {
    const page = await discordFetch<RawChannelMessage[]>(botToken, `/channels/${channelId}/messages?limit=100${before ? `&before=${before}` : ''}`);
    if (!page.length) break;
    out.push(...page);
    before = page[page.length - 1]!.id;
    if (page.length < 100) break;
  }
  return out.slice(0, limit).reverse();
}

export async function getCurrentBotUserId(botToken: string): Promise<string> {
  return (await discordFetch<{ id: string }>(botToken, '/users/@me')).id;
}
