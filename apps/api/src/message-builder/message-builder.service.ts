import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { mbDocumentDataSchema, type MbChannelBotPerms, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { homeGuild } from '../common/guild-context';

export const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
export const docKind = z.enum(['DRAFT', 'TEMPLATE']);
export const createDocSchema = z.object({
  kind: docKind,
  name: z.string().trim().min(1, 'Name fehlt.').max(100),
  categoryId: z.string().uuid().nullable().default(null),
  data: mbDocumentDataSchema.optional(),
});
export const updateDocSchema = z.object({
  name: z.string().trim().min(1, 'Name fehlt.').max(100),
  categoryId: z.string().uuid().nullable().default(null),
  channelId: sf.nullable().default(null),
  data: mbDocumentDataSchema,
  /** Stand, auf dem die Änderung beruht (optimistisches Sperren) */
  version: z.number().int().min(1),
});
export const copyDocSchema = z.object({ kind: docKind, name: z.string().trim().min(1).max(100).optional(), categoryId: z.string().uuid().nullable().optional() });
export const categorySchema = z.object({ name: z.string().trim().min(1, 'Name fehlt.').max(60), position: z.number().int().min(0).max(1000).optional() });
export const channelsConfigSchema = z.object({ channelIds: z.array(sf).max(200) });

const CHANNELS_KEY = 'messagebuilder.channels';
export type Kind = z.infer<typeof docKind>;

export interface MbChannel { id: string; name: string; category: string | null; position: number; bot: MbChannelBotPerms | null; allowed: boolean }

/** Discord Message Builder: Entwürfe, Vorlagen, Kategorien und erlaubte Kanäle. Versand: MessageBuilderSendService. */
@Injectable()
export class MessageBuilderService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly perms: PermissionService, private readonly discord: DiscordService) {}

  // ───────────── Rechte je Art ─────────────

  /** Entwürfe gehören der Person, die sie angelegt hat; Vorlagen sind gemeinsam und brauchen eigene Rechte. */
  private async assertDoc(actor: Actor, doc: { kind: string; createdById: string | null }, action: 'read' | 'edit' | 'delete' | 'create') {
    const uid = actor.userId!;
    if (doc.kind === 'DRAFT') {
      if (doc.createdById !== uid) throw new AppError('NOT_FOUND', 'Entwurf nicht gefunden.');
      if (action !== 'read') await this.perms.assert(uid, 'messagebuilder.create');
      return;
    }
    const need = { read: null, edit: 'messagebuilder.templates_edit', delete: 'messagebuilder.templates_delete', create: 'messagebuilder.templates_create' }[action];
    if (need) await this.perms.assert(uid, need);
  }

  private async load(id: string) {
    const d = await this.prisma.messageBuilderDocument.findFirst({ where: { id, archivedAt: null } });
    if (!d) throw new AppError('NOT_FOUND', 'Entwurf/Vorlage nicht gefunden.');
    return d;
  }
  /** Gespeicherte Daten lesen – defekte Einträge (z. B. von Hand geändert) ergeben eine leere Gruppe statt eines Absturzes. */
  dataOf(v: unknown): MbDocumentData {
    const p = mbDocumentDataSchema.safeParse(v);
    return p.success ? p.data : mbDocumentDataSchema.parse({});
  }
  private view(d: Prisma.MessageBuilderDocumentGetPayload<object>, withData = true) {
    const data = this.dataOf(d.data);
    return {
      id: d.id, kind: d.kind, name: d.name, categoryId: d.categoryId, channelId: d.channelId, version: d.version, createdById: d.createdById,
      createdAt: d.createdAt, updatedAt: d.updatedAt, messageCount: data.messages.length, ...(withData ? { data } : {}),
    };
  }

  // ───────────── Entwürfe & Vorlagen ─────────────

  /** Vorlagen (alle) bzw. eigene Entwürfe – ohne Inhalt. */
  async list(actor: Actor, kind: Kind) {
    const rows = await this.prisma.messageBuilderDocument.findMany({
      where: { kind, archivedAt: null, ...(kind === 'DRAFT' ? { createdById: actor.userId } : {}) },
      orderBy: { updatedAt: 'desc' }, take: 500,
    });
    const users = await this.names(rows.map((r) => r.updatedById ?? r.createdById));
    return rows.map((r) => ({ ...this.view(r, false), updatedByName: users.get(r.updatedById ?? r.createdById ?? '') ?? null }));
  }
  async get(actor: Actor, id: string) {
    const d = await this.load(id);
    await this.assertDoc(actor, d, 'read');
    return this.view(d);
  }
  async create(actor: Actor, b: z.infer<typeof createDocSchema>) {
    await this.assertDoc(actor, { kind: b.kind, createdById: actor.userId }, 'create');
    if (b.categoryId) await this.assertCategory(b.categoryId);
    const data = b.data ?? mbDocumentDataSchema.parse({ messages: [{ id: 'm1' }] });
    const d = await this.prisma.$transaction(async (tx) => {
      const d = await tx.messageBuilderDocument.create({ data: { kind: b.kind, name: b.name, categoryId: b.categoryId, data: data as unknown as Prisma.InputJsonValue, createdById: actor.userId, updatedById: actor.userId } });
      await this.audit.record(actor, { action: b.kind === 'TEMPLATE' ? 'messagebuilder.template_create' : 'messagebuilder.draft_create', module: 'messagebuilder', entityType: 'MessageBuilderDocument', entityId: d.id, after: { name: d.name } }, tx);
      return d;
    });
    return this.view(d);
  }
  /** Autosave: gilt nur, wenn niemand zwischendurch gespeichert hat (sonst 409 mit aktuellem Stand). */
  async update(actor: Actor, id: string, b: z.infer<typeof updateDocSchema>) {
    const d = await this.load(id);
    await this.assertDoc(actor, d, 'edit');
    if (b.categoryId && b.categoryId !== d.categoryId) await this.assertCategory(b.categoryId);
    const r = await this.prisma.messageBuilderDocument.updateMany({
      where: { id, version: b.version, archivedAt: null },
      data: { name: b.name, categoryId: b.categoryId, channelId: b.channelId, data: b.data as unknown as Prisma.InputJsonValue, version: { increment: 1 }, updatedById: actor.userId },
    });
    if (!r.count) {
      const cur = await this.load(id);
      throw new AppError('CONFLICT', 'Inzwischen wurde eine neuere Fassung gespeichert (anderer Tab oder andere Person).', { current: this.view(cur) });
    }
    // Vorlagen: Änderungen protokollieren (Entwürfe nicht bei jedem Autosave)
    if (d.kind === 'TEMPLATE' && (d.name !== b.name || d.categoryId !== b.categoryId || JSON.stringify(d.data) !== JSON.stringify(b.data))) {
      await this.audit.record(actor, { action: 'messagebuilder.template_update', module: 'messagebuilder', entityType: 'MessageBuilderDocument', entityId: id, before: { name: d.name }, after: { name: b.name } });
    }
    return this.view(await this.load(id));
  }
  /** Kopie anlegen: Vorlage duplizieren, Entwurf als Vorlage speichern, Vorlage als neuen Entwurf laden. */
  async copy(actor: Actor, id: string, b: z.infer<typeof copyDocSchema>) {
    const src = await this.load(id);
    await this.assertDoc(actor, src, 'read');
    const suffix = src.kind === b.kind ? ' (Kopie)' : '';
    return this.create(actor, { kind: b.kind, name: (b.name ?? `${src.name}${suffix}`).slice(0, 100), categoryId: b.categoryId === undefined ? src.categoryId : b.categoryId, data: this.dataOf(src.data) });
  }
  /** Löschen = archivieren (bleibt in der Datenbank und in Backups erhalten). */
  async remove(actor: Actor, id: string) {
    const d = await this.load(id);
    await this.assertDoc(actor, d, 'delete');
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderDocument.update({ where: { id }, data: { archivedAt: new Date(), updatedById: actor.userId } });
      await this.audit.record(actor, { action: d.kind === 'TEMPLATE' ? 'messagebuilder.template_delete' : 'messagebuilder.draft_delete', module: 'messagebuilder', entityType: 'MessageBuilderDocument', entityId: id, before: { name: d.name } }, tx);
    });
  }

  // ───────────── Kategorien ─────────────

  categories() { return this.prisma.messageBuilderCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, position: true } }); }
  private async assertCategory(id: string) {
    if (!(await this.prisma.messageBuilderCategory.findUnique({ where: { id } }))) throw new AppError('VALIDATION_FAILED', 'Diese Kategorie gibt es nicht (mehr).');
  }
  async createCategory(actor: Actor, b: z.infer<typeof categorySchema>) {
    if (await this.prisma.messageBuilderCategory.findUnique({ where: { name: b.name } })) throw new AppError('CONFLICT', 'Diese Kategorie gibt es schon.');
    const max = await this.prisma.messageBuilderCategory.aggregate({ _max: { position: true } });
    const c = await this.prisma.messageBuilderCategory.create({ data: { name: b.name, position: b.position ?? (max._max.position ?? -1) + 1 } });
    await this.audit.record(actor, { action: 'messagebuilder.category_create', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: c.id, after: { name: c.name } });
    return c;
  }
  async updateCategory(actor: Actor, id: string, b: z.infer<typeof categorySchema>) {
    const old = await this.prisma.messageBuilderCategory.findUnique({ where: { id } });
    if (!old) throw new AppError('NOT_FOUND', 'Kategorie nicht gefunden.');
    const dup = await this.prisma.messageBuilderCategory.findUnique({ where: { name: b.name } });
    if (dup && dup.id !== id) throw new AppError('CONFLICT', 'Diese Kategorie gibt es schon.');
    const c = await this.prisma.messageBuilderCategory.update({ where: { id }, data: { name: b.name, ...(b.position !== undefined ? { position: b.position } : {}) } });
    await this.audit.record(actor, { action: 'messagebuilder.category_update', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: id, before: { name: old.name }, after: { name: c.name } });
    return c;
  }
  /** Kategorie löschen: Vorlagen bleiben erhalten (ohne Kategorie). */
  async removeCategory(actor: Actor, id: string) {
    const old = await this.prisma.messageBuilderCategory.findUnique({ where: { id } });
    if (!old) throw new AppError('NOT_FOUND', 'Kategorie nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderDocument.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.messageBuilderCategory.delete({ where: { id } });
      await this.audit.record(actor, { action: 'messagebuilder.category_delete', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: id, before: { name: old.name } }, tx);
    });
  }

  // ───────────── Kanäle (nur der fest eingerichtete Discord-Server) ─────────────

  async allowedChannelIds(): Promise<string[]> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: CHANNELS_KEY } }))?.value;
    const p = channelsConfigSchema.safeParse(v);
    return p.success ? p.data.channelIds : [];
  }
  async setAllowedChannels(actor: Actor, b: z.infer<typeof channelsConfigSchema>) {
    const ids = [...new Set(b.channelIds)];
    const known = new Set((await this.serverInfo()).channels.map((c) => c.id));
    const unknown = ids.filter((i) => !known.has(i));
    if (unknown.length) throw new AppError('VALIDATION_FAILED', `Kanal gehört nicht zum Discord-Server: ${unknown.join(', ')}`);
    const value = { channelIds: ids } as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CHANNELS_KEY }, create: { key: CHANNELS_KEY, value }, update: { value } });
      await this.audit.record(actor, { action: 'messagebuilder.channels_update', module: 'messagebuilder', entityType: 'SystemSetting', entityId: CHANNELS_KEY, after: { channelIds: ids } }, tx);
    });
    return { channelIds: ids };
  }

  /**
   * Discord-Server dieses Systems laut Bot-Meldung: Textkanäle (mit Bot-Rechten, falls gemeldet) und Rollen.
   * Es gibt bewusst keine Auswahl anderer Server.
   */
  async serverInfo() {
    const home = homeGuild();
    const guilds = await this.discord.guilds();
    const g = home ? guilds.find((x) => x.id === home) : guilds.length === 1 ? guilds[0] : undefined;
    if (!g) {
      // Ursache nennen: Bot hat (noch) nichts gemeldet, ist auf einem anderen als dem eingerichteten Server oder auf mehreren
      const reported = await this.discord.reportedGuilds();
      const others = reported.map((x) => ({ id: x.id, name: x.name }));
      const problem = !reported.length ? 'no_report' : home ? 'wrong_guild' : 'several_guilds';
      return { guild: null, channels: [] as MbChannel[], roles: [] as { id: string; name: string; color: number; position: number }[], configured: !!home, problem, configuredGuildId: home, reportedGuilds: others };
    }
    const allowed = await this.allowedChannelIds();
    const cats = new Map(g.channels.filter((c) => c.type === 'category').map((c) => [c.id, c]));
    const channels: MbChannel[] = g.channels.filter((c) => c.type === 'text')
      .sort((a, b) => (cats.get(a.parentId ?? '')?.position ?? -1) - (cats.get(b.parentId ?? '')?.position ?? -1) || a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, category: (c.parentId && cats.get(c.parentId)?.name) || null, position: c.position, bot: c.bot ?? null, allowed: !allowed.length || allowed.includes(c.id) }));
    return { guild: { id: g.id, name: g.name, icon: g.icon }, channels, roles: [...g.roles].sort((a, b) => b.position - a.position), configured: true, restricted: allowed.length > 0 };
  }

  async names(ids: (string | null | undefined)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const users = list.length ? await this.prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}
