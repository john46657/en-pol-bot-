import { BadRequestException, Controller, Get, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { userRepository } from '@nexus/database';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  generateState,
  verifyState,
} from './oauth-state.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/decorators/current-user.decorator.js';
import { AuthService } from './auth.service.js';
import type { LoginResult } from './auth.service.js';
import { GuildService } from '../guild/guild.service.js';
import { ConfigService } from '@nestjs/config';

/**
 * AuthController (§114): Discord OAuth2 Login.
 *
 * Flow: Dashboard → /auth/discord (Redirect zu Discord) →
 * /auth/discord/callback (Code → Session-JWT) → Redirect ins Dashboard.
 */
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    private readonly guilds: GuildService,
  ) {}

  /** Startet den Discord-Login: erzeugt ein zufälliges `state` (Cookie) und leitet zu Discord weiter. */
  @Get('discord')
  @Public()
  login(@Res() res: Response): void {
    const state = generateState();
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...this.cookieBase(),
      maxAge: OAUTH_STATE_TTL_MS,
      sameSite: 'lax',
    });
    res.redirect(this.authService.getAuthorizationUrl(state));
  }

  /**
   * OAuth2-Callback: prüft `state`, tauscht den Code gegen einen Session-JWT, setzt ihn als
   * httpOnly-Cookie und leitet ins Dashboard. Der Token steht nie in der URL. Fehler und Abbruch
   * durch den User führen zurück zur Login-Seite des Dashboards.
   */
  @Get('discord/callback')
  @Public()
  async callback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const dashboardUrl =
      this.config.get<string>('DASHBOARD_URL')?.split(',')[0] ?? 'http://localhost:3001';
    const fail = (reason: string): void => res.redirect(`${dashboardUrl}/login?error=${reason}`);
    const expected: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, this.cookieBase());

    if (error) return fail('denied');
    if (!verifyState(expected, state)) return fail('state');
    if (!code) return fail('failed');

    let login: LoginResult;
    try {
      login = await this.authService.handleCallback(code);
    } catch {
      return fail('failed');
    }
    await userRepository
      .upsert({
        id: login.user.id,
        username: login.user.username,
        globalName: login.user.globalName,
        avatarUrl: login.user.avatar
          ? `https://cdn.discordapp.com/avatars/${login.user.id}/${login.user.avatar}.png`
          : null,
      })
      .catch(() => undefined);

    res.cookie('nexus_session', login.token, {
      ...this.cookieBase(),
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.redirect(`${dashboardUrl}/auth/callback`);
  }

  /** Beendet die Session (Cookie löschen). */
  @Post('logout')
  @Public()
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    res.clearCookie('nexus_session', this.cookieBase());
    return { ok: true };
  }

  private cookieBase() {
    const isProd =
      (this.config.get<string>('NODE_ENV') ?? process.env['NODE_ENV']) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      path: '/',
    };
  }

  /** Aktuelle Session – zeigt, wer eingeloggt ist (geschützt). */
  @Get('me')
  @ApiBearerAuth()
  me(@CurrentUser() user: RequestUser): Omit<RequestUser, 'at'> {
    // Der Discord-Access-Token bleibt serverseitig – nie an den Client ausliefern.
    const { at: _at, ...safe } = user;
    return safe;
  }

  /**
   * Bot-Einladung (Invite-Flow, §1/§2): leitet zu Discords Authorize-Seite mit
   * Bot-Scope. Optional mit vorausgewähltem Server (`guildId`).
   */
  @Get('discord/invite')
  @Public()
  invite(@Res() res: Response, @Query('guildId') guildId?: string): void {
    const clientId = this.config.get<string>('DISCORD_CLIENT_ID');
    if (!clientId) throw new BadRequestException('DISCORD_CLIENT_ID ist nicht konfiguriert.');
    const url = new URL('https://discord.com/oauth2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('scope', 'bot applications.commands');
    // Kanäle ansehen, Nachrichten senden, Links einbetten, Rollen verwalten
    url.searchParams.set('permissions', String(1024 + 2048 + 16384 + 268435456));
    if (guildId && /^\d{15,25}$/.test(guildId)) {
      url.searchParams.set('guild_id', guildId);
      url.searchParams.set('disable_guild_select', 'true');
    }
    res.redirect(url.toString());
  }

  /**
   * Server des Users für die Serverauswahl (§1/§2): nur Gilden, auf denen
   * der User berechtigt ist. `at` (Discord Access Token) kommt aus der Session.
   */
  @Get('me/guilds')
  @ApiBearerAuth()
  async myGuilds(@CurrentUser() user: RequestUser) {
    return this.guilds.listUserGuilds(user.id, user.at ?? '');
  }
}
