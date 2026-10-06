import type { Server } from 'socket.io';
/** Rooms und die Permission, die zum Abonnieren nötig ist. `user:<id>` ist nur für den Benutzer selbst. */
export declare const ROOM_PERMISSION: Record<string, string>;
export declare class RealtimeService {
    server?: Server;
    /** Veröffentlicht minimale Payloads (IDs/Status). Details holen Clients über die autorisierte REST-API. */
    publish(room: string, event: string, payload: Record<string, unknown>): void;
    /** An alle angemeldeten Verbindungen (z. B. „Rechte geändert“ → Oberfläche lädt das eigene Profil neu). Ohne Inhalt. */
    broadcast(event: string): void;
    publishToUser(userId: string, event: string, payload: Record<string, unknown>): void;
}
