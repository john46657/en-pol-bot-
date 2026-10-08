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
exports.PanelsService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const discord_service_1 = require("../discord/discord.service");
const discord_live_service_1 = require("../discord/discord-live.service");
const errors_1 = require("../common/errors");
const json_store_1 = require("../common/json-store");
/** Staff-Listen (Discord-Teamliste nach Rollen) und Formular-Panels – alles im Dashboard eingestellt, der Bot führt aus. */
let PanelsService = class PanelsService {
    prisma;
    audit;
    discord;
    live;
    staff;
    forms;
    infos;
    constructor(prisma, audit, discord, live) {
        this.prisma = prisma;
        this.audit = audit;
        this.discord = discord;
        this.live = live;
        this.staff = new json_store_1.JsonListStore(prisma, 'discord.staffLists', shared_1.staffListSchema, 50);
        this.forms = new json_store_1.JsonListStore(prisma, 'discord.formPanels', shared_1.formPanelSchema, 50);
        this.infos = new json_store_1.JsonListStore(prisma, 'discord.infoPanels', shared_1.infoPanelSchema, 50);
    }
    visible(list, g) { return g ? list.filter((x) => !x.guildId || x.guildId === g) : list; }
    // ---------------- Staff-Listen ----------------
    async staffLists(g) {
        const list = this.visible(await this.staff.all(), g);
        return Promise.all(list.map(async (l) => ({ ...l, posted: await this.discord.posted(`staff-${l.id}`) })));
    }
    async saveStaff(actor, doc) {
        const [d, old] = await this.staff.upsert(shared_1.staffListSchema.parse(doc));
        await this.audit.record(actor, { action: old ? 'stafflist.update' : 'stafflist.create', module: 'team', entityType: 'StaffList', entityId: d.id, after: { name: d.name, sections: d.sections.length } });
        return d;
    }
    async removeStaff(actor, id) {
        if (!(await this.staff.remove(id)))
            throw new errors_1.AppError('NOT_FOUND', 'Liste nicht gefunden.');
        await this.audit.record(actor, { action: 'stafflist.delete', module: 'team', entityType: 'StaffList', entityId: id });
    }
    async duplicateStaff(actor, id) {
        const src = await this.staff.get(id);
        if (!src)
            throw new errors_1.AppError('NOT_FOUND', 'Liste nicht gefunden.');
        return this.saveStaff(actor, { ...src, id: (0, node_crypto_1.randomUUID)(), name: `${src.name} (Kopie)`.slice(0, 80), channelId: null });
    }
    /** Vorschau mit den Teammitgliedern, die der Bot meldet (Teamrollen). Im Discord rechnet der Bot mit allen Mitgliedern der Rollen. */
    async previewStaff(guildId) {
        const l = { guildId };
        const members = this.live.getMembers().members.filter((m) => !l.guildId || m.guildId === l.guildId).map((m) => ({ id: m.id, name: m.displayName, roleIds: m.roleIds }));
        const byId = new Map();
        for (const m of members)
            byId.set(m.id, { ...m, roleIds: [...new Set([...(byId.get(m.id)?.roleIds ?? []), ...m.roleIds])] });
        return { members: [...byId.values()] };
    }
    /** Sofort senden/aktualisieren lassen (der Bot rechnet die Mitglieder selbst). */
    async sendStaff(actor, id, mode) {
        const l = await this.staff.get(id);
        if (!l)
            throw new errors_1.AppError('NOT_FOUND', 'Liste nicht gefunden.');
        if (!l.channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal.');
        await this.prisma.discordOutbox.create({ data: { type: 'bot.stafflist', channelKey: 'announcements', payload: { id, forceNew: mode === 'new' } } });
        await this.audit.record(actor, { action: 'stafflist.send', module: 'team', entityType: 'StaffList', entityId: id, after: { channelId: l.channelId, mode } });
        return { queued: true };
    }
    // ---------------- Formular-Panels ----------------
    async formPanels(g) {
        const list = this.visible(await this.forms.all(), g);
        const counts = await this.prisma.panelSubmission.groupBy({ by: ['panelId'], _count: { _all: true }, where: { panelId: { in: list.map((p) => p.id) } } });
        const n = new Map(counts.map((c) => [c.panelId, c._count._all]));
        return Promise.all(list.map(async (p) => ({ ...p, posted: await this.discord.posted(`fpanel-${p.id}`), submissions: n.get(p.id) ?? 0 })));
    }
    async saveForm(actor, doc) {
        const p = shared_1.formPanelSchema.parse(doc);
        const ids = p.fields.map((f) => f.id);
        if (new Set(ids).size !== ids.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Jedes Feld braucht ein eigenes Kürzel.');
        const [d, old] = await this.forms.upsert(p);
        await this.audit.record(actor, { action: old ? 'formpanel.update' : 'formpanel.create', module: 'settings', entityType: 'FormPanel', entityId: d.id, after: { name: d.name } });
        // Panel steht schon in Discord → Button/Text gleich mitziehen
        const posted = await this.discord.posted(`fpanel-${d.id}`);
        if (posted && d.channelId === posted.channelId && old && JSON.stringify((0, shared_1.formPanelMessage)(old)) !== JSON.stringify((0, shared_1.formPanelMessage)(d)))
            await this.discord.postMessage(`fpanel-${d.id}`, d.channelId, (0, shared_1.formPanelMessage)(d));
        return d;
    }
    async removeForm(actor, id) {
        if (!(await this.forms.remove(id)))
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        await this.audit.record(actor, { action: 'formpanel.delete', module: 'settings', entityType: 'FormPanel', entityId: id });
    }
    async sendForm(actor, id, mode) {
        const p = await this.forms.get(id);
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        if (!p.channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal für das Panel.');
        await this.discord.postMessage(`fpanel-${p.id}`, p.channelId, (0, shared_1.formPanelMessage)(p), { forceNew: mode === 'new' });
        await this.audit.record(actor, { action: 'formpanel.send', module: 'settings', entityType: 'FormPanel', entityId: id, after: { channelId: p.channelId, mode } });
        return { queued: true };
    }
    // ---------------- Info-Panels (Bild, Text, Auswahlmenü) ----------------
    async infoPanels(g) {
        const list = this.visible(await this.infos.all(), g);
        return Promise.all(list.map(async (p) => ({ ...p, posted: await this.discord.posted(`ipanel-${p.id}`) })));
    }
    async saveInfo(actor, doc) {
        const p = shared_1.infoPanelSchema.parse(doc);
        if (new Set(p.options.map((o) => o.id)).size !== p.options.length)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Jeder Auswahlpunkt braucht ein eigenes Kürzel.');
        const [d, old] = await this.infos.upsert(p);
        await this.audit.record(actor, { action: old ? 'infopanel.update' : 'infopanel.create', module: 'settings', entityType: 'InfoPanel', entityId: d.id, after: { name: d.name } });
        // steht schon in Discord → Text/Auswahl gleich mitziehen
        const posted = await this.discord.posted(`ipanel-${d.id}`);
        if (posted && d.channelId === posted.channelId && old && JSON.stringify((0, shared_1.infoPanelMessage)(old)) !== JSON.stringify((0, shared_1.infoPanelMessage)(d)))
            await this.discord.postMessage(`ipanel-${d.id}`, d.channelId, (0, shared_1.infoPanelMessage)(d));
        return d;
    }
    async removeInfo(actor, id) {
        if (!(await this.infos.remove(id)))
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        await this.audit.record(actor, { action: 'infopanel.delete', module: 'settings', entityType: 'InfoPanel', entityId: id });
    }
    async sendInfo(actor, id, mode) {
        const p = await this.infos.get(id);
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        if (!p.channelId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal für das Panel.');
        await this.discord.postMessage(`ipanel-${p.id}`, p.channelId, (0, shared_1.infoPanelMessage)(p), { forceNew: mode === 'new' });
        await this.audit.record(actor, { action: 'infopanel.send', module: 'settings', entityType: 'InfoPanel', entityId: id, after: { channelId: p.channelId, mode } });
        return { queued: true };
    }
    async botInfo(id) {
        const p = await this.infos.get(id);
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Panel nicht gefunden.');
        return p;
    }
    submissions(panelId) {
        return this.prisma.panelSubmission.findMany({ where: { panelId }, orderBy: { createdAt: 'desc' }, take: 200 });
    }
    async removeSubmission(actor, id) {
        const s = await this.prisma.panelSubmission.findUnique({ where: { id } });
        if (!s)
            throw new errors_1.AppError('NOT_FOUND', 'Eintrag nicht gefunden.');
        await this.prisma.panelSubmission.delete({ where: { id } });
        // Nachricht in Discord ebenfalls entfernen
        if (s.channelId && s.messageId)
            await this.prisma.discordOutbox.create({ data: { type: 'bot.delete', channelKey: 'announcements', payload: { channelId: s.channelId, messageId: s.messageId } } });
        await this.audit.record(actor, { action: 'formpanel.submission.delete', module: 'settings', entityType: 'PanelSubmission', entityId: id, before: { discordId: s.discordId } });
    }
    // ---------------- für den Bot ----------------
    async botStaffLists() { return this.staff.all(); }
    async botForm(id) {
        const p = await this.forms.get(id);
        if (!p || !p.active)
            throw new errors_1.AppError('NOT_FOUND', 'Dieses Panel ist nicht mehr aktiv.');
        return p;
    }
    /** Einsendung speichern und die fertige Nachricht liefern; bei „einmal je Person“ den alten Ort zum Löschen mitgeben. */
    async botSubmit(id, d) {
        const p = await this.botForm(id);
        const values = {};
        for (const f of p.fields) {
            const v = (d.values[f.id] ?? '').trim().slice(0, f.maxLength);
            if (f.required && !v)
                throw new errors_1.AppError('VALIDATION_FAILED', `„${f.label}“ fehlt.`);
            values[f.id] = v;
        }
        const prev = p.onePerUser ? await this.prisma.panelSubmission.findFirst({ where: { panelId: id, discordId: d.discordId }, orderBy: { createdAt: 'desc' } }) : null;
        const sub = prev
            ? await this.prisma.panelSubmission.update({ where: { id: prev.id }, data: { values, userName: d.userName, guildId: d.guildId } })
            : await this.prisma.panelSubmission.create({ data: { panelId: id, guildId: d.guildId, discordId: d.discordId, userName: d.userName, values } });
        return {
            submissionId: sub.id, channelId: p.targetChannelId ?? p.channelId, previous: prev?.channelId && prev.messageId ? { channelId: prev.channelId, messageId: prev.messageId } : null,
            message: (0, shared_1.formPanelResult)(p, values, { id: d.discordId, name: d.userName, avatar: d.avatar }), asUser: p.asUser, confirmText: p.confirmText, grantRoleIds: p.grantRoleIds,
            modal: { title: p.modalTitle, fields: p.fields },
        };
    }
    async botSubmissionPosted(id, channelId, messageId) {
        await this.prisma.panelSubmission.updateMany({ where: { id }, data: { channelId, messageId } });
    }
};
exports.PanelsService = PanelsService;
exports.PanelsService = PanelsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, discord_service_1.DiscordService, discord_live_service_1.DiscordLiveService])
], PanelsService);
//# sourceMappingURL=panels.service.js.map