import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { loadEnv } from '../config/env';
import { webUrl } from '../common/web-url';
import { VerificationService } from './verification.service';

const KEY = 'verify.oauth';
const STATE_TTL = 10 * 60_000;
export const oauthSettingsSchema = z.object({
  clientId: z.string().trim().regex(/^\d{5,25}$/, 'Client-ID: nur Ziffern (aus create.roblox.com → OAuth 2.0 Apps)').or(z.literal('')),
  /** Leer lassen = bisheriges Secret behalten. */
  clientSecret: z.string().trim().max(200).optional(),
});
export type OAuthSettings = z.infer<typeof oauthSettingsSchema>;

export class RobloxOAuthFailure extends Error {}

/**
 * „Mit Roblox anmelden“ (OAuth 2.0, Scopes `openid profile`) – wie bei RoVer: Das Mitglied meldet sich direkt bei Roblox an,
 * Roblox bestätigt das Konto, danach gibt es Rollen und Nickname. Der Vorgang gehört über einen einmaligen `state` zum Discord-Mitglied.
 */
@Injectable()
export class RobloxOAuthService {
  private readonly env = loadEnv();
  private readonly log = new Logger('RobloxOAuth');
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly verification: VerificationService) {}

  redirectUri() { return webUrl('/api/v1/verify/roblox/callback'); }

  private async creds(): Promise<{ clientId: string; clientSecret: string } | null> {
    if (this.env.ROBLOX_CLIENT_ID && this.env.ROBLOX_CLIENT_SECRET) return { clientId: this.env.ROBLOX_CLIENT_ID, clientSecret: this.env.ROBLOX_CLIENT_SECRET };
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value as { clientId?: string; clientSecret?: string } | undefined;
    return v?.clientId && v.clientSecret ? { clientId: v.clientId, clientSecret: v.clientSecret } : null;
  }

  async enabled() { return !!(await this.creds()); }

  /** Für das Dashboard – das Secret verlässt den Server nie. */
  async settings() {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value as { clientId?: string; clientSecret?: string } | undefined;
    const fromEnv = !!(this.env.ROBLOX_CLIENT_ID && this.env.ROBLOX_CLIENT_SECRET);
    return { enabled: await this.enabled(), fromEnv, clientId: fromEnv ? this.env.ROBLOX_CLIENT_ID! : v?.clientId ?? '', hasSecret: fromEnv || !!v?.clientSecret, redirectUri: this.redirectUri() };
  }

  async save(actor: Actor, input: OAuthSettings) {
    const cur = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value as { clientId?: string; clientSecret?: string } | undefined;
    const value = { clientId: input.clientId, clientSecret: input.clientId ? (input.clientSecret || cur?.clientSecret || '') : '' };
    await this.prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    await this.audit.record(actor, { action: 'verification.oauth', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: { clientId: value.clientId, secretChanged: !!input.clientSecret } });
    return this.settings();
  }

  /** Bot: Anmelde-Link für ein Mitglied (10 Minuten, einmal verwendbar). */
  async link(guildId: string | undefined, discordId: string, discordName?: string) {
    const c = await this.creds();
    if (!c) throw new AppError('CAPABILITY_UNAVAILABLE', 'Die Roblox-Anmeldung ist noch nicht eingerichtet (Dashboard → Roblox-Verifizierung).');
    if (guildId && !(await this.verification.config(guildId)).enabled) throw new AppError('CONFLICT', 'Die Roblox-Verifizierung ist auf diesem Server nicht aktiviert.');
    await this.prisma.robloxOAuthState.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { discordId }] } });
    const state = randomBytes(24).toString('base64url');
    await this.prisma.robloxOAuthState.create({ data: { state, discordId, discordName: discordName ?? null, guildId: guildId ?? null, expiresAt: new Date(Date.now() + STATE_TTL) } });
    const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: this.redirectUri(), scope: 'openid profile', response_type: 'code', state });
    return { url: `https://apis.roblox.com/oauth/v1/authorize?${q}`, expiresAt: new Date(Date.now() + STATE_TTL) };
  }

  /** Rücksprung von Roblox: Code einlösen, Konto lesen, verknüpfen; Rollen setzt der Bot gleich auf allen Servern. */
  async callback(code: string | undefined, state: string | undefined) {
    const s = state ? await this.prisma.robloxOAuthState.findUnique({ where: { state } }) : null;
    if (s) await this.prisma.robloxOAuthState.delete({ where: { state: s.state } }); // nur einmal verwendbar
    if (!s || s.expiresAt < new Date()) throw new RobloxOAuthFailure('Der Link ist abgelaufen oder wurde schon benutzt. Klick in Discord noch einmal auf „Verifizieren“.');
    const c = await this.creds();
    if (!c || !code) throw new RobloxOAuthFailure('Die Anmeldung bei Roblox hat nicht geklappt. Versuch es noch einmal.');
    const user = await this.fetchUser(c, code).catch((e) => { this.log.warn(`roblox oauth failed: ${e instanceof Error ? e.message : e}`); return null; });
    if (!user) throw new RobloxOAuthFailure('Roblox hat das Konto nicht bestätigt. Versuch es noch einmal.');
    const link = await this.verification.linkAccount(s.guildId, s.discordId, s.discordName, user, 'Roblox-Anmeldung');
    await this.verification.refresh(s.discordId);
    return { robloxName: link.robloxName, displayName: link.displayName };
  }

  private async fetchUser(c: { clientId: string; clientSecret: string }, code: string): Promise<{ id: string; name: string; displayName: string } | null> {
    const tok = await fetch('https://apis.roblox.com/oauth/v1/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(8000),
      body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: c.clientId, client_secret: c.clientSecret, redirect_uri: this.redirectUri() }),
    });
    if (!tok.ok) throw new Error(`token HTTP ${tok.status}`);
    const { access_token } = (await tok.json()) as { access_token?: string };
    if (!access_token) throw new Error('no access token');
    const info = await fetch('https://apis.roblox.com/oauth/v1/userinfo', { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8000) });
    if (!info.ok) throw new Error(`userinfo HTTP ${info.status}`);
    const u = (await info.json()) as { sub?: string; preferred_username?: string; nickname?: string; name?: string };
    if (!u.sub || !/^\d{1,19}$/.test(u.sub) || !u.preferred_username) return null;
    return { id: u.sub, name: u.preferred_username, displayName: u.nickname || u.name || u.preferred_username };
  }
}
