"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scopedKey = exports.SERVER_SCOPED_SETTINGS = exports.GuildContextMiddleware = exports.runInGuild = exports.currentGuild = void 0;
const node_async_hooks_1 = require("node:async_hooks");
const common_1 = require("@nestjs/common");
/**
 * Gewählter Discord-Server der Anfrage (Header `X-Guild-Id`, gesetzt von der Server-Auswahl im Dashboard bzw. vom Bot).
 * Server laufen getrennt: serverbezogene Rollen gelten nur dort, Teamliste/Voice/Einstellungen zeigen nur diesen Server.
 * Ohne Header = „Alle Server“ (nur serverübergreifende Rollen).
 */
const store = new node_async_hooks_1.AsyncLocalStorage();
const currentGuild = () => store.getStore()?.guildId ?? null;
exports.currentGuild = currentGuild;
const runInGuild = (guildId, fn) => store.run({ guildId }, fn);
exports.runInGuild = runInGuild;
let GuildContextMiddleware = class GuildContextMiddleware {
    use(req, _res, next) {
        const h = req.headers['x-guild-id'];
        const guildId = typeof h === 'string' && /^\d{15,25}$/.test(h) ? h : null;
        store.run({ guildId }, next);
    }
};
exports.GuildContextMiddleware = GuildContextMiddleware;
exports.GuildContextMiddleware = GuildContextMiddleware = __decorate([
    (0, common_1.Injectable)()
], GuildContextMiddleware);
/** Zentrale Einstellungen, die je Server überschrieben werden können (`<key>@<guildId>`, sonst gilt der gemeinsame Wert). */
exports.SERVER_SCOPED_SETTINGS = ['team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'org.name', 'teamchance'];
const scopedKey = (key, guildId) => (guildId && exports.SERVER_SCOPED_SETTINGS.includes(key) ? `${key}@${guildId}` : key);
exports.scopedKey = scopedKey;
//# sourceMappingURL=guild-context.js.map