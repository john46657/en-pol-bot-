"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RELATION_SCOPED_MODELS = exports.GUILD_SCOPED_MODELS = exports.SERVER_SCOPED_MODELS = void 0;
exports.withServerScope = withServerScope;
const client_1 = require("@prisma/client");
const guild_context_1 = require("../common/guild-context");
/**
 * Daten, die je Discord-Server getrennt sind (Spalte `serverId` = Bereich des Servers bzw. einer ausdrücklich eingerichteten
 * Gruppe im Server-Verbund). Server sind von Grund auf getrennt: auch Leitstelle (CAD), Personalakte/HR, Dienstnummern,
 * Bußgelder, Tatbestände, SEK, Funk-Freigaben, Academy, Workflows und Kommunikation.
 * Ausnahmen gibt es nur ausdrücklich: CAD-Querverbindung (CadServerLink) und Datenfreigaben (Serververbindungen).
 */
exports.SERVER_SCOPED_MODELS = new Set([
    'Person', 'Vehicle', 'Weapon', 'Report', 'Complaint', 'Investigation', 'WantedRecord', 'Evidence', 'DutySession', 'Ticket', 'LegalCode',
    'Incident', 'Unit', 'CadMapObject', 'CadMember',
    'Personnel', 'HrRank', 'HrRequest', 'HrTraining', 'HrExam', 'HrAnnouncement', 'HrPoll', 'ServiceNumberRange', 'ServiceNumber', 'HireQueue', 'AcademyCourse',
    'SekMember', 'SekReport', 'RadioWhitelist', 'Workflow', 'Conversation',
]);
/** CAD/ER:LC-Daten, die über die Discord-Server-ID (`guildId`) einem Server gehören. */
exports.GUILD_SCOPED_MODELS = new Set(['ErlcServer', 'CadRadioMessage', 'CadHandover', 'CadIncidentStat']);
/** Daten, die über eine Beziehung (ER:LC-Server) einem Discord-Server gehören. */
exports.RELATION_SCOPED_MODELS = { ErlcEmergencyCall: 'server', ErlcCommandLog: 'server' };
const FILTERED = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);
const delegate = (base, model) => base[model[0].toLowerCase() + model.slice(1)];
/**
 * Prisma-Erweiterung: Für die Modelle oben sieht und ändert jede Anfrage nur Daten des gewählten Discord-Servers
 * (Header `x-guild-id` bzw. Discord-Server der Bot-Interaktion). Ohne Server (Hintergrund-Aufgaben, „Alle Server“) gibt es keinen Filter.
 * Neue Einträge bekommen automatisch den Bereich des Servers.
 */
