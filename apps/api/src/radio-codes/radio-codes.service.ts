import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { currentGuild } from '../common/guild-context';
import type { EmbedSpec, MessageSpec } from '@enrp/shared';
import { DiscordService } from '../discord/discord.service';

/** Wie die Funk-Codes als Discord-Nachricht aussehen (je Server bzw. gemeinsam). */
export interface RadioDiscordConfig {
  channelId: string | null; title: string; description: string; color: string; groupByCategory: boolean; showDescription: boolean; autoUpdate: boolean;
  /** `fields`: je Kategorie ein Abschnitt; `list`: eine Liste „Code = Bedeutung“ im Text (wie eine handgeschriebene Funk-Übersicht). */
  layout: 'fields' | 'list';
  /** Text unter der Liste (Markdown), z. B. Regeln zur Funkdisziplin. */
  rules: string;
}
export const DEFAULT_RADIO_DISCORD: RadioDiscordConfig = { channelId: null, title: '📡 Funk-Codes', description: '', color: '#3b82f6', groupByCategory: true, showDescription: false, autoUpdate: true, layout: 'fields', rules: '' };

export interface RadioCodeInput { code?: string; meaning?: string; category?: string | null; description?: string | null; guildId?: string | null }

/** Gängige Funkcodes als Startpunkt („10-Codes einfügen“) – alles änderbar. */
export const DEFAULT_RADIO_CODES: { code: string; meaning: string; category: string }[] = [
  { code: '10-1', meaning: 'Schlechter Empfang', category: 'Funk' }, { code: '10-2', meaning: 'Guter Empfang', category: 'Funk' },
  { code: '10-3', meaning: 'Funkstille', category: 'Funk' }, { code: '10-4', meaning: 'Verstanden', category: 'Funk' },
  { code: '10-6', meaning: 'Beschäftigt', category: 'Status' }, { code: '10-7', meaning: 'Außer Dienst', category: 'Status' },
  { code: '10-8', meaning: 'Im Dienst / einsatzbereit', category: 'Status' }, { code: '10-9', meaning: 'Bitte wiederholen', category: 'Funk' },
  { code: '10-20', meaning: 'Standort', category: 'Einsatz' }, { code: '10-23', meaning: 'Am Einsatzort eingetroffen', category: 'Einsatz' },
  { code: '10-32', meaning: 'Verstärkung benötigt', category: 'Einsatz' }, { code: '10-38', meaning: 'Verkehrskontrolle', category: 'Einsatz' },
  { code: '10-50', meaning: 'Verkehrsunfall', category: 'Einsatz' }, { code: '10-80', meaning: 'Verfolgungsfahrt', category: 'Einsatz' },
  { code: '10-99', meaning: 'Beamter in Not', category: 'Notfall' }, { code: 'Code 3', meaning: 'Einsatzfahrt mit Sonderrechten', category: 'Einsatz' },
];

/** Polizei-Status 0–11 („Status-Codes einfügen“). */
export const DEFAULT_STATUS_CODES: { code: string; meaning: string; category: string }[] = [
  ['Status 0', 'Notfall / Notruf'], ['Status 1', 'Einsatzbereit über Funk'], ['Status 2', 'Einsatzbereit auf Wache'],
  ['Status 3', 'Einsatzauftrag übernommen / Anfahrt zum Einsatzort'], ['Status 4', 'Am Einsatzort angekommen'], ['Status 5', 'Sprechwunsch'],
  ['Status 6', 'Nicht einsatzbereit'], ['Status 7', 'Infowunsch, Datenabfrage'], ['Status 8', 'Bewaffneter Raub'], ['Status 9', 'Verstärkungs-Anforderung'],
  ['Status 10', 'Fuchsbau (Schusswechsel / Angriff auf das Präsidium)'], ['Status 11', 'Maulwurf (Aktive Geiselnahme vor einem)'],
].map(([code, meaning]) => ({ code: code!, meaning: meaning!, category: 'Polizei-Status' }));
export const RADIO_CODE_SETS = { ten: DEFAULT_RADIO_CODES, status: DEFAULT_STATUS_CODES } as const;
export type RadioCodeSet = keyof typeof RADIO_CODE_SETS;

/**
 * Funk-Codes je Server (Server getrennt) oder für alle Server. Im Server-Kontext sieht man die Codes dieses Servers
 * und die gemeinsamen; ein Server-Code überdeckt einen gemeinsamen mit gleichem Code.
 */
