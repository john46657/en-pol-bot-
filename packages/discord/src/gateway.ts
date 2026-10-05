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

/** Rate-Limit-Verhalten (Discord: 429 + `retry_after`). Eine Anfrage wird höchstens {@link MAX_RATE_RETRIES}-mal wiederholt. */
const MAX_RATE_RETRIES = 2;
const MAX_WAIT_MS = 10_000;
/** Bis wann ein Rate-Limit-Bereich (Methode + Route mit Haupt-ID) pausiert ist – verhindert sinnloses Weiterfragen. */
const pausedUntil = new Map<string, number>();
/** Laufende identische GET-Anfragen: parallele Aufrufer teilen sich eine Discord-Anfrage. */
const inflight = new Map<string, Promise<unknown>>();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** `GET /guilds/123/members/456` → `GET /guilds/123/members/:id` (erste ID = Hauptparameter bleibt erhalten). */
export function rateLimitBucket(method: string, endpoint: string): string {
  let first = true;
  return `${method} ${endpoint.split('?')[0]!.replace(/\/\d{5,}/g, (m) => (first ? ((first = false), m) : '/:id'))}`;
}

async function discordFetch<T>(
  botToken: string,
  endpoint: string,
  options: { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string> } = {},
  botHeader = true,
): Promise<T> {
  const method = options.method ?? 'GET';
  // Lesezugriffe zusammenfassen (z. B. 50 gleichzeitige Dashboard-Aufrufe → 1 Discord-Anfrage)
  if (method === 'GET') {
    const key = `${botHeader ? botToken : options.headers?.['Authorization'] ?? ''}|${endpoint}`;
    const running = inflight.get(key) as Promise<T> | undefined;
    if (running) return running;
    const p = send<T>(botToken, endpoint, options, botHeader).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  return send<T>(botToken, endpoint, options, botHeader);
}

async function send<T>(
  botToken: string,
  endpoint: string,
  options: { method?: string; body?: unknown; form?: FormData; headers?: Record<string, string> },
  botHeader: boolean,
): Promise<T> {
  const method = options.method ?? 'GET';
  const bucket = rateLimitBucket(method, endpoint);
  for (let attempt = 0; ; attempt++) {
    const wait = (pausedUntil.get(bucket) ?? 0) - Date.now();
    if (wait > 0) {
      if (wait > MAX_WAIT_MS) throw new DiscordApiError(429, endpoint, `Discord-Rate-Limit: bitte in ${Math.ceil(wait / 1000)} s erneut versuchen.`);
      await sleep(wait);
    }
    const response = await fetch(`${API}${endpoint}`, {
      method,
      headers: {
        ...(botHeader ? authHeader(botToken) : {}),
        ...(options.form ? {} : { 'Content-Type': 'application/json' }),
        ...(options.headers ?? {}),
      },
      ...(options.form ? { body: options.form } : options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    if (response.status === 204) return undefined as T;

    const data = (await response.json().catch(() => null)) as
      (T & { message?: string; code?: number; retry_after?: number }) | null;

    if (response.status === 429) {
      // 429 = nicht verarbeitet → Wiederholen ist auch bei Schreibzugriffen sicher
      const seconds = Number(response.headers.get('retry-after') ?? data?.retry_after ?? 1);
      const ms = Math.min(Math.max(Number.isFinite(seconds) ? seconds : 1, 0) * 1000, 60_000);
      pausedUntil.set(bucket, Date.now() + ms);
      if (attempt >= MAX_RATE_RETRIES || ms > MAX_WAIT_MS) throw new DiscordApiError(429, endpoint, data?.message ?? 'Discord-Rate-Limit erreicht.');
      continue;
    }
    if (!response.ok) {
      throw new DiscordApiError(response.status, endpoint, data?.message ?? response.statusText);
    }
    return data as T;
  }
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
  user: { id: string; username: string; global_name: string | null; avatar?: string | null };
  roles: string[];
  nick?: string | null;
}

function mapMember(m: RawMember): DiscordMemberSummary {
  return {
    userId: m.user.id,
    username: m.user.username,
    globalName: m.user.global_name,
    roles: m.roles,
    nick: m.nick ?? null,
    avatar: m.user.avatar ?? null,
  };
}

/** Discord-Konto (auch für Personen, die nicht mehr auf dem Server sind); `null`, wenn es das Konto nicht gibt. */
export async function getUserProfile(botToken: string, userId: string): Promise<{ id: string; username: string; globalName: string | null; avatar: string | null } | null> {
  const u = await discordFetch<{ id: string; username: string; global_name: string | null; avatar: string | null }>(botToken, `/users/${userId}`).catch((error: unknown) => {
    if (error instanceof DiscordApiError && (error.status === 404 || error.status === 400)) return null;
    throw error;
  });
  return u ? { id: u.id, username: u.username, globalName: u.global_name, avatar: u.avatar } : null;
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
  cache?: TtlCache,
): Promise<DiscordMemberSummary | null> {
  const key = `member:${guildId}:${userId}`;
  if (cache) {
    const hit = cache.get<{ member: DiscordMemberSummary | null }>(key);
    if (hit) return hit.member;
  }
  const member = await fetchGuildMember(botToken, guildId, userId);
  cache?.set(key, { member }, 60_000);
  return member;
}

async function fetchGuildMember(botToken: string, guildId: string, userId: string): Promise<DiscordMemberSummary | null> {
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

/** Timeout (Kommunikation sperren) bis zum Zeitpunkt; `null` hebt ihn auf. Discord erlaubt höchstens 28 Tage. */
export async function timeoutGuildMember(botToken: string, guildId: string, userId: string, until: Date | null, reason?: string): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/members/${userId}`, {
    method: 'PATCH',
    headers: reasonHeader(reason),
    body: { communication_disabled_until: until ? until.toISOString() : null },
  });
}

/** Wirft ein Mitglied vom Server (kann mit Einladung zurückkehren). */
export async function kickGuildMember(botToken: string, guildId: string, userId: string, reason?: string): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/members/${userId}`, { method: 'DELETE', headers: reasonHeader(reason) });
}

/** Bannt einen Benutzer (auch ohne Mitgliedschaft); `deleteMessageSeconds` löscht seine letzten Nachrichten (0–604800). */
export async function banGuildMember(botToken: string, guildId: string, userId: string, reason?: string, deleteMessageSeconds = 0): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/bans/${userId}`, {
    method: 'PUT',
    headers: reasonHeader(reason),
    body: { delete_message_seconds: Math.min(Math.max(Math.trunc(deleteMessageSeconds), 0), 604_800) },
  });
}

/** Hebt einen Bann auf (bereits aufgehoben = 404 → kein Fehler). */
export async function unbanGuildMember(botToken: string, guildId: string, userId: string, reason?: string): Promise<void> {
  await discordFetch<void>(botToken, `/guilds/${guildId}/bans/${userId}`, { method: 'DELETE', headers: reasonHeader(reason) }).catch((e: unknown) => {
    if (e instanceof DiscordApiError && e.status === 404) return;
    throw e;
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

export interface FileUpload {
  name: string;
  content: string | Uint8Array;
  contentType: string;
}

const formOf = (payload: MessagePayload, file: FileUpload): FormData => {
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ ...payload, attachments: [{ id: 0, filename: file.name }] }));
  form.append('files[0]', new Blob([file.content as never], { type: file.contentType }), file.name);
  return form;
};

/** Nachricht mit einer Datei im Anhang (z. B. HTML-Transcript). */
export async function createChannelMessageWithFile(botToken: string, channelId: string, payload: MessagePayload, file: FileUpload): Promise<{ id: string }> {
  const data = await discordFetch<{ id: string }>(botToken, `/channels/${channelId}/messages`, { method: 'POST', form: formOf(payload, file) });
  return { id: data.id };
}

export async function sendDirectMessageWithFile(botToken: string, userId: string, payload: MessagePayload, file: FileUpload): Promise<void> {
  const channel = await discordFetch<{ id: string }>(botToken, '/users/@me/channels', { method: 'POST', body: { recipient_id: userId } });
  await createChannelMessageWithFile(botToken, channel.id, payload, file);
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
  MANAGE_MESSAGES: 1n << 13n,
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
  author: { id: string; username: string; global_name?: string | null; bot?: boolean; avatar?: string | null };
  attachments: { filename: string; url: string; content_type?: string }[];
  embeds: unknown[];
  message_reference?: { message_id?: string };
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
