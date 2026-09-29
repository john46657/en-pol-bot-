import { BadRequestException, Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { RequestUser } from '../../common/decorators/current-user.decorator.js';
import { AuthService } from './auth.service.js';
import type { LoginResult } from './auth.service.js';
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
  me(@CurrentUser() user: RequestUser): RequestUser {
    return user;
  }
}
