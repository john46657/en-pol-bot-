import { Prisma, type PrismaClient } from '@prisma/client';
import { recordSpace } from '../common/guild-context';

/**
 * Daten, die je Discord-Server getrennt sind (Spalte `serverId` = Akten-Bereich wie bei Personen/Fahrzeugen).
 * Die Leitstelle (CAD) bleibt bewusst gemeinsam und steht deshalb nicht hier.
 */
export const SERVER_SCOPED_MODELS = new Set(['Report', 'Complaint', 'Investigation', 'WantedRecord', 'Evidence', 'DutySession']);

const FILTERED = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);
const delegate = (base: PrismaClient, model: string) => (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ serverId: string | null } | null> }>)[model[0]!.toLowerCase() + model.slice(1)]!;

/**
 * Prisma-Erweiterung: Für die Modelle oben sieht und ändert jede Anfrage nur Daten des gewählten Discord-Servers
 * (Header `x-guild-id` bzw. Discord-Server der Bot-Interaktion). Ohne Server (Hintergrund-Aufgaben, „Alle Server“) gibt es keinen Filter.
 * Neue Einträge bekommen automatisch den Bereich des Servers.
 */
export function withServerScope(base: PrismaClient) {
  return base.$extends({
    name: 'server-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SERVER_SCOPED_MODELS.has(model)) return query(args);
          const space = recordSpace();
          if (space === undefined) return query(args); // kein Server gewählt
          const a = (args ?? {}) as Record<string, unknown>;
          if (FILTERED.has(operation)) {
            a.where = a.where ? { AND: [a.where, { serverId: space }] } : { serverId: space };
            return query(a as typeof args);
          }
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const sel = a.select as Record<string, unknown> | undefined;
            const added = !!sel && !sel.serverId;
            if (added) a.select = { ...sel, serverId: true };
            const row = (await query(a as typeof args)) as Record<string, unknown> | null;
            if (row && row.serverId !== space) {
              if (operation === 'findUniqueOrThrow') throw new Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: Prisma.prismaVersion.client });
              return null;
            }
            if (row && added) delete row.serverId;
            return row;
          }
          if (operation === 'create') {
            const data = (a.data ?? {}) as Record<string, unknown>;
            if (data.serverId === undefined) a.data = { ...data, serverId: space };
            return query(a as typeof args);
          }
          if (operation === 'createMany' || operation === 'createManyAndReturn') {
            const list = Array.isArray(a.data) ? a.data : [a.data];
            a.data = list.map((d: Record<string, unknown>) => (d.serverId === undefined ? { ...d, serverId: space } : d));
            return query(a as typeof args);
          }
          if (operation === 'update' || operation === 'delete' || operation === 'upsert') {
            // Einzel-Änderung per ID: nur, wenn der Eintrag zu diesem Server gehört
            const row = await delegate(base, model).findUnique({ where: a.where, select: { serverId: true } });
            if (row && row.serverId !== space) throw new Prisma.PrismaClientKnownRequestError('Datensatz gehört zu einem anderen Server.', { code: 'P2025', clientVersion: Prisma.prismaVersion.client });
            if (operation === 'upsert' && !row) { const c = (a.create ?? {}) as Record<string, unknown>; if (c.serverId === undefined) a.create = { ...c, serverId: space }; }
            return query(a as typeof args);
          }
          return query(args);
        },
      },
    },
  });
}
