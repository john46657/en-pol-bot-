import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { LiveHub, allowedAreas, startPublisher, subscribe, type LiveClient } from '@nexus/realtime';
import { permissions } from '@nexus/permissions';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { DiscordRolesService } from '../auth/discord-roles.service.js';
import { authorizeLive, type LiveDeps } from './live.authorize.js';

export const LIVE_PATH = '/api/v1/live';
const PING_MS = 30_000;
const REFRESH_MS = 5 * 60_000;

/**
 * Live-Dashboard per WebSocket (`/api/v1/live?guildId=…`). Ereignisse kommen über Redis Pub/Sub von allen Prozessen
 * (API, Bot, Worker); verteilt wird nur an Clients mit passendem Recht. Es werden **keine Inhalte** übertragen,
 * nur „Bereich + Aktion + Datensatz-ID“ – das Dashboard lädt die betroffenen Daten gezielt per REST nach.
 */
@Injectable()
export class LiveService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Live');
  readonly hub = new LiveHub();
  private wss: WebSocketServer | null = null;
  private stops: (() => Promise<void>)[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    private readonly config: ConfigService,
    private readonly roles: DiscordRolesService,
  ) {}

  private deps(): LiveDeps {
    return {
      secret: this.config.get<string>('AUTH_SECRET') ?? '',
      issuer: this.config.get<string>('JWT_ISSUER') ?? '',
      allowedOrigins: (this.config.get<string>('DASHBOARD_URL') ?? 'http://localhost:3001').split(',').map((s) => s.trim()),
      getMember: (g, u) => this.roles.getMember(g, u),
      getAccess: (g, u, r) => this.roles.getMemberAccess(g, u, r),
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    const redisUrl = this.config.get<string>('REDIS_URL') ?? process.env['REDIS_URL'];
    if (!redisUrl) return void this.log.warn('REDIS_URL fehlt – Live-Aktualisierung ist deaktiviert (das Dashboard lädt dann nur beim Öffnen/Aktualisieren).');
    this.stops.push(startPublisher(redisUrl)); // Aktionen der API selbst
    this.stops.push(await subscribe(redisUrl, (e) => this.hub.dispatch(e)));
    this.attach(this.host.httpAdapter.getHttpServer());
    this.log.log(`Live-System bereit (${LIVE_PATH}).`);
  }

  /** Hängt den WebSocket-Upgrade an einen HTTP-Server (auch für Tests nutzbar). */
  attach(server: { on(event: 'upgrade', cb: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown }, deps: LiveDeps = this.deps()): void {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
    server.on('upgrade', (req, socket, head) => {
      if (new URL(req.url ?? '', 'http://x').pathname !== LIVE_PATH) return; // andere Upgrades nicht anfassen
      void authorizeLive(req, deps).then((auth) => {
        if (!auth.ok) return void this.reject(socket, auth.status, auth.message);
        this.wss!.handleUpgrade(req, socket, head, (ws) => this.connect(ws, auth, deps));
      });
    });
  }

  private reject(socket: Duplex, status: number, message: string): void {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  }

  private connect(ws: WebSocket, auth: { userId: string; guildId: string; areas: Set<string> }, deps: LiveDeps): void {
    const client: LiveClient = {
      guildId: auth.guildId,
      userId: auth.userId,
      areas: auth.areas,
      send: (e) => ws.send(JSON.stringify({ type: 'event', ...e })),
      close: (code, reason) => ws.close(code, reason),
    };
    if (!this.hub.add(client)) return void ws.close(4008, 'Zu viele Verbindungen.');
    ws.send(JSON.stringify({ type: 'hello', areas: [...auth.areas] }));
    let alive = true;
    ws.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return void ws.terminate();
      alive = false;
      ws.ping();
    }, PING_MS);
    // Rechte regelmäßig neu bewerten: wer Rechte oder die Mitgliedschaft verliert, wird getrennt bzw. eingeschränkt
    const refresh = setInterval(() => {
      void (async () => {
        const m = await deps.getMember(auth.guildId, auth.userId).catch(() => null);
        if (!m?.isMember) return ws.close(4003, 'Kein Mitglied mehr.');
        const access = await deps.getAccess(auth.guildId, auth.userId, m.roleIds).catch(() => ({ canManageGuild: false }));
        const ctx = { guildId: auth.guildId, userId: auth.userId, roleIds: m.roleIds, bypass: access.canManageGuild };
        const next = await allowedAreas((keys) => permissions.canAny(ctx, keys));
        if (next.size === 0) return ws.close(4003, 'Keine Berechtigung mehr.');
        client.areas = next;
      })();
    }, REFRESH_MS);
    this.timers.push(ping, refresh);
    ws.on('close', () => {
      clearInterval(ping);
      clearInterval(refresh);
      this.hub.remove(client);
    });
    ws.on('error', () => ws.terminate());
    ws.on('message', () => undefined); // Clients senden nichts Relevantes
  }

  async onApplicationShutdown(): Promise<void> {
    for (const t of this.timers) clearInterval(t);
    for (const s of this.stops) await s().catch(() => undefined);
    this.wss?.close();
  }
}
