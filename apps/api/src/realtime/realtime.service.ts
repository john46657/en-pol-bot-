import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/** Rooms und die Permission, die zum Abonnieren nötig ist. `user:<id>` ist nur für den Benutzer selbst. */
export const ROOM_PERMISSION: Record<string, string> = {
  dispatch: 'dispatch.view',
  incidents: 'incidents.view',
  team: 'team.view',
  wanted: 'wanted.view',
};

@Injectable()
export class RealtimeService {
  server?: Server;
  /** Veröffentlicht minimale Payloads (IDs/Status). Details holen Clients über die autorisierte REST-API. */
  publish(room: string, event: string, payload: Record<string, unknown>) {
    this.server?.to(room).emit(event, payload);
  }
  publishToUser(userId: string, event: string, payload: Record<string, unknown>) {
    this.publish(`user:${userId}`, event, payload);
  }
}
