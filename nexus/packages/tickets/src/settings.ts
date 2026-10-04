import { TicketError } from './errors.js';
import { assertGuildId, auditRepository, prisma, type Prisma } from '@nexus/database';

/** Server-Einstellungen des Ticket-Systems. Beim ersten Zugriff werden die Standardwerte angelegt. */
export type TicketSettingsRow = Awaited<ReturnType<typeof getSettings>>;

/** Ungültige Einstellung → wie jeder andere Ticket-Fehler als „invalid“ (HTTP 400) behandelt. */
export class SettingsError extends TicketError {
  constructor(message: string) {
    super('invalid', message);
  }
}

export async function getSettings(guildId: string) {
  const gid = assertGuildId(guildId);
  return (await prisma.ticketSettings.findUnique({ where: { guildId: gid } })) ?? prisma.ticketSettings.create({ data: { guildId: gid } }).catch(() => prisma.ticketSettings.findUniqueOrThrow({ where: { guildId: gid } }));
}

const ID = /^\d{5,25}$/;
const TEXT_LIMITS: Record<string, number> = { nameTemplate: 80, panelTitle: 100, panelDescription: 1500, selectPlaceholder: 100, loadTitle: 100, loadText: 1000, openTitle: 100, openText: 1500 };
const CHANNELS = ['panelChannelId', 'transcriptChannelId'] as const;
const CUIDS = ['applicationCategoryId'] as const;
const BOOLS = ['transcriptEnabled', 'dmTranscript', 'claimEnabled', 'claimExclusive', 'closeWithReason', 'confirmClose', 'loadEnabled', 'hideFullCategories'] as const;

export type SettingsPatch = Partial<{
  panelChannelId: string | null;
  transcriptChannelId: string | null;
  applicationCategoryId: string | null;
  adminRoleIds: string[];
  nameTemplate: string;
  deleteAfterMinutes: number;
  color: number;
  panelTitle: string;
  panelDescription: string;
  selectPlaceholder: string;
  loadTitle: string;
  loadText: string;
  openTitle: string;
  openText: string;
  transcriptEnabled: boolean;
  dmTranscript: boolean;
  claimEnabled: boolean;
  claimExclusive: boolean;
  closeWithReason: boolean;
  confirmClose: boolean;
  loadEnabled: boolean;
  hideFullCategories: boolean;
}>;

/** Prüft und speichert nur die übergebenen Felder; unbekannte Felder werden abgelehnt. */
export async function saveSettings(guildId: string, patch: Record<string, unknown>, actorId: string) {
  const gid = assertGuildId(guildId);
  const data: Prisma.TicketSettingsUpdateInput = {};
  const known = new Set<string>([...Object.keys(TEXT_LIMITS), ...CHANNELS, ...CUIDS, ...BOOLS, 'adminRoleIds', 'deleteAfterMinutes', 'color']);
  for (const k of Object.keys(patch)) if (!known.has(k)) throw new SettingsError(`Unbekannte Einstellung: ${k}.`);
  for (const k of CHANNELS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v !== null && (typeof v !== 'string' || !ID.test(v))) throw new SettingsError('Ungültiger Kanal.');
    data[k] = v as string | null;
  }
  for (const k of CUIDS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v !== null && (typeof v !== 'string' || !/^[a-z0-9]{10,40}$/i.test(v))) throw new SettingsError('Ungültige Kategorie.');
    data[k] = v as string | null;
  }
  for (const k of BOOLS) {
    if (!(k in patch)) continue;
    if (typeof patch[k] !== 'boolean') throw new SettingsError(`„${k}“ muss an oder aus sein.`);
    data[k] = patch[k] as boolean;
  }
  for (const [k, max] of Object.entries(TEXT_LIMITS)) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v !== 'string' || v.trim().length === 0 || v.length > max) throw new SettingsError(`Der Text „${k}“ fehlt oder ist zu lang (max. ${max} Zeichen).`);
    (data as Record<string, unknown>)[k] = v;
  }
  if ('nameTemplate' in patch && !/\{(number|user|category)\}/.test(String(patch['nameTemplate']))) throw new SettingsError('Die Kanalnamen-Vorlage braucht mindestens {number}, {user} oder {category}, sonst sind die Namen nicht eindeutig.');
  if ('adminRoleIds' in patch) {
    const r = patch['adminRoleIds'];
    if (!Array.isArray(r) || r.length > 20 || r.some((x) => typeof x !== 'string' || !ID.test(x))) throw new SettingsError('Ungültige Rollenauswahl.');
    data.adminRoleIds = [...new Set(r as string[])];
  }
  if ('deleteAfterMinutes' in patch) {
    const m = patch['deleteAfterMinutes'];
    if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 10_080) throw new SettingsError('Die Löschfrist muss zwischen 0 Minuten und 7 Tagen liegen.');
    data.deleteAfterMinutes = m;
  }
  if ('color' in patch) {
    const c = patch['color'];
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > 0xffffff) throw new SettingsError('Ungültige Farbe.');
    data.color = c;
  }
  const before = await getSettings(gid);
  const row = await prisma.ticketSettings.update({ where: { guildId: gid }, data });
  await auditRepository.createRaw({ data: { guildId: gid, actorType: 'USER', actorId, action: 'ticket.settings.updated', resourceType: 'TicketSettings', resourceId: gid, before: Object.fromEntries(Object.keys(patch).map((k) => [k, (before as Record<string, unknown>)[k]])) as Prisma.InputJsonValue, after: patch as Prisma.InputJsonValue, result: 'success' } });
  return row;
}
