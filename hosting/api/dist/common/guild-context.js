"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unscoped = exports.onePersonnel = exports.recordWhere = exports.recordSpace = exports.settingsGuild = exports.scopedKey = exports.PER_SERVER_SETTING_KEYS = exports.SERVER_SCOPED_SETTINGS = exports.GuildContextMiddleware = exports.runInGuild = exports.currentGuild = void 0;
exports.setServerLinkResolvers = setServerLinkResolvers;
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
exports.SERVER_SCOPED_SETTINGS = ['team.structure', 'team.rankOrder', 'dashboard.defaultLayout', 'theme.accent', 'theme.customAccents', 'org.name', 'teamchance'];
/**
 * Konfiguration, die von Grund auf JE SERVER gilt: im Kontext eines Servers liest und schreibt jede Abfrage automatisch
 * `<Schlüssel>@<Server>` (server-scope.ts) – ohne Rückgriff auf die Werte anderer Server. Unter „Alle Server“ bzw. in
 * Hintergrund-Aufgaben ohne Server gilt der Grundwert. Anmeldung, Backups, Server-Verbund und Bot-Zustand bleiben global.
 */
exports.PER_SERVER_SETTING_KEYS = [
    ...exports.SERVER_SCOPED_SETTINGS, 'org.serverName', 'studio.customFields', 'application.form', 'qualifications.config', 'discord.channels', 'discord.ghostPing',
    'cad.config', 'mdt.config', 'fleet.config', 'welcome.config', 'voice-support.rooms', 'verify.config', 'verify.panel', 'tickets.settings', 'shifts.config',
    'logging.config', 'leave.config', 'hr.config', 'embeds.messages', 'danger.current', 'danger.config', 'dienstnummer.settings', 'academy.config', 'radio.discord',
    'messagebuilder.channels', 'wanted.erlcMatch',
];
const scopedKey = (key, guildId) => { const g = (0, exports.settingsGuild)(guildId); return g && exports.SERVER_SCOPED_SETTINGS.includes(key) ? `${key}@${g}` : key; };
exports.scopedKey = scopedKey;
// ---- Server-Verbund (Administration → Server-Verbund; gesetzt vom ServerLinksService) ----
let settingsOf = (g) => g;
let spaceOf = () => null;
function setServerLinkResolvers(settings, space) { settingsOf = settings; spaceOf = space; }
/** Server, dessen Einstellungen gelten: in einer Gruppe mit „Einstellungen teilen“ der Haupt-Server der Gruppe, sonst der Server selbst. */
const settingsGuild = (guildId) => (guildId ? settingsOf(guildId) : null);
exports.settingsGuild = settingsGuild;
/**
 * Akten-Bereich (Personen/Fahrzeuge, Spalte `serverId`): `null` = gemeinsamer Bestand (Standard), sonst eigener Bereich
 * des Servers bzw. der Gruppe. `undefined` = kein Server gewählt („Alle Server“) → kein Filter.
 */
const recordSpace = (guildId = (0, exports.currentGuild)()) => (guildId ? spaceOf(guildId) : undefined);
exports.recordSpace = recordSpace;
/** Prisma-Filter für Akten des gewählten Servers (ohne Server: alle). */
const recordWhere = (guildId = (0, exports.currentGuild)()) => { const s = (0, exports.recordSpace)(guildId); return s === undefined ? {} : { serverId: s }; };
exports.recordWhere = recordWhere;
/**
 * Personalakte des aktuellen Servers in verschachtelten Abfragen (Benutzer → Akte; es gibt je Server eine eigene Akte):
 * `personnel: { ...onePersonnel(), select: {…} }` und danach `user.personnel[0]`. Ohne Server: irgendeine Akte.
 */
const onePersonnel = (space = (0, exports.recordSpace)()) => ({ where: space === undefined ? {} : { serverId: space }, take: 1 });
exports.onePersonnel = onePersonnel;
/** Ausnahmsweise ohne Server-Filter (z. B. global eindeutige, fortlaufende Nummern). Nur für Zähler – nie für Inhalte. */
const unscoped = (fn) => (0, exports.runInGuild)(null, async () => await fn()); // Prisma-Abfragen laufen erst beim await → im Kontext abwarten
exports.unscoped = unscoped;
//# sourceMappingURL=guild-context.js.map