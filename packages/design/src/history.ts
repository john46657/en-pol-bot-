import { assertGuildId, prisma } from '@nexus/database';

export interface HistoryEntry {
  id: string;
  at: Date;
  actorId: string | null;
  icon: string;
  text: string;
}
const ICON: Record<string, string> = {
  'design.theme.created': '🎨',
  'design.theme.updated': '🎨',
  'design.theme.activated': '✅',
  'design.theme.deleted': '🗑️',
  'design.overrides.updated': '🎨',
  'design.reset': '↩️',
  'design.asset.uploaded': '🖼️',
  'design.asset.deleted': '🗑️',
};
const FALLBACK: Record<string, string> = {
  'design.theme.created': 'Theme erstellt',
  'design.theme.updated': 'Theme geändert',
  'design.theme.activated': 'Theme aktiviert',
  'design.theme.deleted': 'Theme gelöscht',
  'design.overrides.updated': 'Serverweite Einstellungen geändert',
  'design.reset': 'Gesamtes Design zurückgesetzt',
  'design.asset.uploaded': 'Bild hochgeladen',
  'design.asset.deleted': 'Bild gelöscht',
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** Änderungsprotokoll des Designs (aus dem Audit-Log): wer, wann, was. Nur dieser Server, die letzten 50 Einträge. */
export async function getDesignHistory(guildId: string): Promise<HistoryEntry[]> {
  const gid = assertGuildId(guildId);
  const rows = await prisma.auditLog.findMany({
    where: { guildId: gid, action: { startsWith: 'design.' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, actorId: true, createdAt: true, after: true, before: true },
  });
  return rows.map((r) => {
    const after =
      typeof r.after === 'object' && r.after !== null && !Array.isArray(r.after)
        ? (r.after as Record<string, unknown>)
        : {};
    const before =
      typeof r.before === 'object' && r.before !== null && !Array.isArray(r.before)
        ? (r.before as Record<string, unknown>)
        : {};
    const detail = str(after['summary']) ?? str(after['name']) ?? str(before['name']);
    const base = FALLBACK[r.action] ?? 'Design geändert';
    // Bei erstellt/aktiviert/gelöscht/zurückgesetzt ist die Zusammenfassung schon ein ganzer Satz („Theme „X“ aktiviert“)
    const sentence = [
      'design.theme.created',
      'design.theme.activated',
      'design.theme.deleted',
      'design.reset',
    ].includes(r.action);
    const text = detail ? (sentence ? detail : `${base}: ${detail}`) : base;
    return {
      id: r.id,
      at: r.createdAt,
      actorId: r.actorId,
      icon: ICON[r.action] ?? '🎨',
      text: text.slice(0, 300),
    };
  });
}
