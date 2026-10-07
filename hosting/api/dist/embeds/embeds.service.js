"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbedsService = exports.embedSchema = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const zod_1 = require("zod");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const KEY = 'embeds.messages';
const sf = zod_1.z.string().regex(/^\d{15,25}$/, 'Discord-ID (15–25 Ziffern)');
const https = zod_1.z.union([zod_1.z.string().trim().max(500).regex(/^https:\/\/\S+$/, 'Bild-URL muss mit https:// beginnen'), zod_1.z.literal('')]).default('');
/** Ein Embed wie bei Sapphire: Titel, Text, Abschnitte (Feld-Name + Text), Farbe, Bilder, Fußzeile. */
exports.embedSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().trim().min(1).max(80),
    guildId: sf.nullable().default(null),
    channelId: sf.nullable().default(null),
    content: zod_1.z.string().max(2000).default(''),
    title: zod_1.z.string().max(256).default(''),
    url: https,
    description: zod_1.z.string().max(4096).default(''),
    color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#8b5cf6'),
    author: zod_1.z.string().max(256).default(''),
    thumbnail: https, image: https,
    footer: zod_1.z.string().max(2048).default(''),
    timestamp: zod_1.z.boolean().default(true),
    fields: zod_1.z.array(zod_1.z.object({ name: zod_1.z.string().trim().min(1, 'Jeder Abschnitt braucht eine Überschrift.').max(256), value: zod_1.z.string().trim().min(1, 'Jeder Abschnitt braucht Text.').max(1024), inline: zod_1.z.boolean().default(false) })).max(25).default([]),
    /** Wo der Bot die Nachricht zuletzt gepostet hat (zum Aktualisieren). */
    posted: zod_1.z.object({ channelId: sf, messageId: sf, at: zod_1.z.string() }).nullable().default(null),
}).superRefine((e, ctx) => {
    if (!e.title && !e.description && !e.fields.length && !e.image)
        ctx.addIssue({ code: 'custom', path: ['description'], message: 'Das Embed braucht mindestens Titel, Text, einen Abschnitt oder ein Bild.' });
    const total = e.title.length + e.description.length + e.author.length + e.footer.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
    if (total > 6000)
        ctx.addIssue({ code: 'custom', path: ['description'], message: `Discord erlaubt höchstens 6000 Zeichen je Embed (gerade ${total}).` });
});
const listSchema = zod_1.z.array(exports.embedSchema).max(100);
/** Embed-Baukasten: Nachrichten im Dashboard bauen, in einen Kanal senden und später aktualisieren (der Bot bearbeitet dieselbe Nachricht). */
let EmbedsService = class EmbedsService {
    prisma;
    audit;
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async all(guildId) {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = listSchema.safeParse(v ?? []);
        const list = p.success ? p.data : [];
        return guildId ? list.filter((e) => !e.guildId || e.guildId === guildId) : list;
    }
    async write(list, tx = this.prisma) {
        const value = listSchema.parse(list);
        await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
    }
    async save(actor, e) {
        const list = await this.all();
        const old = list.find((x) => x.id === e.id);
        const doc = exports.embedSchema.parse({ ...e, posted: old?.posted ?? null });
        await this.prisma.$transaction(async (tx) => {
            await this.write(old ? list.map((x) => (x.id === e.id ? doc : x)) : [...list, doc], tx);
            await this.audit.record(actor, { action: old ? 'embed.update' : 'embed.create', module: 'settings', entityType: 'Embed', entityId: doc.id, after: { name: doc.name } }, tx);
        });
        return doc;
    }
    async duplicate(actor, id) {
        const src = (await this.all()).find((x) => x.id === id);
        if (!src)
            throw new errors_1.AppError('NOT_FOUND', 'Embed nicht gefunden.');
        return this.save(actor, { ...src, id: (0, node_crypto_1.randomUUID)(), name: `${src.name} (Kopie)`.slice(0, 80) });
    }
    async remove(actor, id) {
        const list = await this.all();
        if (!list.some((x) => x.id === id))
            throw new errors_1.AppError('NOT_FOUND', 'Embed nicht gefunden.');
        await this.prisma.$transaction(async (tx) => {
            await this.write(list.filter((x) => x.id !== id), tx);
            await this.audit.record(actor, { action: 'embed.delete', module: 'settings', entityType: 'Embed', entityId: id }, tx);
        });
    }
    message(e) {
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
    async send(actor, id, mode) {
        const e = (await this.all()).find((x) => x.id === id);
        if (!e)
            throw new errors_1.AppError('NOT_FOUND', 'Embed nicht gefunden.');
        if (!e.channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal.');
        const messageId = mode === 'update' && e.posted?.channelId === e.channelId ? e.posted.messageId : null;
        await this.prisma.$transaction(async (tx) => {
            await tx.discordOutbox.create({ data: { type: 'embed.post', channelKey: 'announcements', payload: { embedId: e.id, channelId: e.channelId, messageId, message: this.message(e) } } });
            await this.audit.record(actor, { action: 'embed.send', module: 'settings', entityType: 'Embed', entityId: e.id, after: { channelId: e.channelId, edit: !!messageId } }, tx);
        });
        return { queued: true, edit: !!messageId };
    }
    /** Bot meldet, wo die Nachricht steht. */
    async posted(id, channelId, messageId) {
        const list = await this.all();
        if (!list.some((x) => x.id === id))
            return; // inzwischen gelöscht
        await this.write(list.map((x) => (x.id === id ? { ...x, posted: { channelId, messageId, at: new Date().toISOString() } } : x)));
    }
};
exports.EmbedsService = EmbedsService;
exports.EmbedsService = EmbedsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], EmbedsService);
//# sourceMappingURL=embeds.service.js.map