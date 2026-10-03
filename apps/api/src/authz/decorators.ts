import { SetMetadata } from '@nestjs/common';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { PermissionKey } from '@enrp/shared';
import type { AppRequest, AuthUser } from '../common/request-context';
import type { Actor } from '../audit/audit.service';

export const PUBLIC_KEY = 'isPublic';
export const PERMISSION_KEY = 'requiredPermissions';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Alle genannten Permissions werden benötigt. */
export const RequirePermission = (...p: PermissionKey[]) => SetMetadata(PERMISSION_KEY, p);

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<AppRequest>().user as AuthUser);
export const CurrentActor = createParamDecorator((_d: unknown, ctx: ExecutionContext): Actor => {
  const r = ctx.switchToHttp().getRequest<AppRequest>();
  return { userId: r.user?.id ?? null, robloxUserId: r.user?.robloxUserId ?? null, requestId: r.requestId };
});
