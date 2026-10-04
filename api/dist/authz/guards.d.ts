import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from './permission.service';
import { DiscordService } from '../discord/discord.service';
export declare const SESSION_COOKIE = "enrp_session";
export declare const hashToken: (t: string) => string;
export declare class AuthGuard implements CanActivate {
    private readonly reflector;
    private readonly prisma;
    private readonly discord;
    private readonly botToken;
    constructor(reflector: Reflector, prisma: PrismaService, discord: DiscordService);
    private validBotToken;
    private botFailure;
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
export declare class PermissionGuard implements CanActivate {
    private readonly reflector;
    private readonly perms;
    private readonly prisma;
    constructor(reflector: Reflector, perms: PermissionService, prisma: PrismaService);
    canActivate(ctx: ExecutionContext): Promise<boolean>;
}