@Injectable()
export class RadioCodesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  private cfgKey(g = currentGuild()) { return `radio.discord${g ? `@${g}` : ''}`; }
  private stateKey(g = currentGuild()) { return `radio-${g ?? 'all'}`; }
  async discordConfig() {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: this.cfgKey() } }))?.value as Partial<RadioDiscordConfig> | undefined;
    return { ...DEFAULT_RADIO_DISCORD, ...(v ?? {}), posted: await this.discord.posted(this.stateKey()) };
  }
  async saveDiscordConfig(actor: Actor, c: RadioDiscordConfig) {
    const key = this.cfgKey();
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: c as unknown as Prisma.InputJsonValue }, update: { value: c as unknown as Prisma.InputJsonValue } });
    await this.audit.record(actor, { action: 'radiocode.discord.config', module: 'radio', entityType: 'SystemSetting', entityId: key, after: c });
    return this.discordConfig();
  }

  /** Discord-Nachricht: je Kategorie ein Abschnitt (Discord: max. 25 Abschnitte à 1024 Zeichen, 6000 je Embed → bei Bedarf mehrere Embeds). */
  message(codes: { code: string; meaning: string; category: string | null; description: string | null }[], c: RadioDiscordConfig): MessageSpec {
    const color = parseInt(c.color.slice(1), 16);
    if (c.layout === 'list') return this.listMessage(codes, c, color);
    const line = (r: (typeof codes)[number]) => `\`${r.code}\` – ${r.meaning}${c.showDescription && r.description ? `\n> ${r.description}` : ''}`;
    const groups = new Map<string, string[]>();
    for (const r of codes) { const k = c.groupByCategory ? r.category || 'Allgemein' : 'Codes'; groups.set(k, [...(groups.get(k) ?? []), line(r)]); }
    const fields: { name: string; value: string }[] = [];
    for (const [name, lines] of groups) {
      let chunk = '';
      for (const l of lines) {
        if ((chunk + '\n' + l).length > 1024) { fields.push({ name: fields.at(-1)?.name.startsWith(name) ? `${name} (Forts.)` : name, value: chunk }); chunk = ''; }
        chunk = chunk ? `${chunk}\n${l}` : l.slice(0, 1024);
      }
      if (chunk) fields.push({ name: fields.at(-1)?.name.startsWith(name) ? `${name} (Forts.)` : name, value: chunk });
    }
    const embeds: EmbedSpec[] = [];
    let cur: EmbedSpec = { title: c.title || undefined, description: c.description || (codes.length ? undefined : 'Noch keine Funk-Codes.'), color, fields: [] };
    let size = (c.title + c.description).length;
    for (const f of fields) {
      if (cur.fields!.length >= 25 || size + f.name.length + f.value.length > 5800) { embeds.push(cur); cur = { color, fields: [] }; size = 0; }
      cur.fields!.push(f); size += f.name.length + f.value.length;
    }
    embeds.push(cur);
    if (c.rules.trim()) embeds.push({ color, description: c.rules.trim().slice(0, 4000) });
    embeds.at(-1)!.timestamp = new Date().toISOString();
    embeds.at(-1)!.footer = 'Zuletzt aktualisiert';
    return { embeds: embeds.slice(0, 10) };
  }

  /** Liste „Code = Bedeutung“ im Embed-Text, Trennlinien, Regeln darunter. Zu lang für ein Embed (4096 Zeichen) → Folge-Embeds. */
  private listMessage(codes: { code: string; meaning: string; category: string | null; description: string | null }[], c: RadioDiscordConfig, color: number): MessageSpec {
    const rule = '━━━━━━━━━━━━━━━━━━━━';
    const lines = codes.map((r) => `${r.code} = ${r.meaning}${c.showDescription && r.description ? `\n> ${r.description}` : ''}`);
    const blocks = [c.description.trim(), lines.length ? lines.join('\n') : 'Noch keine Funk-Codes.', c.rules.trim()].filter(Boolean);
    const embeds: EmbedSpec[] = [];
    let text = '';
    const flush = () => { if (text) embeds.push({ color, description: text }); text = ''; };
    for (const part of blocks.flatMap((b, i) => (i ? [rule, b] : [b])).flatMap((b) => b.split('\n'))) {
      if (text.length + part.length + 1 > 4000) flush();
      text = text ? `${text}\n${part}` : part.slice(0, 4000);
    }
    flush();
    embeds[0]!.title = c.title || undefined;
    embeds.at(-1)!.timestamp = new Date().toISOString();
    embeds.at(-1)!.footer = 'Zuletzt aktualisiert';
    return { embeds: embeds.slice(0, 10) };
  }

  async sendToDiscord(actor: Actor | null, mode: 'update' | 'new') {
    const c = await this.discordConfig();
    if (!c.channelId) throw new AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal.');
    await this.discord.postMessage(this.stateKey(), c.channelId, this.message(await this.list(), c), { forceNew: mode === 'new' });
    if (actor) await this.audit.record(actor, { action: 'radiocode.discord.send', module: 'radio', after: { channelId: c.channelId, mode } });
    return { queued: true };
  }
  /** Nach Änderungen: schon gepostete Liste automatisch nachziehen (falls eingestellt). */
  private async autoUpdate() {
    const c = await this.discordConfig().catch(() => null);
    if (c?.autoUpdate && c.channelId && c.posted?.channelId === c.channelId) await this.sendToDiscord(null, 'update').catch(() => undefined);
  }

  async list(q?: string, guildId: string | null = currentGuild()) {
    const t = q?.trim();
    const rows = await this.prisma.radioCode.findMany({
      where: { AND: [{ OR: [{ guildId: null }, ...(guildId ? [{ guildId }] : [])] }, t ? { OR: [{ code: { contains: t, mode: 'insensitive' } }, { meaning: { contains: t, mode: 'insensitive' } }, { category: { contains: t, mode: 'insensitive' } }] } : {}] },
      orderBy: [{ position: 'asc' }, { code: 'asc' }], take: 500,
    });
    const own = new Set(rows.filter((r) => r.guildId).map((r) => r.code.toLowerCase()));
    return rows.filter((r) => r.guildId || !own.has(r.code.toLowerCase()));
  }

  private async load(id: string) {
    const r = await this.prisma.radioCode.findUnique({ where: { id } });
    const g = currentGuild();
    if (!r || (g && r.guildId && r.guildId !== g)) throw new AppError('NOT_FOUND', 'Funk-Code nicht gefunden.');
    return r;
  }

  private uniq(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
    throw e;
  }

  /** (gemeinsame Codes haben guildId = null – dafür greift der Datenbank-Index nicht, daher selbst prüfen) */
  private async assertFree(guildId: string | null, code: string, exceptId?: string) {
    const dup = await this.prisma.radioCode.findFirst({ where: { guildId, code: { equals: code, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (dup) throw new AppError('CONFLICT', 'Diesen Funk-Code gibt es hier schon.');
  }

  async create(actor: Actor, d: Required<Pick<RadioCodeInput, 'code' | 'meaning'>> & RadioCodeInput) {
    const guildId = d.guildId === undefined ? currentGuild() : d.guildId;
    await this.assertFree(guildId, d.code);
    const position = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
    const r = await this.prisma.radioCode.create({ data: { code: d.code, meaning: d.meaning, category: d.category ?? null, description: d.description ?? null, guildId, position } }).catch((e) => this.uniq(e));
    await this.audit.record(actor, { action: 'radiocode.create', module: 'radio', entityType: 'RadioCode', entityId: r.id, after: r });
    void this.autoUpdate();
    return r;
  }

  async update(actor: Actor, id: string, d: RadioCodeInput) {
    const before = await this.load(id);
    const data = { code: d.code, meaning: d.meaning, category: d.category, description: d.description }; // Server-Zugehörigkeit bleibt
    if (data.code) await this.assertFree(before.guildId, data.code, id);
    const r = await this.prisma.radioCode.update({ where: { id }, data }).catch((e) => this.uniq(e));
    await this.audit.record(actor, { action: 'radiocode.update', module: 'radio', entityType: 'RadioCode', entityId: id, before, after: r });
    void this.autoUpdate();
    return r;
  }

  async remove(actor: Actor, id: string) {
    const before = await this.load(id);
    await this.prisma.radioCode.delete({ where: { id } });
    await this.audit.record(actor, { action: 'radiocode.delete', module: 'radio', entityType: 'RadioCode', entityId: id, before });
    void this.autoUpdate();
  }

  async reorder(actor: Actor, ids: string[]) {
    for (const id of ids) await this.load(id);
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.radioCode.update({ where: { id }, data: { position: i + 1 } })));
    await this.audit.record(actor, { action: 'radiocode.reorder', module: 'radio', after: { count: ids.length } });
    void this.autoUpdate();
    return this.list();
  }

  /** Standard-Codes (`ten`: 10-Codes, `status`: Polizei-Status 0–11) für den gewählten Server (bzw. alle Server) einfügen – vorhandene Codes bleiben unverändert. */
  async insertDefaults(actor: Actor, set: RadioCodeSet = 'ten') {
    const guildId = currentGuild();
    const existing = new Set((await this.prisma.radioCode.findMany({ where: { guildId }, select: { code: true } })).map((r) => r.code.toLowerCase()));
    const add = RADIO_CODE_SETS[set].filter((c) => !existing.has(c.code.toLowerCase()));
    const base = ((await this.prisma.radioCode.aggregate({ where: { guildId }, _max: { position: true } }))._max.position ?? 0) + 1;
    if (add.length) await this.prisma.radioCode.createMany({ data: add.map((c, i) => ({ ...c, guildId, position: base + i })) });
    await this.audit.record(actor, { action: 'radiocode.defaults', module: 'radio', after: { added: add.length, guildId, set } });
    void this.autoUpdate();
    return { added: add.length };
  }
}
