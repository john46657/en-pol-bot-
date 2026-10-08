"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SERVER_SCOPED_CHILDREN = exports.SERVER_SCOPED_MODELS = void 0;
exports.withServerScope = withServerScope;
const client_1 = require("@prisma/client");
const guild_context_1 = require("../common/guild-context");
/**
 * Daten, die je Discord-Server getrennt sind (Spalte `serverId` = Akten-Bereich wie bei Personen/Fahrzeugen).
 * Die Leitstelle (CAD) bleibt bewusst gemeinsam und steht deshalb nicht hier.
 */
exports.SERVER_SCOPED_MODELS = new Set([
    'Report', 'Complaint', 'Investigation', 'WantedRecord', 'Evidence', 'DutySession',
    // Personal: Personalakten, Ränge, Ausbildungen, Prüfungen, Ausbildungstermine, Meldungen, Abstimmungen, Dienstnummern
    'Personnel', 'HrRank', 'HrTraining', 'HrExam', 'HrTrainingSession', 'HrAnnouncement', 'HrPoll',
    'ServiceNumberRange', 'ServiceNumber', 'ServiceNumberEvent', 'HireQueue',
]);
/** Einträge ohne eigene Spalte, die zum Bereich ihrer Personalakte gehören (Modell → Relation zur Akte). */
exports.SERVER_SCOPED_CHILDREN = { PersonnelRecord: 'personnel', HrRequest: 'personnel', HrTrainingProgress: 'personnel', HrExamAttempt: 'personnel' };
const FILTERED = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);
const delegate = (base, model) => base[model[0].toLowerCase() + model.slice(1)];
const otherServer = () => new client_1.Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: client_1.Prisma.prismaVersion.client });
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
                    const parent = model ? exports.SERVER_SCOPED_CHILDREN[model] : undefined;
                    if (!model || (!parent && !exports.SERVER_SCOPED_MODELS.has(model)))
                        return query(args);
                    const space = (0, guild_context_1.recordSpace)();
                    if (space === undefined)
                        return query(args); // kein Server gewählt
                    const a = (args ?? {});
                    const scope = parent ? { [parent]: { serverId: space } } : { serverId: space };
                    /** Bereich eines einzelnen Eintrags (bei Kind-Einträgen der Bereich der Personalakte); `undefined` = gibt es nicht. */
                    const spaceOfRow = async () => {
                        const row = await delegate(base, model).findUnique({ where: a.where, select: parent ? { [parent]: { select: { serverId: true } } } : { serverId: true } });
                        if (!row)
                            return undefined;
                        return (parent ? row[parent].serverId : row.serverId);
                    };
                    if (FILTERED.has(operation)) {
                        a.where = a.where ? { AND: [a.where, scope] } : scope;
                        return query(a);
                    }
                    if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
                        if (parent) {
                            const s = await spaceOfRow();
                            if (s !== undefined && s !== space) {
                                if (operation === 'findUniqueOrThrow')
                                    throw otherServer();
                                return null;
                            }
                            return query(args);
                        }
                        const sel = a.select;
                        const added = !!sel && !sel.serverId;
                        if (added)
                            a.select = { ...sel, serverId: true };
                        const row = (await query(a));
                        if (row && row.serverId !== space) {
                            if (operation === 'findUniqueOrThrow')
                                throw otherServer();
                            return null;
                        }
                        if (row && added)
                            delete row.serverId;
                        return row;
                    }
                    if (parent) {
                        // Kind-Einträge: angelegt wird über die (bereits geprüfte) Personalakte; Einzel-Änderungen nur im eigenen Bereich
                        if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
                            const s = await spaceOfRow();
                            if (s !== undefined && s !== space)
                                throw otherServer();
                        }
                        return query(args);
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
                        const s = await spaceOfRow();
                        if (s !== undefined && s !== space)
                            throw otherServer();
                        if (operation === 'upsert' && s === undefined) {
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
//# sourceMappingURL=server-scope.js.map