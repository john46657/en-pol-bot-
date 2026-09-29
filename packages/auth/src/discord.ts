import type { DiscordTokenSet, DiscordUser } from './types.js';

/** Discord API + OAuth2 Endpoints. */
const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_TOKEN = 'https://discord.com/api/oauth2/token';

/** Discord OAuth2-Scopes: identify für den User, guilds für Server-Mitgliedschaft. */
export const DEFAULT_SCOPES = ['identify', 'guilds'] as const;

export interface AuthorizationUrlParams {
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  state?: string;
}

/** Discord-Authorize-URL (§114: OAuth2 Code Flow). */
export function getAuthorizationUrl(params: AuthorizationUrlParams): string {
  const scopes = (params.scopes ?? DEFAULT_SCOPES).join(' ');
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  if (params.state) url.searchParams.set('state', params.state);
  return url.toString();
}

export interface ExchangeCodeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Austausch des Authorization Codes gegen Access/Refresh Token. */
export async function exchangeCode(params: ExchangeCodeParams): Promise<DiscordTokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(DISCORD_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = (await response.json()) as {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(
      `Discord OAuth2 Fehler: ${data.error ?? response.status} – ${data.error_description ?? 'Code-Austausch fehlgeschlagen.'}`,
    );
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresAt: Math.floor(Date.now() / 1000) + data.expires_in,
    scope: data.scope,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
  };
}

/** Aktuellen Discord-User laden (identify). */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
    email?: string | null;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(`Discord /users/@me Fehler: ${data.message ?? response.status}`);
  }

  return {
    id: data.id,
    username: data.username,
    globalName: data.global_name,
    avatar: data.avatar,
    ...(data.email !== undefined ? { email: data.email } : {}),
  };
}

/**
 * Gilden-Mitgliedschaften des Users (guilds-Scope) – für die Prüfung, ob der
 * User einer Guild überhaupt angehört.
 */
export async function fetchUserGuildIds(accessToken: string): Promise<string[]> {
  const response = await fetch(`${DISCORD_API}/users/@me/guilds`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = (await response.json()) as Array<{ id: string }> | { message: string };
  if (!response.ok) {
    throw new Error(
      `Discord /users/@me/guilds Fehler: ${(data as { message?: string }).message ?? response.status}`,
    );
  }
  return (data as Array<{ id: string }>).map((g) => g.id);
}

export interface GuildMemberParams {
  guildId: string;
  userId: string;
  botToken: string;
}

/**
 * Rollen eines Users in einer Guild – serverseitig autoritativ (§114) via
 * Bot-Token. Erfordert, dass der Bot Mitglied der Guild ist (Guild Members
 * Intent).
 */
export async function fetchGuildMemberRoles(params: GuildMemberParams): Promise<string[]> {
  const response = await fetch(`${DISCORD_API}/guilds/${params.guildId}/members/${params.userId}`, {
    headers: { Authorization: `Bot ${params.botToken}` },
  });

  const data = (await response.json()) as { roles?: string[]; message?: string; code?: number };
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(
      `Discord /guilds/{guild}/members/{user} Fehler: ${data.message ?? response.status}`,
    );
  }
  return data.roles ?? [];
}
