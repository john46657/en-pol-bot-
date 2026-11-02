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
exports.HelpService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
/**
 * Hilfe-Center (Wissensdatenbank): Kategorien und Artikel (Artikel, Anleitung, FAQ) mit Veröffentlichungsstatus und
 * Änderungsverlauf. Lesen: `help.view` (nur veröffentlichte); Bearbeiten: `help.manage` (auch Entwürfe/Archiv).
 * Keine Inhalte sind vorgegeben – alles legen berechtigte Administratoren im Dashboard an.
 */
let HelpService = class HelpService {
    prisma;
    audit;
    perms;
    constructor(prisma, audit, perms) {
        this.prisma = prisma;
        this.audit = audit;
        this.perms = perms;
    }
    async manager(actor) { return this.perms.has(actor.userId, 'help.manage'); }
    categories() {
        return this.prisma.helpCategory.findMany({ orderBy: [{ position: 'asc' }, { name: 'asc' }], include: { _count: { select: { articles: { where: { status: 'PUBLISHED' } } } } } });
    }
    async saveCategory(actor, d, id) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const before = id ? await tx.helpCategory.findUnique({ where: { id } }) : null;
                if (id && !before)
                    throw new errors_1.AppError('NOT_FOUND', 'Kategorie nicht gefunden.');
                const data = { name: d.name, description: d.description ?? null, icon: d.icon ?? null, position: d.position ?? before?.position ?? 0 };
                const row = before ? await tx.helpCategory.update({ where: { id: before.id }, data }) : await tx.helpCategory.create({ data });
                await this.audit.record(actor, { action: before ? 'help.category.update' : 'help.category.create', module: 'help', entityType: 'HelpCategory', entityId: row.id, before, after: row }, tx);
                return row;
            });
        }
        catch (e) {
            if (e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
                throw new errors_1.AppError('CONFLICT', 'Eine Kategorie mit diesem Namen gibt es schon.');
            throw e;
        }
    }
    /** Suche (serverseitig, Titel/Zusammenfassung/Text/Schlagwörter), Filter nach Kategorie/Art/Status, Seiten. */
    async list(actor, q) {
        const manage = await this.manager(actor);
        const take = 30;
        const page = Math.max(1, q.page ?? 1);
        const term = q.q?.trim();
        const where = {
            ...(manage ? (q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }) : { status: 'PUBLISHED' }),
            ...(q.categoryId ? { categoryId: q.categoryId } : {}), ...(q.kind ? { kind: q.kind } : {}),
            ...(term ? { OR: [{ title: { contains: term, mode: 'insensitive' } }, { summary: { contains: term, mode: 'insensitive' } }, { body: { contains: term, mode: 'insensitive' } }, { tags: { has: term.toLowerCase() } }] } : {}),
        };
        const [total, rows] = await Promise.all([
            this.prisma.helpArticle.count({ where }),
            this.prisma.helpArticle.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * take, take, select: { id: true, slug: true, title: true, kind: true, summary: true, status: true, tags: true, categoryId: true, version: true, publishedAt: true, updatedAt: true, category: { select: { name: true } } } }),
        ]);
        // Treffer im Titel zuerst
        if (term)
            rows.sort((a, b) => Number(b.title.toLowerCase().includes(term.toLowerCase())) - Number(a.title.toLowerCase().includes(term.toLowerCase())));
        return { total, page, pageSize: take, rows };
    }
    async get(actor, idOrSlug) {
        const isId = /^[0-9a-f-]{36}$/i.test(idOrSlug);
        const a = await this.prisma.helpArticle.findFirst({ where: isId ? { id: idOrSlug } : { slug: idOrSlug }, include: { category: { select: { id: true, name: true } } } });
        if (!a || (a.status !== 'PUBLISHED' && !(await this.manager(actor))))
            throw new errors_1.AppError('NOT_FOUND', 'Artikel nicht gefunden.');
        return a;
    }
    async uniqueSlug(tx, title, exceptId) {
        const base = (0, shared_1.helpSlug)(title);
        let slug = base;
        for (let i = 2;; i++) {
            const other = await tx.helpArticle.findFirst({ where: { slug }, select: { id: true } });
            if (!other || other.id === exceptId)
                return slug;
            slug = `${base}-${i}`.slice(0, 80);
        }
    }
    async save(actor, d, id) {
        if (d.categoryId && !(await this.prisma.helpCategory.findUnique({ where: { id: d.categoryId } })))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Kategorie nicht gefunden.');
        if (d.mediaIds.length) {
            const media = await this.prisma.media.findMany({ where: { id: { in: d.mediaIds } }, select: { linkedType: true } });
            if (media.length !== d.mediaIds.length || media.some((m) => m.linkedType !== 'HelpAsset'))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Bilder/Dokumente müssen als Hilfe-Datei (HelpAsset) hochgeladen sein.');
        }
        return this.prisma.$transaction(async (tx) => {
            const before = id ? await tx.helpArticle.findUnique({ where: { id } }) : null;
            if (id && !before)
                throw new errors_1.AppError('NOT_FOUND', 'Artikel nicht gefunden.');
            if (before && d.version !== undefined && d.version !== before.version)
                throw new errors_1.AppError('CONFLICT', 'Der Artikel wurde inzwischen geändert – bitte neu laden.', { reason: 'VERSION' });
            const slug = !before || before.title !== d.title ? await this.uniqueSlug(tx, d.title, before?.id) : before.slug;
            const publish = d.status === 'PUBLISHED' && before?.status !== 'PUBLISHED';
            const data = { title: d.title, slug, categoryId: d.categoryId ?? null, kind: d.kind, summary: d.summary ?? null, body: d.body, mediaIds: d.mediaIds, tags: d.tags.map((t) => t.toLowerCase()), status: d.status, updatedById: actor.userId, ...(publish ? { publishedAt: new Date() } : {}) };
            // Änderungsverlauf: Stand VOR der Änderung festhalten
            if (before)
                await tx.helpArticleRevision.create({ data: { articleId: before.id, version: before.version, title: before.title, summary: before.summary, body: before.body, status: before.status, changeNote: d.changeNote ?? null, editedById: actor.userId } });
            const row = before ? await tx.helpArticle.update({ where: { id: before.id }, data: { ...data, version: { increment: 1 } } }) : await tx.helpArticle.create({ data: { ...data, createdById: actor.userId } });
            await this.audit.record(actor, { action: before ? (publish ? 'help.article.publish' : 'help.article.update') : 'help.article.create', module: 'help', entityType: 'HelpArticle', entityId: row.id, reason: d.changeNote, before: before ? { title: before.title, status: before.status, version: before.version } : undefined, after: { title: row.title, status: row.status, version: row.version } }, tx);
            return row;
        });
    }
    async revisions(id) {
        if (!(await this.prisma.helpArticle.findUnique({ where: { id }, select: { id: true } })))
            throw new errors_1.AppError('NOT_FOUND', 'Artikel nicht gefunden.');
        const revs = await this.prisma.helpArticleRevision.findMany({ where: { articleId: id }, orderBy: { version: 'desc' }, take: 100 });
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(revs.map((r) => r.editedById))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return revs.map((r) => ({ ...r, editedBy: names.get(r.editedById) ?? '—' }));
    }
};
exports.HelpService = HelpService;
exports.HelpService = HelpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, permission_service_1.PermissionService])
], HelpService);
//# sourceMappingURL=help.service.js.map