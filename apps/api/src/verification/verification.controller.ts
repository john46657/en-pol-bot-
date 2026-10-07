import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { VerifyConfig } from '@enrp/shared';
import { verifyConfigSchema, VerificationService } from './verification.service';
import { oauthSettingsSchema, RobloxOAuthFailure, RobloxOAuthService, type OAuthSettings } from './roblox-oauth.service';
import { BotService, CurrentActor, Public, RequirePermission } from '../authz/decorators';
import type { Actor } from '../audit/audit.service';
import { zodBody } from '../common/zod.pipe';
import { currentGuild } from '../common/guild-context';
import { AppError } from '../common/errors';

const sf = z.string().regex(/^\d{15,25}$/);
const guildQ = z.object({ guildId: sf.optional() });
const listQ = z.object({ q: z.string().trim().max(64).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(25) });
const member = z.object({ guildId: sf.optional(), discordId: sf, discordName: z.string().trim().max(100).optional() });
const did = (v: string) => { if (!/^\d{15,25}$/.test(v)) throw new AppError('VALIDATION_FAILED', 'Ungültige Discord-ID.'); return v; };
const fast = { default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 600, ttl: 60_000 } };

/** Administration → Roblox-Verifizierung. */
@ApiTags('verification')
@Controller('verification')
export class VerificationController {
  constructor(private readonly s: VerificationService, private readonly oauth: RobloxOAuthService) {}
  @Get('oauth') @RequirePermission('settings.view') oauthSettings() { return this.oauth.settings(); }
  @Put('oauth') @RequirePermission('settings.manage')
  saveOauth(@CurrentActor() a: Actor, @Body(zodBody(oauthSettingsSchema)) b: OAuthSettings) { return this.oauth.save(a, b); }
  @Get('config') @RequirePermission('settings.view')
  config(@Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.config(q.guildId ?? currentGuild()); }
  @Put('config') @RequirePermission('settings.manage')
  save(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>, @Body(zodBody(verifyConfigSchema)) b: VerifyConfig) { return this.s.save(a, b, q.guildId ?? currentGuild()); }
  @Post('panel') @HttpCode(200) @RequirePermission('settings.manage')
  panel(@CurrentActor() a: Actor, @Query(zodBody(guildQ)) q: z.infer<typeof guildQ>) { return this.s.postPanel(a, q.guildId ?? currentGuild() ?? null); }
  @Get('links') @RequirePermission('settings.view')
  list(@Query(zodBody(listQ)) q: z.infer<typeof listQ>) { return this.s.list(q); }
  @Delete('links/:discordId') @RequirePermission('settings.manage')
  unlink(@CurrentActor() a: Actor, @Param('discordId') id: string) { return this.s.unlink(a, did(id)); }
  @Post('links/:discordId/refresh') @HttpCode(200) @RequirePermission('settings.manage')
  refresh(@Param('discordId') id: string) { return this.s.refresh(did(id)); }
}

/** Dienstweg des Bots: Verifizieren, Status (Beitritt, /aktualisieren), Panel-Ort melden. */
@ApiTags('bot')
@Controller('bot/verify')
export class BotVerificationController {
  constructor(private readonly s: VerificationService, private readonly oauth: RobloxOAuthService) {}
  /** „Mit Roblox anmelden“: eingerichtet? Dann Anmelde-Link für dieses Mitglied. */
  @BotService() @Throttle(fast) @Post('oauth') @HttpCode(200)
  async oauthLink(@Body(zodBody(member)) b: z.infer<typeof member>) { return (await this.oauth.enabled()) ? { enabled: true, ...(await this.oauth.link(b.guildId, b.discordId, b.discordName)) } : { enabled: false }; }
  @BotService() @Get('config') config(@Query(zodBody(z.object({ guildId: sf }))) q: { guildId: string }) { return this.s.config(q.guildId); }
  @BotService() @Throttle(fast) @Post('start') @HttpCode(200)
  start(@Body(zodBody(member.extend({ roblox: z.string().trim().min(1).max(100) }))) b: z.infer<typeof member> & { roblox: string }) { return this.s.start(b.guildId, b.discordId, b.roblox); }
  @BotService() @Throttle(fast) @Post('check') @HttpCode(200)
  check(@Body(zodBody(member)) b: z.infer<typeof member>) { return this.s.check(b.guildId, b.discordId, b.discordName); }
  @BotService() @Throttle(fast) @Post('status') @HttpCode(200)
  status(@Body(zodBody(member)) b: z.infer<typeof member>) { return this.s.status(b.guildId, b.discordId, b.discordName); }
  @BotService() @Get('whois') whois(@Query(zodBody(z.object({ discordId: sf }))) q: { discordId: string }) { return this.s.whois(q.discordId); }
  @BotService() @Post('unlink') @HttpCode(200) unlink(@Body(zodBody(z.object({ discordId: sf }))) b: { discordId: string }) { return this.s.unlink(null, b.discordId); }
  @BotService() @Post('panel-posted') @HttpCode(200)
  posted(@Body(zodBody(z.object({ guildId: sf.nullish(), channelId: sf, messageId: sf }))) b: { guildId?: string | null; channelId: string; messageId: string }) { return this.s.panelPosted(b.guildId ?? null, b.channelId, b.messageId); }
}

const page = (ok: boolean, title: string, text: string) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1020;color:#e5e7eb;font:16px system-ui,sans-serif;padding:16px}main{max-width:420px;text-align:center;background:#111827;border:1px solid #1f2937;border-radius:12px;padding:28px}h1{font-size:22px;margin:8px 0}p{color:#9ca3af}.i{font-size:42px}</style></head>
<body><main><div class="i">${ok ? '✅' : '⚠️'}</div><h1>${title}</h1><p>${text}</p></main></body></html>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Rücksprung von Roblox (diese Adresse muss in der Roblox-OAuth-App als Redirect-URL stehen). */
@ApiTags('verification')
@Controller('verify/roblox')
export class RobloxOAuthController {
  constructor(private readonly oauth: RobloxOAuthService) {}
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 30, ttl: 60_000 } }) @Get('callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Res() res: Response) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    if (error) return res.status(400).send(page(false, 'Abgebrochen', 'Die Anmeldung bei Roblox wurde abgebrochen. Klick in Discord noch einmal auf „Verifizieren“.'));
    try {
      const r = await this.oauth.callback(code, state);
      return res.send(page(true, `Verifiziert als ${esc(r.robloxName)}`, 'Dein Roblox-Konto ist jetzt mit Discord verknüpft. Rollen und Nickname kommen in ein paar Sekunden – du kannst dieses Fenster schließen und zurück zu Discord gehen.'));
    } catch (e) {
      return res.status(400).send(page(false, 'Nicht verifiziert', esc(e instanceof RobloxOAuthFailure ? e.message : 'Etwas ist schiefgelaufen. Versuch es noch einmal.')));
    }
  }
}
