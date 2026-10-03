import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
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

  /** Startet den Discord-Login (klassische 302 auf die Authorize-URL). */
  @Get('discord')
  @Public()
  login(@Res() res: Response, @Query('state') state?: string): void {
    res.redirect(this.authService.getAuthorizationUrl(state));
  }

  /**
   * OAuth2-Callback: tauscht den Code gegen einen Session-JWT, setzt ihn als
   * httpOnly-Cookie und leitet ins Dashboard weiter (Token zusätzlich als
   * Query-Parameter für Nicht-Browser-Clients).
   */
  @Get('discord/callback')
  @Public()
  async callback(@Query('code') code: string | undefined, @Res() res: Response): Promise<void> {
    if (!code) {
      throw new BadRequestException('Authorization Code fehlt.');
    }

    const login: LoginResult = await this.authService.handleCallback(code);
    const dashboardUrl = this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001';
    const isProd = this.config.get<string>('NODE_ENV') === 'production';

    res.cookie('nexus_session', login.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${dashboardUrl}/auth/callback?token=${encodeURIComponent(login.token)}`);
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
