import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { MB_DEFAULT_CATEGORIES, MB_EXAMPLE_TEMPLATES, MB_TEMPLATE_EXPORT_FORMAT, mbDocumentDataSchema, mbTemplateExportSchema, type MbChannelBotPerms, type MbDocumentData } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { PermissionService } from '../authz/permission.service';
import { DiscordService } from '../discord/discord.service';
import { AppError } from '../common/errors';
import { currentGuild, runInGuild } from '../common/guild-context';

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
export const templateImportSchema = mbTemplateExportSchema;
export const templateExportQuery = z.object({ ids: z.string().max(4000).optional() });

const CHANNELS_KEY = 'messagebuilder.channels'; // je Server (server-scope.ts leitet auf `…@<Server>` um)
/** Message Builder arbeitet immer für genau einen Discord-Server (oben links gewählt). */
export function requireGuild(): string {
  const g = currentGuild();
  if (!g) throw new AppError('VALIDATION_FAILED', 'Bitte zuerst oben links einen Discord-Server wählen – der Message Builder arbeitet je Server.');
  return g;
}
export type Kind = z.infer<typeof docKind>;

/** Zielkanal: Textkanal (auch Ankündigungskanal) oder Forum (Senden = neuer Beitrag bzw. in bestehenden Beitrag). */
export interface MbChannel { id: string; name: string; type: 'text' | 'forum'; category: string | null; position: number; bot: MbChannelBotPerms | null; allowed: boolean }
/** Aktiver Thread bzw. Forum-Beitrag (meldet der Bot; archivierte Threads sind nicht dabei, per ID aber erreichbar). */
export interface MbThread { id: string; name: string; parentId: string }

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
    const d = await this.prisma.messageBuilderDocument.findFirst({ where: { id, guildId: requireGuild(), archivedAt: null } });
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
      createdAt: d.createdAt, updatedAt: d.updatedAt, messageCount: data.messages.length, sourceTemplateId: d.sourceTemplateId, ...(withData ? { data } : {}),
    };
  }

  // ───────────── Entwürfe & Vorlagen ─────────────

  /** Vorlagen (alle) bzw. eigene Entwürfe – ohne Inhalt. */
  async list(actor: Actor, kind: Kind) {
    const rows = await this.prisma.messageBuilderDocument.findMany({
      where: { guildId: requireGuild(), kind, archivedAt: null, ...(kind === 'DRAFT' ? { createdById: actor.userId } : {}) },
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
  async create(actor: Actor, b: z.infer<typeof createDocSchema>, sourceTemplateId: string | null = null) {
    await this.assertDoc(actor, { kind: b.kind, createdById: actor.userId }, 'create');
    if (b.categoryId) await this.assertCategory(b.categoryId);
    const data = b.data ?? mbDocumentDataSchema.parse({ messages: [{ id: 'm1' }] });
    const d = await this.prisma.$transaction(async (tx) => {
      const d = await tx.messageBuilderDocument.create({ data: { guildId: requireGuild(), kind: b.kind, name: b.name, categoryId: b.categoryId, data: data as unknown as Prisma.InputJsonValue, createdById: actor.userId, updatedById: actor.userId, sourceTemplateId } });
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
      where: { id, guildId: requireGuild(), version: b.version, archivedAt: null },
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
    // Vorlage → Entwurf: Herkunft merken („verwendete Vorlage“ in der Historie); Entwurf → Entwurf behält sie
    const source = src.kind === 'TEMPLATE' ? src.id : src.sourceTemplateId;
    return this.create(actor, { kind: b.kind, name: (b.name ?? `${src.name}${suffix}`).slice(0, 100), categoryId: b.categoryId === undefined ? src.categoryId : b.categoryId, data: this.dataOf(src.data) }, b.kind === 'DRAFT' ? source : null);
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

  /** Kategorien des gewählten Servers; ein Server ohne Kategorien bekommt die Standard-Kategorien. */
  async categories() {
    const guildId = requireGuild();
    const list = () => this.prisma.messageBuilderCategory.findMany({ where: { guildId }, orderBy: [{ position: 'asc' }, { name: 'asc' }], select: { id: true, name: true, position: true } });
    const rows = await list();
    if (rows.length) return rows;
    await this.prisma.messageBuilderCategory.createMany({ data: MB_DEFAULT_CATEGORIES.map((name, position) => ({ guildId, name, position })), skipDuplicates: true });
    // Ganz neuer Server (noch nie Vorlagen): neutrale Beispielvorlagen dazu – nichts Bestehendes wird verändert
    if (!(await this.prisma.messageBuilderDocument.count({ where: { guildId, kind: 'TEMPLATE' } }))) await this.addExamples(null);
    return list();
  }

  // ───────────── Beispielvorlagen, Import/Export ─────────────

  /**
   * Beispielvorlagen ergänzen: nur Vorlagen, deren Name es (auch archiviert) noch nicht gibt; fehlende Kategorien werden
   * angelegt. Bestehende Vorlagen und Nachrichten werden nie überschrieben.
   */
  async addExamples(actor: Actor | null) {
    const guildId = requireGuild();
    const existing = new Set((await this.prisma.messageBuilderDocument.findMany({ where: { guildId, kind: 'TEMPLATE' }, select: { name: true } })).map((d) => d.name));
    const todo = MB_EXAMPLE_TEMPLATES.filter((t) => !existing.has(t.name));
    if (!todo.length) return { added: [] as string[], skipped: MB_EXAMPLE_TEMPLATES.map((t) => t.name) };
    const cats = await this.categoryIdsFor(todo.map((t) => t.category), true);
    await this.prisma.$transaction(async (tx) => {
      for (const t of todo) {
        const d = await tx.messageBuilderDocument.create({ data: { guildId, kind: 'TEMPLATE', name: t.name, categoryId: cats.get(t.category) ?? null, data: t.data as unknown as Prisma.InputJsonValue, createdById: actor?.userId ?? null, updatedById: actor?.userId ?? null } });
        if (actor) await this.audit.record(actor, { action: 'messagebuilder.template_create', module: 'messagebuilder', entityType: 'MessageBuilderDocument', entityId: d.id, after: { name: d.name, example: true } }, tx);
      }
    });
    return { added: todo.map((t) => t.name), skipped: MB_EXAMPLE_TEMPLATES.filter((t) => existing.has(t.name)).map((t) => t.name) };
  }

  /** Kategorie-IDs nach Name; fehlende werden (falls erlaubt) angelegt. */
  private async categoryIdsFor(names: (string | null)[], create: boolean) {
    const guildId = requireGuild();
    const wanted = [...new Set(names.filter((n): n is string => !!n))];
    const have = await this.prisma.messageBuilderCategory.findMany({ where: { guildId }, select: { id: true, name: true, position: true } });
    const map = new Map(have.map((c) => [c.name, c.id]));
    let pos = Math.max(-1, ...have.map((c) => c.position));
    for (const n of wanted) {
      if (map.has(n) || !create) continue;
      const c = await this.prisma.messageBuilderCategory.create({ data: { guildId, name: n, position: ++pos } });
      map.set(n, c.id);
    }
    return map;
  }

  /** Vorlagen exportieren (alle oder ausgewählte) im Austauschformat. */
  async exportTemplates(ids?: string[]) {
    const guildId = requireGuild();
    const rows = await this.prisma.messageBuilderDocument.findMany({ where: { guildId, kind: 'TEMPLATE', archivedAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, include: { category: true }, orderBy: { name: 'asc' } });
    return { format: MB_TEMPLATE_EXPORT_FORMAT, version: 1 as const, exportedAt: new Date().toISOString(), templates: rows.map((r) => ({ name: r.name, category: r.category?.name ?? null, data: this.dataOf(r.data) })) };
  }

  /** Vorlagen importieren: immer als neue Vorlagen (gleicher Name → „(Import)“), nie überschreiben. */
  async importTemplates(actor: Actor, b: z.infer<typeof templateImportSchema>) {
    const guildId = requireGuild();
    await this.perms.assert(actor.userId!, 'messagebuilder.templates_create');
    const mayCreateCats = await this.perms.has(actor.userId!, 'messagebuilder.templates_edit');
    const cats = await this.categoryIdsFor(b.templates.map((t) => t.category), mayCreateCats);
    const names = new Set((await this.prisma.messageBuilderDocument.findMany({ where: { guildId, kind: 'TEMPLATE', archivedAt: null }, select: { name: true } })).map((d) => d.name));
    const created: { id: string; name: string }[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const t of b.templates) {
        let name = t.name;
        for (let k = 1; names.has(name); k++) name = `${t.name} (Import${k > 1 ? ` ${k}` : ''})`.slice(0, 100);
        names.add(name);
        const d = await tx.messageBuilderDocument.create({ data: { guildId, kind: 'TEMPLATE', name, categoryId: (t.category && cats.get(t.category)) || null, data: t.data as unknown as Prisma.InputJsonValue, createdById: actor.userId, updatedById: actor.userId } });
        created.push({ id: d.id, name });
      }
      await this.audit.record(actor, { action: 'messagebuilder.template_import', module: 'messagebuilder', entityType: 'MessageBuilderDocument', entityId: created[0]?.id, after: { count: created.length, names: created.map((c) => c.name) } }, tx);
    });
    return { created };
  }
  private async assertCategory(id: string) {
    if (!(await this.prisma.messageBuilderCategory.findFirst({ where: { id, guildId: requireGuild() } }))) throw new AppError('VALIDATION_FAILED', 'Diese Kategorie gibt es nicht (mehr).');
  }
  async createCategory(actor: Actor, b: z.infer<typeof categorySchema>) {
    if (await this.prisma.messageBuilderCategory.findFirst({ where: { guildId: requireGuild(), name: b.name } })) throw new AppError('CONFLICT', 'Diese Kategorie gibt es schon.');
    const max = await this.prisma.messageBuilderCategory.aggregate({ where: { guildId: requireGuild() }, _max: { position: true } });
    const c = await this.prisma.messageBuilderCategory.create({ data: { guildId: requireGuild(), name: b.name, position: b.position ?? (max._max.position ?? -1) + 1 } });
    await this.audit.record(actor, { action: 'messagebuilder.category_create', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: c.id, after: { name: c.name } });
    return c;
  }
  async updateCategory(actor: Actor, id: string, b: z.infer<typeof categorySchema>) {
    const old = await this.prisma.messageBuilderCategory.findFirst({ where: { id, guildId: requireGuild() } });
    if (!old) throw new AppError('NOT_FOUND', 'Kategorie nicht gefunden.');
    const dup = await this.prisma.messageBuilderCategory.findFirst({ where: { guildId: requireGuild(), name: b.name } });
    if (dup && dup.id !== id) throw new AppError('CONFLICT', 'Diese Kategorie gibt es schon.');
    const c = await this.prisma.messageBuilderCategory.update({ where: { id }, data: { name: b.name, ...(b.position !== undefined ? { position: b.position } : {}) } });
    await this.audit.record(actor, { action: 'messagebuilder.category_update', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: id, before: { name: old.name }, after: { name: c.name } });
    return c;
  }
  /** Kategorie löschen: Vorlagen bleiben erhalten (ohne Kategorie). */
  async removeCategory(actor: Actor, id: string) {
    const old = await this.prisma.messageBuilderCategory.findFirst({ where: { id, guildId: requireGuild() } });
    if (!old) throw new AppError('NOT_FOUND', 'Kategorie nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await tx.messageBuilderDocument.updateMany({ where: { categoryId: id, guildId: old.guildId }, data: { categoryId: null } });
      await tx.messageBuilderCategory.delete({ where: { id } });
      await this.audit.record(actor, { action: 'messagebuilder.category_delete', module: 'messagebuilder', entityType: 'MessageBuilderCategory', entityId: id, before: { name: old.name } }, tx);
    });
  }

  // ───────────── Kanäle (des gewählten Discord-Servers) ─────────────

  async allowedChannelIds(guildId: string | null = currentGuild()): Promise<string[]> {
    if (!guildId) requireGuild();
    // Einstellung des Servers (server-scope.ts leitet im Kontext des Servers auf `…@<Server>` um)
    const v = (await runInGuild(guildId, () => this.prisma.systemSetting.findUnique({ where: { key: CHANNELS_KEY } })))?.value;
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
   * Gewählter Discord-Server laut Bot-Meldung: Textkanäle (mit Bot-Rechten, falls gemeldet) und Rollen. Nur dieser Server –
   * Kanäle und Rollen anderer Server sind hier nie wählbar.
   */
  async serverInfo(guildId: string | null = currentGuild()) {
    const none = { guild: null, channels: [] as MbChannel[], threads: [] as MbThread[], roles: [] as { id: string; name: string; color: number; position: number }[], configured: !!guildId };
    if (!guildId) return { ...none, problem: 'no_server' as const };
    const g = (await this.discord.guilds()).find((x) => x.id === guildId);
    // Ursache nennen: Bot ist (noch) nicht auf dem Server bzw. hat ihn noch nicht gemeldet
    if (!g) return { ...none, problem: 'no_report' as const };
    const allowed = await this.allowedChannelIds(guildId);
    const cats = new Map(g.channels.filter((c) => c.type === 'category').map((c) => [c.id, c]));
    const forums = new Map((g.forums ?? []).map((f) => [f.id, f]));
    const channels: MbChannel[] = g.channels.filter((c) => c.type === 'text' || forums.has(c.id))
      .sort((a, b) => (cats.get(a.parentId ?? '')?.position ?? -1) - (cats.get(b.parentId ?? '')?.position ?? -1) || a.position - b.position)
      .map((c) => ({ id: c.id, name: c.name, type: forums.has(c.id) ? 'forum' as const : 'text' as const, category: (c.parentId && cats.get(c.parentId)?.name) || null, position: c.position, bot: c.bot ?? forums.get(c.id)?.bot ?? null, allowed: !allowed.length || allowed.includes(c.id) }));
    const known = new Set(channels.map((c) => c.id));
    const threads: MbThread[] = (g.threads ?? []).filter((t) => known.has(t.parentId)).map((t) => ({ id: t.id, name: t.name, parentId: t.parentId }));
    return { guild: { id: g.id, name: g.name, icon: g.icon }, channels, threads, roles: [...g.roles].sort((a, b) => b.position - a.position), configured: true, restricted: allowed.length > 0 };
  }

  async names(ids: (string | null | undefined)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const users = list.length ? await this.prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}
