import type { PermissionKey } from '@enrp/shared';
export declare const PUBLIC_KEY = "isPublic";
export declare const PERMISSION_KEY = "requiredPermissions";
export declare const BOT_SERVICE_KEY = "botService";
export declare const Public: () => import("@nestjs/common").CustomDecorator<string>;
/** Route nur für den Discord-Bot-Dienst (Bot-Token, kein Benutzerkontext). */
export declare const BotService: () => import("@nestjs/common").CustomDecorator<string>;
/** Alle genannten Permissions werden benötigt. */
export declare const RequirePermission: (...p: PermissionKey[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
export declare const CurrentActor: (...dataOrPipes: unknown[]) => ParameterDecorator;
