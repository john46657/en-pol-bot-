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
exports.LoggingService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const KEY = 'logging.config';
const CAT = (k) => shared_1.LOG_CATEGORIES.find((c) => c.key === k);
const short = (v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return (s ?? '—').length > 120 ? `${(s ?? '').slice(0, 117)}…` : s ?? '—'; };
/** Änderungen als Felder: bei vorher/nachher nur, was sich geändert hat (höchstens 8). */
function changeFields(before, after) {
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
    const b = obj(before), a = obj(after);
    if (!a && !b)
        return [];
    if (!a)
        return [{ name: 'Vorher', value: short(before) }];
    const keys = Object.keys(a).filter((k) => !b || JSON.stringify(b[k]) !== JSON.stringify(a[k])).slice(0, 8);
    return keys.map((k) => ({ name: k.slice(0, 256), value: b && k in b ? `${short(b[k])} → ${short(a[k])}` : short(a[k]), inline: true }));
}
/**
 * Logging: jede Aktion aus dem Audit-Log kann je Kategorie bzw. Typ in einen Discord-Kanal gemeldet werden.
 * Die Meldung entsteht in derselben Transaktion wie der Audit-Eintrag (Outbox → Bot).
 */
let LoggingService = class LoggingService {
    prisma;
    audit;
    cfg = shared_1.loggingConfigSchema.parse({});
    constructor(prisma, audit) {
        this.prisma = prisma;
        this.audit = audit;
    }
    async onModuleInit() {
        await this.reload();
        (0, audit_service_1.setAuditSink)((db, actor, entry) => this.onAudit(db, actor, entry));
    }
    async reload() {
        const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
        const p = shared_1.loggingConfigSchema.safeParse(v ?? {});
        this.cfg = p.success ? p.data : shared_1.loggingConfigSchema.parse({});
    }
    get() { return this.cfg; }
    async save(actor, input) {
        const value = shared_1.loggingConfigSchema.parse(input);
        const json = value;
        await this.prisma.$transaction(async (tx) => {
            await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
            await this.audit.record(actor, { action: 'logging.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: json }, tx);
        });
        this.cfg = value;
        return value;
    }
    /** Kategorien mit allen Typen: bekannte Aktionen plus alles, was schon im Audit-Log steht. */
    async types() {
        const seen = await this.prisma.auditLog.groupBy({ by: ['module', 'action'], _count: { _all: true }, _max: { createdAt: true } });
        const all = new Map();
        for (const [action, module] of Object.entries(shared_1.LOG_TYPES))
            all.set(action, { module, count: 0, last: null });
        for (const s of seen)
            all.set(s.action, { module: s.module, count: s._count._all, last: s._max.createdAt });
        const cats = [...shared_1.LOG_CATEGORIES.map((c) => ({ key: c.key, label: c.label, emoji: c.emoji })), { key: 'sonstiges', label: 'Sonstiges', emoji: '📦' }];
        return cats.map((c) => ({
            ...c,
            types: [...all].filter(([, x]) => (0, shared_1.logCategoryOf)(x.module) === c.key).map(([action, x]) => ({ action, module: x.module, label: (0, shared_1.logTypeLabel)(action), count: x.count, lastAt: x.last, defaultOff: shared_1.LOG_DEFAULT_OFF.has(action) }))
                .sort((a, b) => a.label.localeCompare(b.label, 'de')),
        })).filter((c) => c.types.length);
    }
    /** Test-Meldung in den Kanal einer Kategorie. */
    async test(actor, category) {
        const ch = this.cfg.categories[category];
        if (!ch)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Für diese Kategorie ist kein Kanal gesetzt.');
        const c = CAT(category);
        await this.prisma.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId: ch, forceNew: true, message: { embeds: [{ title: `${c?.emoji ?? '📦'} Test – ${c?.label ?? 'Sonstiges'}`, description: 'So sehen die Meldungen dieser Kategorie aus. Hier landen ab jetzt die eingestellten Aktionen.', color: 0x3b82f6, footer: 'Logging-Test', timestamp: new Date().toISOString() }] } } } });
        return { queued: true };
    }
    async onAudit(db, actor, e) {
        const channelId = (0, shared_1.logChannelFor)(this.cfg, e.module, e.action);
        if (!channelId)
            return;
        const c = CAT((0, shared_1.logCategoryOf)(e.module));
        const [user, link] = actor.userId ? await Promise.all([db.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }), db.discordLink.findUnique({ where: { userId: actor.userId } })]) : [null, null];
        const who = link ? `<@${link.discordId}>${user ? ` (${user.displayName})` : ''}` : user?.displayName ?? 'System';
        const lines = [`**Von:** ${who}`, ...(e.entityType ? [`**Objekt:** ${e.entityType}${e.entityId ? ` \`${e.entityId.slice(0, 40)}\`` : ''}`] : []), ...(e.reason ? [`**Grund:** ${e.reason.slice(0, 500)}`] : [])];
        const message = { embeds: [{ title: `${c?.emoji ?? '📦'} ${(0, shared_1.logTypeLabel)(e.action)}`.slice(0, 256), description: lines.join('\n'), color: e.action.endsWith('delete') || e.action.endsWith('remove') ? 0xef4444 : e.action.endsWith('create') ? 0x22c55e : 0x3b82f6, fields: changeFields(e.before, e.after), footer: `${c?.label ?? 'Sonstiges'} · ${e.action}`, timestamp: new Date().toISOString() }] };
        await db.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId, forceNew: true, message } } });
    }
};
exports.LoggingService = LoggingService;
exports.LoggingService = LoggingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService])
], LoggingService);
//# sourceMappingURL=logging.service.js.map