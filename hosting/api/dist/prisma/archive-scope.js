"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withArchived = exports.setArchiveFilter = exports.DATA_TABLES = void 0;
exports.withoutArchived = withoutArchived;
const node_async_hooks_1 = require("node:async_hooks");
/**
 * Tabellen mit früherem Datenbereich je Discord-Server (`serverId`) und ihren Eindeutigkeiten. Seit der Umstellung auf einen
 * Server gehört der Bestand zu `serverId` = NULL; was dabei eine Eindeutigkeit verletzt hätte (z. B. eine zweite Personalakte
 * desselben Benutzers aus einem anderen früheren Server), bleibt mit seinem alten Bereich als Archiv in der Datenbank.
 */
exports.DATA_TABLES = [
    ['Person', ['robloxUserId']], ['Vehicle', ['plate']], ['Weapon', ['serial']], ['Report', []], ['Complaint', []], ['Investigation', []], ['WantedRecord', []],
    ['Evidence', []], ['DutySession', []], ['Ticket', []], ['LegalCode', ['code']], ['Incident', []], ['Unit', ['callsign']], ['CadMapObject', []],
    ['CadMember', ['userId', 'discordId']], ['Personnel', ['userId', 'callsign', 'serviceNumber']], ['HrRank', ['name']], ['HrRequest', []], ['HrTraining', []],
    ['HrExam', []], ['HrAnnouncement', []], ['HrPoll', []], ['ServiceNumberRange', []], ['ServiceNumber', ['display']], ['HireQueue', []], ['AcademyCourse', []],
    ['SekMember', ['userId']], ['SekReport', []], ['RadioWhitelist', ['userId']], ['Workflow', []], ['Conversation', []],
];
const ARCHIVED_MODELS = new Set(exports.DATA_TABLES.map(([t]) => t));
const LISTS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);
const all = new node_async_hooks_1.AsyncLocalStorage();
/** Erst nach erledigter Umstellung: solange sie aussteht, gehören Einträge mit `serverId` noch zum Bestand. */
let active = false;
const setArchiveFilter = (on) => { active = on; };
exports.setArchiveFilter = setArchiveFilter;
/** Archiv-Einträge mitlesen (Backups müssen den vollständigen Bestand sichern). */
// innerhalb abwarten: Prisma-Abfragen starten erst beim `await` (sonst liefe die Abfrage außerhalb des Kontexts)
const withArchived = (fn) => all.run(true, async () => await fn());
exports.withArchived = withArchived;
/**
 * Prisma-Erweiterung: Listen und Zählungen zeigen nur den aktuellen Bestand (`serverId` = NULL), nicht die bei der Umstellung
 * separat belassenen Doppel (sonst stünde z. B. jede Person mit zwei früheren Personalakten doppelt in der Teamliste).
 * Direkter Zugriff per ID und Änderungen bleiben unverändert; gelöscht wird nichts.
 */
function withoutArchived(base) {
    return base.$extends({
        name: 'without-archived',
        query: {
            $allModels: {
                async $allOperations({ model, operation, args, query }) {
                    if (!active || !model || !ARCHIVED_MODELS.has(model) || !LISTS.has(operation) || all.getStore())
                        return query(args);
                    const a = (args ?? {});
                    return query({ ...a, where: a.where ? { AND: [a.where, { serverId: null }] } : { serverId: null } });
                },
            },
        },
    });
}
//# sourceMappingURL=archive-scope.js.map