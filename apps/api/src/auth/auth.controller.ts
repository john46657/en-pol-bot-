import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { TwoFactorService } from './two-factor.service';
import { DiscordLoginFailure, DiscordOAuthService } from './discord-oauth.service';
import { webUrl } from '../common/web-url';
import { AppError } from '../common/errors';
import { CurrentActor, CurrentUser, Public, RequirePermission } from '../authz/decorators';
import { SESSION_COOKIE } from '../authz/guards';
import { zodBody } from '../common/zod.pipe';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';
import { loadEnv } from '../config/env';

const OAUTH_COOKIE = 'enrp_oauth';
const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });
const login2faSchema = z.object({ ticket: z.string().min(10).max(300), code: z.string().trim().min(6).max(20) });
const loginSchema = z.object({ username: z.string().min(1).max(64), password: z.string().min(1).max(256) });

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly env = loadEnv();
  constructor(private readonly auth: AuthService, private readonly discord: DiscordOAuthService, private readonly twoFactor: TwoFactorService) {}

  private secure() { return this.env.COOKIE_SECURE ? this.env.COOKIE_SECURE === 'true' : this.env.NODE_ENV === 'production'; }

  /** Welche Anmeldewege es gibt (Login-Seite). */
  /** Einladungs-Link für den Bot (Einstellungen → „Bot zu einem Server hinzufügen“). */
  @Get('discord/invite') @RequirePermission('settings.view')
  invite() { return { url: this.discord.inviteUrl() }; }

  @Public() @Get('providers')
  providers() { return { discord: this.discord.enabled(), password: this.discord.passwordLoginAllowed() }; }

  /** „Mit Discord anmelden“ → weiter zu Discord. */
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } }) @Get('discord')
  discordStart(@Res() res: Response) {
    try {
      const s = this.discord.start('login');
      res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
      res.redirect(302, s.url);
    } catch { res.redirect(302, webUrl('/login?discord=disabled')); }
  }

  /** Angemeldeter Benutzer verknüpft sein Discord-Konto per Discord-Login (statt Einmal-Code). */
  @Get('discord/link')
  discordLink(@CurrentUser() user: AuthUser, @Res() res: Response) {
    try {
      const s = this.discord.start('link', user.id);
      res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
      res.redirect(302, s.url);
    } catch { res.redirect(302, webUrl('/?discord=disabled')); }
  }

  /** Bot auf einen Server einladen – über das Dashboard (löst den Code ein; klappt auch mit „OAuth2-Code-Erlaubnis benötigt“). */
  @Get('discord/install') @RequirePermission('settings.view')
  discordInstall(@CurrentUser() user: AuthUser, @Res() res: Response) {
    try {
      const s = this.discord.start('install', user.id);
      res.cookie(OAUTH_COOKIE, s.browser, { httpOnly: true, sameSite: 'lax', secure: this.secure(), maxAge: 10 * 60_000, path: '/api/v1/auth/discord' });
      res.redirect(302, s.url);
    } catch { res.redirect(302, webUrl('/admin/settings?discord=disabled')); }
  }

  /** Rücksprung von Discord (diese Adresse muss im Developer Portal unter OAuth2 → Redirects stehen). */
  @Public() @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 20, ttl: 60_000 } }) @Get('discord/callback')
  async discordCallback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Query('error') error: string | undefined, @Req() req: AppRequest & { cookies?: Record<string, string> }, @Res() res: Response) {
    res.clearCookie(OAUTH_COOKIE, { path: '/api/v1/auth/discord' });
    if (error) return res.redirect(302, webUrl('/login?discord=cancelled'));
    // (Abbruch beim Bot-Einladen landet ebenfalls hier – die Login-Seite leitet Angemeldete einfach weiter)
    try {
      const r = await this.discord.callback(code, state, req.cookies?.[OAUTH_COOKIE], { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
      if (r.kind === 'linked') return res.redirect(302, webUrl('/?discord=linked'));
      if (r.kind === 'installed') return res.redirect(302, webUrl(`/admin/settings?discord=installed${r.guildName ? `&server=${encodeURIComponent(r.guildName)}` : ''}`));
      res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
      return res.redirect(302, webUrl('/'));
    } catch (e) {
      if (e instanceof DiscordLoginFailure && e.code === 'install_failed') return res.redirect(302, webUrl('/admin/settings?discord=install_failed'));
      return res.redirect(302, webUrl(`/login?discord=${e instanceof DiscordLoginFailure ? e.code : 'failed'}`));
    }
  }

  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : loadEnv().LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body(zodBody(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    // Ist „Mit Discord anmelden“ eingerichtet, gibt es nur noch Discord (Notfall: PASSWORD_LOGIN=true)
    if (!this.discord.passwordLoginAllowed()) throw new AppError('PERMISSION_DENIED', 'Die Anmeldung mit Passwort ist deaktiviert – bitte mit Discord anmelden.');
    const r = await this.auth.login(body.username, body.password, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
    if ('twoFactorRequired' in r) return r;
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
    return r.user;
  }

  /** Zweiter Anmeldeschritt (Code aus der Authenticator-App oder Wiederherstellungscode). */
  @Public()
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : loadEnv().LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @Post('login/2fa')
  @HttpCode(200)
  async login2fa(@Body(zodBody(login2faSchema)) body: z.infer<typeof login2faSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    if (!this.discord.passwordLoginAllowed()) throw new AppError('PERMISSION_DENIED', 'Die Anmeldung mit Passwort ist deaktiviert – bitte mit Discord anmelden.');
    const r = await this.auth.loginTwoFactor(body.ticket, body.code, { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId });
    res.cookie(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: 'strict', secure: this.secure(), expires: r.expiresAt, path: '/' });
    return r.user;
  }

  // ---- eigene Zwei-Faktor-Sicherung (jeder angemeldete Benutzer) ----
  @Get('2fa')
  twoFactorStatus(@CurrentUser() user: AuthUser) { return this.twoFactor.status(user.id); }

  @Post('2fa/setup') @HttpCode(200)
  twoFactorSetup(@CurrentActor() actor: Actor) { return this.twoFactor.setup(actor); }

  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  @Post('2fa/enable') @HttpCode(200)
  twoFactorEnable(@CurrentActor() actor: Actor, @Body(zodBody(codeSchema)) body: z.infer<typeof codeSchema>) { return this.twoFactor.enable(actor, body.code); }

  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  @Post('2fa/disable') @HttpCode(204)
  async twoFactorDisable(@CurrentActor() actor: Actor, @Body(zodBody(codeSchema)) body: z.infer<typeof codeSchema>) { await this.twoFactor.disable(actor, body.code); }

  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 10_000 : 10, ttl: 60_000 } })
  @Post('2fa/recovery') @HttpCode(200)
  twoFactorRecovery(@CurrentActor() actor: Actor, @Body(zodBody(codeSchema)) body: z.infer<typeof codeSchema>) { return this.twoFactor.regenerate(actor, body.code); }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser, @CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor, user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }
}
