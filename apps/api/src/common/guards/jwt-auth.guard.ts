import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { RequestUser } from '../decorators/current-user.decorator.js';

/**
 * JwtAuthGuard (§114: AuthN) – globale Absicherung.
 *
 * Authentifizierung (wer ist das?) via request.user, das von Auth- oder
 * DevUserMiddleware gesetzt wurde. Authorisierung (darf das?) macht der
 * PermissionGuard.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!request.user) {
      throw new UnauthorizedException('Nicht authentifiziert – bitte über Discord einloggen.');
    }
    return true;
  }
}
