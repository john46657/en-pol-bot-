"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeService = exports.ROOM_PERMISSION = void 0;
const common_1 = require("@nestjs/common");
/** Rooms und die Permission, die zum Abonnieren nötig ist. `user:<id>` ist nur für den Benutzer selbst. */
exports.ROOM_PERMISSION = {
    dispatch: 'dispatch.view',
    incidents: 'incidents.view',
    team: 'team.view',
    wanted: 'wanted.view',
    cad: 'cad.view',
    tickets: 'ticket.view',
};
let RealtimeService = class RealtimeService {
    server;
    /** Veröffentlicht minimale Payloads (IDs/Status). Details holen Clients über die autorisierte REST-API. */
    publish(room, event, payload) {
        this.server?.to(room).emit(event, payload);
    }
    /** An alle angemeldeten Verbindungen (z. B. „Rechte geändert“ → Oberfläche lädt das eigene Profil neu). Ohne Inhalt. */
    broadcast(event) {
        this.server?.emit(event, {});
    }
    publishToUser(userId, event, payload) {
        this.publish(`user:${userId}`, event, payload);
    }
};
exports.RealtimeService = RealtimeService;
exports.RealtimeService = RealtimeService = __decorate([
    (0, common_1.Injectable)()
], RealtimeService);
//# sourceMappingURL=realtime.service.js.map