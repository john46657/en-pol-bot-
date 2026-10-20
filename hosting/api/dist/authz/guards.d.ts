import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordAccessService } from './discord-access.service';
import { AuthorizationService } from './authorization.service';
export declare const SESSION_COOKIE = "enrp_session";
export declare const hashToken: (t: string) => string;
export declare class AuthGuard implements CanActivate {
    private readonly reflector;
    private readonly prisma;
    private readonly discord;
    private readonly access;
    private readonly authz;
    private readonly botToken;
    constructor(reflector: Reflector, prisma: PrismaService, discord: DiscordService, access: DiscordAccessService, authz: AuthorizationService);
    private validBotToken;
    private botFailure;
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
/**
 * Jede Route mit `@RequirePermission` läuft über den zentralen AuthorizationService: Server der Anfrage (X-Guild-Id)
 * registriert und aktiv, bestätigte Mitgliedschaft, Modul an, Berechtigung. Routen unter `/servers/:serverId/…` prüfen
 * zusätzlich gegen den Pfad-Server (siehe ServersController) – der Header kann den Pfad nie übersteuern.
 */
export declare class PermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly authz;
    private readonly moduleRef;
    constructor(reflector: Reflector, authz: AuthorizationService, moduleRef: ModuleRef);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
    /** Bot-Klick mit Manager-Rolle der Bewerbung: fehlt NUR das Recht (Server, Mitgliedschaft, Modul passen), reicht die Rolle. */
    private discordManager;
}
