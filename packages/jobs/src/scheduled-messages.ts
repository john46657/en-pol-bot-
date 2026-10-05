import { guildRepository, prisma } from '@nexus/database';
import type { MessagePayload } from '@nexus/discord';
import { nextRun } from './schedule.js';
import { enqueue } from './notifications.js';

/** Inhalt einer automatischen Nachricht (wie im Dashboard gespeichert). */
export interface ScheduledPayload {
  content?: string | undefined;
  embed?: { title?: string; description?: string; color?: string; imageUrl?: string; thumbnailUrl?: string; footer?: string } | undefined;
  buttons?: { label: string; url: string }[] | undefined;
  mentionRoleIds?: string[] | undefined;
}

const HTTPS = /^https:\/\/\S+$/;
const fmt = (now: Date, o: Intl.DateTimeFormatOptions) => now.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', ...o });

/** Discord-Nachricht aus dem gespeicherten Inhalt; Platzhalter `{datum}`, `{uhrzeit}`, `{wochentag}` (deutsche Zeit). */
export function scheduledPayload(p: ScheduledPayload, now = new Date()): MessagePayload {
  const vars: Record<string, string> = { datum: fmt(now, { dateStyle: 'medium' }), uhrzeit: fmt(now, { hour: '2-digit', minute: '2-digit' }), wochentag: fmt(now, { weekday: 'long' }) };
  const r = (s?: string) => (s ?? '').replace(/\{(datum|uhrzeit|wochentag)\}/g, (_m, k: string) => vars[k] ?? '');
  const roles = (p.mentionRoleIds ?? []).filter((x) => /^\d{5,25}$/.test(x)).slice(0, 10);
  const content = [roles.map((x) => `<@&${x}>`).join(' '), r(p.content)].filter(Boolean).join('\n').slice(0, 2000);
  const e = p.embed;
  const embed = e && (e.title || e.description)
    ? {
        ...(e.title ? { title: r(e.title).slice(0, 256) } : {}),
        ...(e.description ? { description: r(e.description).slice(0, 4000) } : {}),
        color: e.color && /^#[0-9a-fA-F]{6}$/.test(e.color) ? parseInt(e.color.slice(1), 16) : 0x5865f2,
        ...(e.imageUrl && HTTPS.test(e.imageUrl) ? { image: { url: e.imageUrl } } : {}),
        ...(e.thumbnailUrl && HTTPS.test(e.thumbnailUrl) ? { thumbnail: { url: e.thumbnailUrl } } : {}),
        ...(e.footer ? { footer: { text: r(e.footer).slice(0, 2048) } } : {}),
      }
    : null;
  const buttons = (p.buttons ?? []).filter((b) => b.label?.trim() && HTTPS.test(b.url)).slice(0, 5);
  return {
    ...(content ? { content } : {}),
    ...(embed ? { embeds: [embed] } : {}),
    ...(buttons.length ? { components: [{ type: 1, components: buttons.map((b) => ({ type: 2, style: 5, label: b.label.slice(0, 80), url: b.url })) }] } : {}),
    allowed_mentions: { parse: [], roles },
  } as MessagePayload;
}

/**
 * Fällige automatische Nachrichten senden (über die Warteschlange: Wiederholung, nie doppelt) und den nächsten Termin
 * berechnen. Einmalige Nachrichten werden danach deaktiviert. Server mit abgeschaltetem Modul werden übersprungen.
 */
export async function sendScheduledMessages(now = new Date()): Promise<{ queued: number; skipped: number }> {
  const due = await prisma.scheduledMessage.findMany({ where: { enabled: true, nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' }, take: 100 });
  let queued = 0;
  let skipped = 0;
  const off = new Map<string, boolean>();
  for (const m of due) {
    if (!off.has(m.guildId)) {
      const state = (await guildRepository.getModuleState(m.guildId).catch(() => null)) as { disabled?: string[] } | null;
      off.set(m.guildId, !!state?.disabled?.includes('messages'));
    }
    const next = nextRun(m, now);
    // Termin zuerst weiterschieben (atomar über den alten Termin) – so sendet auch ein paralleler Lauf nie doppelt
    const moved = await prisma.scheduledMessage.updateMany({ where: { id: m.id, nextRunAt: m.nextRunAt }, data: { nextRunAt: next, lastRunAt: now, ...(next ? {} : { enabled: false }) } });
    if (moved.count === 0) continue;
    if (off.get(m.guildId)) {
      skipped++;
      continue;
    }
    if (await enqueue({ guildId: m.guildId, target: { kind: 'CHANNEL', id: m.channelId }, kind: 'scheduled.message', dedupeKey: `scheduled:${m.id}:${m.nextRunAt!.toISOString()}`, payload: scheduledPayload(m.payload as ScheduledPayload, now) })) queued++;
  }
  return { queued, skipped };
}