function withServerScope(base) {
    return base.$extends({
        name: 'server-scope',
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (model === 'SystemSetting')
                        return scopeSetting(operation, args, query);
                    if (model && (exports.GUILD_SCOPED_MODELS.has(model) || model in exports.RELATION_SCOPED_MODELS))
                        return scopeByGuild(base, model, operation, args, query);
                    if (!model || !exports.SERVER_SCOPED_MODELS.has(model))
                        return query(args);
                    const space = (0, guild_context_1.recordSpace)();
                    if (space === undefined)
                        return query(args); // kein Server gewählt
                    const a = (args ?? {});
                    if (FILTERED.has(operation)) {
                        a.where = a.where ? { AND: [a.where, { serverId: space }] } : { serverId: space };
                        return query(a);
                    }
                    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                        const sel = a.select;
                        const added = !!sel && !sel.serverId;
                        if (added)
                            a.select = { ...sel, serverId: true };
                        const row = (await query(a));
                        if (row && row.serverId !== space) {
                            if (operation === 'findUniqueOrThrow')
                                throw new client_1.Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: client_1.Prisma.prismaVersion.client });
                            return null;
                        }
                        if (row && added)
                            delete row.serverId;
                        return row;
                    }
                    if (operation === 'create') {
                        const data = (a.data ?? {});
                        if (data.serverId === undefined)
                            a.data = { ...data, serverId: space };
                        return query(a);
                    }
                    if (operation === 'createMany' || operation === 'createManyAndReturn') {
                        const list = Array.isArray(a.data) ? a.data : [a.data];
                        a.data = list.map((d) => (d.serverId === undefined ? { ...d, serverId: space } : d));
                        return query(a);
                    }
                    if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
                        // Einzel-Änderung per ID: nur, wenn der Eintrag zu diesem Server gehört
                        const row = await delegate(base, model).findUnique({ where: a.where, select: { serverId: true } });
                        if (row && row.serverId !== space)
                            throw new client_1.Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: client_1.Prisma.prismaVersion.client });
                        if (operation === 'upsert' && !row) {
                            const c = (a.create ?? {});
                            if (c.serverId === undefined)
                                a.create = { ...c, serverId: space };
                        }
                        return query(a);
                    }
                    return query(args);
                },
            },
        },
    });
}
/** `key` → `key@<Server>` für Konfiguration je Server (nur im Kontext eines Servers, nie doppelt). */
function serverKey(key, g) {
    return typeof key === 'string' && !key.includes('@') && guild_context_1.PER_SERVER_SETTING_KEYS.includes(key) ? `${key}@${g}` : key;
}
async function scopeSetting(operation, args, query) {
    const g = (0, guild_context_1.settingsGuild)((0, guild_context_1.currentGuild)());
    if (!g || !args)
        return query(args);
    const a = { ...args };
    const where = a.where;
    const mapped = new Map();
    if (where && 'key' in where) {
        const k = where.key;
        if (typeof k === 'string')
            a.where = { ...where, key: serverKey(k, g) };
        else if (k && typeof k === 'object' && Array.isArray(k.in)) {
            const list = (k.in).map((x) => { const v = serverKey(x, g); if (v !== x)
                mapped.set(v, x); return v; });
            a.where = { ...where, key: { ...k, in: list } };
        }
    }
    for (const f of ['data', 'create']) {
        const d = a[f];
        if (d && typeof d === 'object' && !Array.isArray(d) && 'key' in d)
            a[f] = { ...d, key: serverKey(d.key, g) };
    }
    const r = await query(a);
    // Liste: Schlüssel wie angefragt zurückgeben (ohne @Server), damit Aufrufer nichts merken
    if (operation === 'findMany' && Array.isArray(r) && mapped.size)
        return r.map((row) => (mapped.has(row.key) ? { ...row, key: mapped.get(row.key) } : row));
    return r;
}
/**
 * Wie oben, aber über die Discord-Server-ID: direkt (`guildId`) bzw. über den ER:LC-Server (`server.guildId`).
 * Ohne Server (Hintergrund-Abgleich mit ER:LC, „Alle Server“) kein Filter.
 */
async function scopeByGuild(base, model, operation, args, query) {
    const g = (0, guild_context_1.currentGuild)();
    if (!g)
        return query(args);
    const rel = exports.RELATION_SCOPED_MODELS[model];
    const filter = rel ? { [rel]: { guildId: g } } : { guildId: g };
    const a = { ...(args ?? {}) };
    if (FILTERED.has(operation)) {
        a.where = a.where ? { AND: [a.where, filter] } : filter;
        return query(a);
    }
    if (operation === 'create' && !rel) {
        const data = (a.data ?? {});
        if (data.guildId === undefined)
            a.data = { ...data, guildId: g };
        return query(a);
    }
    if (operation === 'findUnique' || operation === 'findUniqueOrThrow' || operation === 'update' || operation === 'delete' || operation === 'upsert') {
        // Einzelzugriff per ID: nur, wenn der Eintrag zu diesem Server gehört
        const d = base[model[0].toLowerCase() + model.slice(1)];
        const own = a.where ? await d.findFirst({ where: { AND: [a.where, filter] }, select: { id: true } }) : null;
        const exists = a.where ? await d.findFirst({ where: a.where, select: { id: true } }) : null;
        if (exists && !own) {
            if (operation === 'findUnique')
                return null;
            throw new client_1.Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: client_1.Prisma.prismaVersion.client });
        }
    }
    return query(a);
}
//# sourceMappingURL=server-scope.js.map