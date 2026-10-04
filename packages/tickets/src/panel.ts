import { createHash } from 'node:crypto';
import { assertGuildId, prisma } from '@nexus/database';
import type { MessagePayload } from '@nexus/discord';
import { getSettings } from './settings.js';
import type { TicketDiscord } from './service.js';

/** Auslastung: offene Tickets / Kapazität. 0–49 % niedrig · 50–79 % mittel · 80–99 % hoch · 100 % voll. */
export type LoadLevel = 'low' | 'medium' | 'high' | 'full';
export const loadLevel = (percent: number): LoadLevel => (percent >= 100 ? 'full' : percent >= 80 ? 'high' : percent >= 50 ? 'medium' : 'low');
export const LOAD_ICON: Record<LoadLevel, string> = { low: '🟢', medium: '🟡', high: '🟠', full: '🔴' };
export const LOAD_LABEL: Record<LoadLevel, string> = { low: 'Verfügbar', medium: 'Mittel ausgelastet', high: 'Stark ausgelastet', full: 'Voll' };

export interface CategoryLoad {
  id: string;
  name: string;
  emoji: string | null;
  open: number;
  max: number;
  percent: number;
  level: LoadLevel;
}

export function percentOf(open: number, max: number): number {
  return max <= 0 ? 100 : Math.min(100, Math.round((open / max) * 100));
}

/** Auslastung aller aktiven Kategorien (eine Abfrage). */
export async function loads(guildId: string): Promise<CategoryLoad[]> {
  const gid = assertGuildId(guildId);
  const [cats, groups] = await Promise.all([
    prisma.ticketCategory.findMany({ where: { guildId: gid, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] }),
    prisma.ticket.groupBy({ by: ['categoryId'], where: { guildId: gid, status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING'] } }, _count: { _all: true } }),
  ]);
  const open = new Map(groups.map((g) => [g.categoryId, g._count._all]));
  return cats.map((c) => {
    const n = open.get(c.id) ?? 0;
    const percent = percentOf(n, c.maxOpenTotal);
    return { id: c.id, name: c.name, emoji: c.emoji, open: n, max: c.maxOpenTotal, percent, level: loadLevel(percent) };
  });
}

/** Zeile der Auslastungsanzeige, z. B. „🟢 General: Verfügbar 1/20 (5%)“. */
export const loadLine = (l: CategoryLoad): string => `${LOAD_ICON[l.level]} ${l.name}: ${LOAD_LABEL[l.level]} ${l.open}/${l.max} (${l.percent}%)`;

const EMOJI = /^(<a?:\w{2,32}:(\d{5,25})>|(?:\p{Extended_Pictographic}|‍|️)+)$/u;
/** Select-Menü-Emoji aus Text (Unicode oder `<:name:id>`); sonst weglassen statt Discord-Fehler zu riskieren. */
export function selectEmoji(raw: string | null): { name: string; id?: string } | undefined {
  const e = raw?.trim();
  if (!e || !EMOJI.test(e)) return undefined;
  const m = /^<(a?):(\w+):(\d+)>$/.exec(e);
  return m ? { name: m[2]!, id: m[3]! } : { name: e };
}

/** Baut das Panel: Titel + Kategorien (mit Beschreibung), Auslastung und Select-Menü – alles aus der Konfiguration. */
export async function buildPanel(guildId: string): Promise<MessagePayload> {
  const gid = assertGuildId(guildId);
  const [s, cats, ld] = await Promise.all([getSettings(gid), prisma.ticketCategory.findMany({ where: { guildId: gid, active: true }, orderBy: [{ createdAt: 'asc' }, { name: 'asc' }] }), loads(gid)]);
  const loadOf = new Map(ld.map((l) => [l.id, l]));
  const visible = cats.filter((c) => !(s.hideFullCategories && loadOf.get(c.id)?.level === 'full')).slice(0, 25);
  const main = {
    title: s.panelTitle,
    description: [s.panelDescription, '', ...visible.map((c) => `**${c.emoji ? `${c.emoji} ` : ''}${c.name}**${c.description ? `\n${c.description}` : ''}`)].join('\n').slice(0, 4000),
    color: s.color,
  };
  const embeds: NonNullable<MessagePayload['embeds']> = [main as never];
  if (s.loadEnabled && ld.length > 0) embeds.push({ title: s.loadTitle, description: `${s.loadText}\n\n${ld.map(loadLine).join('\n')}`.slice(0, 4000), color: s.color } as never);
  const components =
    visible.length === 0
      ? []
      : [
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: 'nexus:ticket:pick',
                placeholder: s.selectPlaceholder.slice(0, 150),
                options: visible.map((c) => {
                  const l = loadOf.get(c.id);
                  const full = l?.level === 'full';
                  const desc = `${full ? '🔴 Voll – ' : ''}${c.description ?? ''}`.slice(0, 100);
                  const emoji = selectEmoji(c.emoji);
                  return { label: c.name.slice(0, 100), value: c.id, ...(desc ? { description: desc } : {}), ...(emoji ? { emoji } : {}) };
                }),
              },
            ],
          },
        ];
  return { embeds, components } as MessagePayload;
}

const lastHash = new Map<string, string>();

/** Veröffentlicht das Panel im konfigurierten Kanal (neue Nachricht) und merkt sich die Nachricht. */
export async function postPanel(guildId: string, channelId: string, discord: TicketDiscord) {
  const gid = assertGuildId(guildId);
  const payload = await buildPanel(gid);
  const messageId = await discord.post(channelId, payload);
  await getSettings(gid);
  await prisma.ticketSettings.update({ where: { guildId: gid }, data: { panelChannelId: channelId, panelMessageId: messageId } });
  lastHash.set(gid, hash(payload));
  return messageId;
}

const hash = (p: unknown) => createHash('sha1').update(JSON.stringify(p)).digest('hex');

/**
 * Aktualisiert das Panel (Auslastung), aber nur wenn sich der Inhalt geändert hat – keine unnötigen Discord-Aufrufe.
 * Ist die Nachricht gelöscht, wird still aufgegeben (Panel mit `/ticket panel` erneut senden).
 */
export async function refreshPanel(guildId: string, discord: TicketDiscord): Promise<'updated' | 'unchanged' | 'none'> {
  const gid = assertGuildId(guildId);
  const s = await getSettings(gid);
  if (!s.panelChannelId || !s.panelMessageId) return 'none';
  const payload = await buildPanel(gid);
  const h = hash(payload);
  if (lastHash.get(gid) === h) return 'unchanged';
  try {
    await discord.edit(s.panelChannelId, s.panelMessageId, payload);
    lastHash.set(gid, h);
    return 'updated';
  } catch {
    return 'none';
  }
}
export const _resetPanelCache = (): void => lastHash.clear();
