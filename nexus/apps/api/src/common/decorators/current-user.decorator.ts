import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Authentifizierter User aus dem Request.
 *
 * `request.user` wird vom Auth-Layer (Discord OAuth2) gesetzt. Im
 * Nicht-Produktions-Betrieb kann der DevUserMiddleware einen User aus
 * Headern emulieren, damit Endpunkte ohne OAuth getestet werden können.
 */
export interface RequestUser {
  id: string;
  roleIds?: string[];
  username?: string;
  globalName?: string;
  avatar?: string | null;
  /** Discord-OAuth2-Access-Token (für Guild-Listen, §2). */
  at?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return request.user;
  },
);
