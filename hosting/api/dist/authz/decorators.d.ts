import type { PermissionKey } from '@enrp/shared';
export declare const PUBLIC_KEY = "isPublic";
export declare const PERMISSION_KEY = "requiredPermissions";
export declare const BOT_SERVICE_KEY = "botService";
export declare const SERVICE_AUTHORIZED_KEY = "serviceAuthorized";
export declare const Public: () => import("@nestjs/common").CustomDecorator<string>;
/** Route nur für den Discord-Bot-Dienst (Bot-Token, kein Benutzerkontext). */
export declare const BotService: () => import("@nestjs/common").CustomDecorator<string>;
/**
 * Ausdrückliche Entscheidung: die Route autorisiert im Service über den AuthorizationService gegen den Server bzw. die
 * Verbindung aus dem PFAD (Rechte je Server). Angemeldet sein muss man trotzdem (AuthGuard).
 */
export declare const ServiceAuthorized: () => import("@nestjs/common").CustomDecorator<string>;
/** Alle genannten Permissions werden benötigt. */
export declare const RequirePermission: (...p: PermissionKey[]) => import("@nestjs/common").CustomDecorator<string>;
export declare const DISCORD_MANAGER_KEY = "discordManager";
/**
 * Discord-Buttons an Bewerbungen: wer im Discord eine der eingestellten Manager-Rollen (Setup → Role Config) hat, darf die
 * Aktion über den Bot auch ohne das Recht im System ausführen. Server, Mitgliedschaft und Modul werden trotzdem geprüft.
 */
export declare const DiscordManagerAllows: (kind: "police" | "quali") => import("@nestjs/common").CustomDecorator<string>;
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
export declare const CurrentActor: (...dataOrPipes: unknown[]) => ParameterDecorator;
