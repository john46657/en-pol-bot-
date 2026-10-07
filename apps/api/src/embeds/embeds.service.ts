import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MessageSpec } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';

const KEY = 'embeds.messages';
const sf = z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const https = z.union([z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Bild-URL muss mit https:// beginnen'), z.literal('')]).default('');
/** Ein Embed wie bei Sapphire: Titel, Text, Abschnitte (Feld-Name + Text), Farbe, Bilder, Fußzeile. */
export const embedSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  guildId: sf.nullable().default(null),
  channelId: sf.nullable().default(null),
  content: z.string().max(2000).default(''),
  title: z.string().max(256).default(''),
  url: https,
  description: z.string().max(4096).default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
  author: z.string().max(256).default(''),
  thumbnail: https, image: https,
  footer: z.string().max(2048).default(''),
  timestamp: z.boolean().default(true),
  fields: z.array(z.object({ name: z.string().trim().min(1, 'Jeder Abschnitt braucht eine Überschrift.').max(256), value: z.string().trim().min(1, 'Jeder Abschnitt braucht Text.').max(1024), inline: z.boolean().default(false) })).max(25).default([]),
  /** Wo der Bot die Nachricht zuletzt gepostet hat (zum Aktualisieren). */
  posted: z.object({ channelId: sf, messageId: sf, at: z.string() }).nullable().default(null),
}).superRefine((e, ctx) => {
  if (!e.title && !e.description && !e.fields.length && !e.image) ctx.addIssue({ code: 'custom', path: ['description'], message: 'Das Embed braucht mindestens Titel, Text, einen Abschnitt oder ein Bild.' });
  const total = e.title.length + e.description.length + e.author.length + e.footer.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  if (total > 6000) ctx.addIssue({ code: 'custom', path: ['description'], message: `Discord erlaubt höchstens 6000 Zeichen je Embed (gerade ${total}).` });
});
export type EmbedDoc = z.infer<typeof embedSchema>;
const listSchema = z.array(embedSchema).max(100);

/** Embed-Baukasten: Nachrichten im Dashboard bauen, in einen Kanal senden und später aktualisieren (der Bot bearbeitet dieselbe Nachricht). */
@Injectable()
export class EmbedsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async all(guildId?: string | null): Promise<EmbedDoc[]> {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const p = listSchema.safeParse(v ?? []);
    const list = p.success ? p.data : [];
    return guildId ? list.filter((e) => !e.guildId || e.guildId === guildId) : list;
  }
  private async write(list: EmbedDoc[], tx: Prisma.TransactionClient = this.prisma) {
    const value = listSchema.parse(list) as unknown as Prisma.InputJsonValue;
    await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  }

  async save(actor: Actor, e: Omit<EmbedDoc, 'posted'> & { posted?: unknown }) {
    const list = await this.all();
    const old = list.find((x) => x.id === e.id);
    const doc = embedSchema.parse({ ...e, posted: old?.posted ?? null });
    await this.prisma.$transaction(async (tx) => {
      await this.write(old ? list.map((x) => (x.id === e.id ? doc : x)) : [...list, doc], tx);
      await this.audit.record(actor, { action: old ? 'embed.update' : 'embed.create', module: 'settings', entityType: 'Embed', entityId: doc.id, after: { name: doc.name } }, tx);
    });
    return doc;
  }
  async duplicate(actor: Actor, id: string) {
    const src = (await this.all()).find((x) => x.id === id);
    if (!src) throw new AppError('NOT_FOUND', 'Embed nicht gefunden.');
    return this.save(actor, { ...src, id: randomUUID(), name: `${src.name} (Kopie)`.slice(0, 80) });
  }
  async remove(actor: Actor, id: string) {
    const list = await this.all();
    if (!list.some((x) => x.id === id)) throw new AppError('NOT_FOUND', 'Embed nicht gefunden.');
    await this.prisma.$transaction(async (tx) => {
      await this.write(list.filter((x) => x.id !== id), tx);
      await this.audit.record(actor, { action: 'embed.delete', module: 'settings', entityType: 'Embed', entityId: id }, tx);
    });
  }

  message(e: EmbedDoc): MessageSpec {
    return {
      ...(e.content ? { content: e.content } : {}),
      embeds: [{
        ...(e.title ? { title: e.title } : {}), ...(e.url ? { url: e.url } : {}), ...(e.description ? { description: e.description } : {}),
        color: parseInt(e.color.slice(1), 16), ...(e.author ? { author: e.author } : {}), ...(e.thumbnail ? { thumbnail: e.thumbnail } : {}), ...(e.image ? { image: e.image } : {}),
        ...(e.footer ? { footer: e.footer } : {}), ...(e.timestamp ? { timestamp: new Date().toISOString() } : {}),
        ...(e.fields.length ? { fields: e.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline })) } : {}),
      }],
    };
  }

  /**
   * Senden: in den gewählten Kanal. Liegt die letzte Nachricht schon in diesem Kanal, bearbeitet der Bot sie (`update`),
   * sonst postet er neu (`new` erzwingt eine neue Nachricht).
   */
  async send(actor: Actor, id: string, mode: 'update' | 'new') {
    const e = (await this.all()).find((x) => x.id === id);
    if (!e) throw new AppError('NOT_FOUND', 'Embed nicht gefunden.');
    if (!e.channelId) throw new AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal.');
    const messageId = mode === 'update' && e.posted?.channelId === e.channelId ? e.posted.messageId : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.discordOutbox.create({ data: { type: 'embed.post', channelKey: 'announcements', payload: { embedId: e.id, channelId: e.channelId, messageId, message: this.message(e) } as unknown as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'embed.send', module: 'settings', entityType: 'Embed', entityId: e.id, after: { channelId: e.channelId, edit: !!messageId } }, tx);
    });
    return { queued: true, edit: !!messageId };
  }

  /** Bot meldet, wo die Nachricht steht. */
  async posted(id: string, channelId: string, messageId: string) {
    const list = await this.all();
    if (!list.some((x) => x.id === id)) return; // inzwischen gelöscht
    await this.write(list.map((x) => (x.id === id ? { ...x, posted: { channelId, messageId, at: new Date().toISOString() } } : x)));
  }
}
