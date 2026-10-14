import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
    private readonly botToken;
    constructor(reflector: Reflector, prisma: PrismaService, discord: DiscordService, access: DiscordAccessService);
    private validBotToken;
    private botFailure;
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
/** Jede Route mit `@RequirePermission` läuft über den zentralen AuthorizationService (Modul an, Berechtigung). */
export declare class PermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly authz;
    constructor(reflector: Reflector, authz: AuthorizationService);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
