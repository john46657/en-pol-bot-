import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaClient } from '@prisma/client';

/**
 * Tabellen mit früherem Datenbereich je Discord-Server (`serverId`) und ihren Eindeutigkeiten. Seit der Umstellung auf einen
 * Server gehört der Bestand zu `serverId` = NULL; was dabei eine Eindeutigkeit verletzt hätte (z. B. eine zweite Personalakte
 * desselben Benutzers aus einem anderen früheren Server), bleibt mit seinem alten Bereich als Archiv in der Datenbank.
 */
export const DATA_TABLES: [string, string[]][] = [
  ['Person', ['robloxUserId']], ['Vehicle', ['plate']], ['Weapon', ['serial']], ['Report', []], ['Complaint', []], ['Investigation', []], ['WantedRecord', []],
  ['Evidence', []], ['DutySession', []], ['Ticket', []], ['LegalCode', ['code']], ['Incident', []], ['Unit', ['callsign']], ['CadMapObject', []],
  ['CadMember', ['userId', 'discordId']], ['Personnel', ['userId', 'callsign', 'serviceNumber']], ['HrRank', ['name']], ['HrRequest', []], ['HrTraining', []],
  ['HrExam', []], ['HrAnnouncement', []], ['HrPoll', []], ['ServiceNumberRange', []], ['ServiceNumber', ['display']], ['HireQueue', []], ['AcademyCourse', []],
  ['SekMember', ['userId']], ['SekReport', []], ['RadioWhitelist', ['userId']], ['Workflow', []], ['Conversation', []],
];
const ARCHIVED_MODELS = new Set(DATA_TABLES.map(([t]) => t));
const LISTS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy']);

const all = new AsyncLocalStorage<true>();
/** Erst nach erledigter Umstellung: solange sie aussteht, gehören Einträge mit `serverId` noch zum Bestand. */
let active = false;
export const setArchiveFilter = (on: boolean) => { active = on; };
/** Archiv-Einträge mitlesen (Backups müssen den vollständigen Bestand sichern). */
// innerhalb abwarten: Prisma-Abfragen starten erst beim `await` (sonst liefe die Abfrage außerhalb des Kontexts)
export const withArchived = <T>(fn: () => PromiseLike<T>): Promise<T> => all.run(true, async () => await fn());

/**
 * Prisma-Erweiterung: Listen und Zählungen zeigen nur den aktuellen Bestand (`serverId` = NULL), nicht die bei der Umstellung
 * separat belassenen Doppel (sonst stünde z. B. jede Person mit zwei früheren Personalakten doppelt in der Teamliste).
 * Direkter Zugriff per ID und Änderungen bleiben unverändert; gelöscht wird nichts.
 */
export function withoutArchived(base: PrismaClient) {
  return base.$extends({
    name: 'without-archived',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!active || !model || !ARCHIVED_MODELS.has(model) || !LISTS.has(operation) || all.getStore()) return query(args);
          const a = (args ?? {}) as { where?: object };
          return query({ ...a, where: a.where ? { AND: [a.where, { serverId: null }] } : { serverId: null } } as typeof args);
        },
      },
    },
  });
}
