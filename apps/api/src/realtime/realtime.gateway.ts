import { OnGatewayConnection, OnGatewayInit, SubscribeMessage, WebSocketGateway, WebSocketServer, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { hashToken, SESSION_COOKIE } from '../authz/guards';
import { ROOM_PERMISSION, RealtimeService } from './realtime.service';
import { loadEnv } from '../config/env';

const parseCookie = (h: string | undefined, name: string) => h?.split(';').map((c) => c.trim().split('=')).find(([k]) => k === name)?.[1];

@WebSocketGateway({ path: '/ws', cors: { origin: loadEnv().WEB_ORIGIN.split(','), credentials: true } })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly rt: RealtimeService) {}

  afterInit(server: Server) { this.rt.server = server; }

  /** Authentifizierung beim Handshake über das httpOnly-Session-Cookie; ohne gültige Session wird die Verbindung getrennt. */
  handleConnection(client: Socket) {
    // Promise sofort ablegen, damit frühe `subscribe`-Nachrichten auf die Authentifizierung warten.
    client.data.ready = this.authenticate(client);
  }

  private async authenticate(client: Socket) {
    const token = parseCookie(client.handshake.headers.cookie, SESSION_COOKIE);
    const session = token ? await this.prisma.session.findUnique({ where: { tokenHash: hashToken(decodeURIComponent(token)) }, include: { user: true } }) : null;
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) { client.disconnect(true); return; }
    client.data.userId = session.userId;
    client.data.sessionId = session.id;
    await client.join(`user:${session.userId}`);
  }

  @SubscribeMessage('subscribe')
  async subscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { room?: string }) {
    await client.data.ready;
    const room = body?.room;
    const userId = client.data.userId as string | undefined;
    const needed = room ? ROOM_PERMISSION[room] : undefined;
    // Gleiche Antwort für unbekannte und nicht erlaubte Räume → keine Information über Existenz.
    if (!userId || !needed || !(await this.perms.has(userId, needed))) return { ok: false, code: 'PERMISSION_DENIED' };
    // Session erneut prüfen (wurde sie inzwischen widerrufen?)
    const s = await this.prisma.session.findUnique({ where: { id: client.data.sessionId as string } });
    if (!s || s.revokedAt || s.expiresAt < new Date()) { setImmediate(() => client.disconnect(true)); return { ok: false, code: 'UNAUTHENTICATED' }; }
    await client.join(room!);
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  async unsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { room?: string }) {
    if (body?.room && body.room in ROOM_PERMISSION) await client.leave(body.room);
    return { ok: true };
  }
}
