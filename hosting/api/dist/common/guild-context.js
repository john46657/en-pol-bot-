"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unscoped = exports.onePersonnel = exports.recordWhere = exports.recordSpace = exports.settingsGuild = exports.registeredSpaces = exports.scopedKey = exports.LATER_PER_SERVER_KEYS = exports.PER_SERVER_SETTING_KEYS = exports.SERVER_SCOPED_SETTINGS = exports.GuildContextMiddleware = exports.inDashboardRequest = exports.inRequest = exports.runInGuild = exports.currentRequestId = exports.targetGuild = exports.currentGuild = void 0;
exports.setServerLinkResolvers = setServerLinkResolvers;
const node_async_hooks_1 = require("node:async_hooks");
const common_1 = require("@nestjs/common");
const errors_1 = require("./errors");
/**
 * Gewählter Discord-Server der Anfrage (Header `X-Guild-Id`, gesetzt von der Server-Auswahl im Dashboard bzw. vom Bot).
 * Server laufen getrennt: serverbezogene Rollen gelten nur dort, Teamliste/Voice/Einstellungen zeigen nur diesen Server.
 * Ohne Header = „Alle Server“ (nur serverübergreifende Rollen).
 */
const store = new node_async_hooks_1.AsyncLocalStorage();
const currentGuild = () => store.getStore()?.guildId ?? null;
exports.currentGuild = currentGuild;
/**
 * Server, den eine Anfrage per `?guildId=` (oder im Body) ansprechen darf. Server sind getrennt: im Kontext eines
 * gewählten Servers nur dieser – ein anderer wird abgelehnt (sonst könnte ein Server-Admin per Parameter Daten und
 * Einstellungen fremder Server lesen/ändern). Ohne Kontext („Alle Server“, Bot-Dienstweg) gilt der angegebene.
 */
const targetGuild = (requested) => {
    const g = (0, exports.currentGuild)();
    if (g && requested && requested !== g)
        throw new errors_1.AppError('PERMISSION_DENIED', 'Server sind getrennt – wechsle oben zum Server, um seine Daten zu bearbeiten.', { reason: 'FOREIGN_SERVER' });
    return g ?? requested ?? null;
};
exports.targetGuild = targetGuild;
/** Request-ID der laufenden Anfrage (Korrelations-ID für Audit/Fehlersuche), außerhalb von Anfragen undefiniert. */
const currentRequestId = () => store.getStore()?.requestId;
exports.currentRequestId = currentRequestId;
const runInGuild = (guildId, fn) => store.run({ guildId }, fn);
exports.runInGuild = runInGuild;
/** Läuft gerade eine Anfrage aus Dashboard/Bot (nicht: Hintergrund-Aufgabe, `runInGuild`/`unscoped`)? */
const inRequest = () => store.getStore()?.request === true;
exports.inRequest = inRequest;
/** Anfrage aus dem Dashboard (Sitzung), nicht vom Bot und keine Hintergrund-Aufgabe? */
const inDashboardRequest = () => { const s = store.getStore(); return s?.request === true && !s.bot; };
exports.inDashboardRequest = inDashboardRequest;
let GuildContextMiddleware = class GuildContextMiddleware {
    use(req, _res, next) {
        const h = req.headers['x-guild-id'];
        const guildId = typeof h === 'string' && /^\d{15,25}$/.test(h) ? h : null;
        const bot = typeof req.headers.authorization === 'string' && req.headers.authorization.startsWith('Bot ');
        store.run({ guildId, request: true, bot, requestId: req.requestId }, next);
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
    'messagebuilder.channels', 'auth.discord', 'org.timezone', 'org.dateFormat',
];
/** Erst später je Server getrennt: bestehende Server bekommen einmalig den bisherigen gemeinsamen Wert als eigene Kopie. */
exports.LATER_PER_SERVER_KEYS = ['auth.discord', 'org.timezone', 'org.dateFormat'];
const scopedKey = (key, guildId) => { const g = (0, exports.settingsGuild)(guildId); return g && exports.SERVER_SCOPED_SETTINGS.includes(key) ? `${key}@${g}` : key; };
exports.scopedKey = scopedKey;
// ---- Server-Verbund (Administration → Server-Verbund; gesetzt vom ServerLinksService) ----
let settingsOf = (g) => g;
let spaceOf = () => null;
let knownSpaces = async () => null;
function setServerLinkResolvers(settings, space, known) { settingsOf = settings; spaceOf = space; if (known)
    knownSpaces = known; }
/**
 * Akten-Bereiche, die zu einem registrierten Discord-Server (bzw. einer Server-Gruppe) gehören. Alles andere sind Reste früherer
 * Umstellungen (z. B. „separat belassene“ Doppel aus der Rück-Umstellung, Bereiche aufgelöster Gruppen) – sie bleiben gespeichert
 * (Backups, Zugriff per ID), erscheinen aber unter „Alle Server“ nicht mehr in Listen. Einmal je Anfrage geladen; außerhalb von Anfragen `null`.
 */
const registeredSpaces = () => {
    const st = store.getStore();
    if (!st?.request)
        return Promise.resolve(null);
    st.spaces ??= knownSpaces().catch(() => null);
    return st.spaces;
};
exports.registeredSpaces = registeredSpaces;
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