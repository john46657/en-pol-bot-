import { OnGatewayConnection, OnGatewayInit } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { RealtimeService } from './realtime.service';
export declare class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
    private readonly prisma;
    private readonly perms;
    private readonly rt;
    server: Server;
    constructor(prisma: PrismaService, perms: PermissionService, rt: RealtimeService);
    afterInit(server: Server): void;
    /** Authentifizierung beim Handshake über das httpOnly-Session-Cookie; ohne gültige Session wird die Verbindung getrennt. */
    handleConnection(client: Socket): void;
    private authenticate;
    subscribe(client: Socket, body: {
        room?: string;
    }): Promise<{
        ok: boolean;
        code: string;
    } | {
        ok: boolean;
        code?: undefined;
    }>;
    unsubscribe(client: Socket, body: {
        room?: string;
    }): Promise<{
        ok: boolean;
    }>;
}
