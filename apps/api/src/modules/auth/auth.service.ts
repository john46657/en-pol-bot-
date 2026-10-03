import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exchangeCode, fetchDiscordUser, getAuthorizationUrl, signSession } from '@nexus/auth';

export interface LoginResult {
  token: string;
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
}

/**
 * AuthService (§114): Discord OAuth2 Code Flow → NEXUS Session-JWT.
 *
 * Authorisierung (Permissions) ist NICHT Teil der Session – die prüft der
 * PermissionGuard pro Request serverseitig.
 */
@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  /** Discord-Authorize-URL für den Login-Button im Dashboard. */
  getAuthorizationUrl(state?: string): string {
    return getAuthorizationUrl({
      clientId: this.require('DISCORD_CLIENT_ID'),
      redirectUri: this.redirectUri(),
      ...(state ? { state } : {}),
    });
  }

  /** OAuth2-Callback: Code austauschen, User laden, Session-JWT ausstellen. */
  async handleCallback(code: string): Promise<LoginResult> {
    const tokens = await exchangeCode({
      code,
      clientId: this.require('DISCORD_CLIENT_ID'),
      clientSecret: this.require('DISCORD_CLIENT_SECRET'),
      redirectUri: this.redirectUri(),
    });

    const discordUser = await fetchDiscordUser(tokens.accessToken);

    const token = await signSession(
      {
        sub: discordUser.id,
        username: discordUser.username,
        ...(discordUser.globalName ? { globalName: discordUser.globalName } : {}),
        avatar: discordUser.avatar,
        at: tokens.accessToken,
      },
      {
        secret: this.require('AUTH_SECRET'),
        issuer: this.require('JWT_ISSUER'),
      },
    );

    return {
      token,
      user: {
        id: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.globalName,
        avatar: discordUser.avatar,
      },
    };
  }

  private redirectUri(): string {
    const configured = this.config.get<string>('AUTH_CALLBACK_URL');
    const apiBase = this.config.get<string>('API_URL') ?? 'http://localhost:3000';
    return configured ?? `${apiBase}/api/v1/auth/discord/callback`;
  }

  private require(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new Error(`Umgebungsvariable ${key} fehlt – Auth nicht konfiguriert.`);
    return value;
  }
}
