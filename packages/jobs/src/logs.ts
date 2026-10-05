import { areaLabel, areaOf } from '@nexus/audit';
import { logForwardRepository, prisma } from '@nexus/database';
import { enqueue } from './notifications.js';

const BATCH = 100;
const color = (result: string | null) => (result === 'failed' || result === 'denied' ? 0xdc2626 : result === 'partial' ? 0xf59e0b : 0x2563eb);

/**
 * Leitet neue Audit-Einträge in die konfigurierten Discord-Kanäle weiter (je Bereich ein Kanal, `*` = alle Bereiche).
 * Läuft über die Benachrichtigungs-Warteschlange: Wiederholung bei Discord-Fehlern, nie doppelt (`dedupeKey`).
 * Gesendet werden nur Eckdaten (Aktion, wer, Datensatz, Ergebnis, Grund) – keine Vorher/Nachher-Inhalte.
 */
export async function forwardAuditLogs(now = new Date()): Promise<{ guilds: number; queued: number }> {
  let queued = 0;
  const active = await logForwardRepository.active();
  for (const g of active) {
    const cursor = g.cursor ?? { lastAt: now, lastId: '' };
    const rows = await prisma.auditLog.findMany({
      where: { guildId: g.guildId, OR: [{ createdAt: { gt: cursor.lastAt } }, { createdAt: cursor.lastAt, id: { gt: cursor.lastId } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: BATCH,
    });
    for (const a of rows) {
      const area = areaOf(a.action);
      const targets = new Set(g.forwards.filter((f) => f.area === area || f.area === '*').map((f) => f.channelId));
      for (const channelId of targets) {
        const fields = [
          { name: 'Von', value: a.actorId ? `<@${a.actorId}>` : a.actorType === 'SYSTEM' ? 'System' : (a.automation ?? 'Automation'), inline: true },
          ...(a.resourceType ? [{ name: 'Datensatz', value: `${a.resourceType}${a.resourceId ? ` · \`${a.resourceId.slice(0, 40)}\`` : ''}`, inline: true }] : []),
          ...(a.result ? [{ name: 'Ergebnis', value: a.result, inline: true }] : []),
          ...(a.reason ? [{ name: 'Grund', value: a.reason.slice(0, 300), inline: false }] : []),
        ];
        const ok = await enqueue({
          guildId: g.guildId,
          target: { kind: 'CHANNEL', id: channelId },
          kind: 'log.forward',
          dedupeKey: `logfwd:${a.id}:${channelId}`,
          payload: { embeds: [{ title: `${areaLabel(area)} · ${a.action}`, color: color(a.result), fields, timestamp: a.createdAt.toISOString() }], allowed_mentions: { parse: [] } } as never,
        });
        if (ok) queued++;
      }
    }
    const last = rows.at(-1);
    if (last) await logForwardRepository.setCursor(g.guildId, last.createdAt, last.id);
    else if (!g.cursor) await logForwardRepository.setCursor(g.guildId, cursor.lastAt, cursor.lastId);
  }
  return { guilds: active.length, queued };
}
