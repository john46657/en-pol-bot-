import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@nexus/types';

export const ANY_SCOPE_KEY = 'nexus:any-scope';

/**
 * Endpoint für Benutzer, die mindestens **eines** der Rechte irgendwo besitzen – auch nur eingeschränkt (z. B. für
 * das eigene Team). Die Prüfung auf die konkrete Ressource (Team der Akte) übernimmt der Service.
 */
export const RequireAnyScope = (...keys: Permission[]) => SetMetadata(ANY_SCOPE_KEY, keys);

/** Zugriffskontext des Aufrufers (vom `PermissionGuard` gesetzt). */
export interface RequestAccess {
  guildId: string;
  userId: string;
  roleIds: string[];
  bypass: boolean;
}

export const Access = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestAccess => {
    const request = ctx.switchToHttp().getRequest<{ access?: RequestAccess }>();
    if (!request.access)
      throw new Error(
        'Zugriffskontext fehlt – Route benötigt @RequirePermissions/@RequireAnyScope.',
      );
    return request.access;
  },
);
