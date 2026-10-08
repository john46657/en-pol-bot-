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
exports.ServiceNumbersService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const shared_1 = require("@enrp/shared");
const permission_service_1 = require("../authz/permission.service");
const errors_1 = require("../common/errors");
const hire_events_1 = require("../common/hire-events");
const hr_core_service_1 = require("./hr-core.service");
const hr_people_service_1 = require("./hr-people.service");
const SETTINGS_KEY = 'dienstnummer.settings';
const isUnique = (e) => e instanceof client_1.Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
/**
 * Dienstnummern: Nummernkreise, atomare Vergabe (Unique-Constraints + Wiederholung – nie doppelt),
 * manuelle Vergabe/Änderung/Freigabe/Sperre, Historie und die Automatik nach angenommener Bewerbung.
 */
let ServiceNumbersService = class ServiceNumbersService {
    core;
    people;
    perms;
    constructor(core, people, perms) {
        this.core = core;
        this.people = people;
        this.perms = perms;
    }
    get prisma() { return this.core.prisma; }
    onModuleInit() { hire_events_1.hireEvents.handler = (actor, a) => this.onApplicationAccepted(actor, a); }
    // ---------------- Einstellungen & Nummernkreise ----------------
    async settings() {
        const p = shared_1.dnSettingsSchema.safeParse((await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } }))?.value ?? {});
        return p.success ? p.data : shared_1.dnSettingsSchema.parse({});
    }
    async saveSettings(actor, s) {
        const before = await this.settings();
        const v = shared_1.dnSettingsSchema.parse(s);
        await this.prisma.systemSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: v }, update: { value: v } });
        await this.core.audit.record(actor, { action: 'dienstnummer.settings', module: 'dienstnummer', entityType: 'SystemSetting', entityId: SETTINGS_KEY, before, after: v });
        const autoBefore = before.mappings.some((m) => m.rangeId), autoAfter = v.mappings.some((m) => m.rangeId);
        if (autoBefore !== autoAfter)
            await this.core.audit.record(actor, { action: autoAfter ? 'dienstnummer.auto.enabled' : 'dienstnummer.auto.disabled', module: 'dienstnummer' });
        return v;
    }
    async ranges() {
        const list = await this.prisma.serviceNumberRange.findMany({ orderBy: [{ position: 'asc' }, { start: 'asc' }] });
        const counts = await this.prisma.serviceNumber.groupBy({ by: ['rangeId', 'status'], _count: { _all: true } });
        return list.map((r) => {
            const c = (s) => counts.find((x) => x.rangeId === r.id && x.status === s)?._count._all ?? 0;
            const used = counts.filter((x) => x.rangeId === r.id && x.status !== 'FREE').reduce((n, x) => n + x._count._all, 0);
            return { ...r, total: r.end - r.start + 1, active: c('ACTIVE'), reserved: c('RESERVED'), blocked: c('BLOCKED'), former: c('FORMER'), free: r.end - r.start + 1 - used, first: (0, shared_1.formatServiceNumber)(r, r.start), last: (0, shared_1.formatServiceNumber)(r, r.end), isActive: r.active };
        });
    }
    async saveRange(actor, d, id) {
        const before = id ? await this.prisma.serviceNumberRange.findUnique({ where: { id } }) : null;
        if (id && !before)
            throw new errors_1.AppError('NOT_FOUND', 'Nummernkreis nicht gefunden.');
        // Überschneidung mit anderen Kreisen gleicher Schreibweise verhindern
        const others = await this.prisma.serviceNumberRange.findMany({ where: { prefix: d.prefix, suffix: d.suffix, ...(id ? { id: { not: id } } : {}) } });
        const clash = others.find((o) => d.start <= o.end && o.start <= d.end);
        if (clash)
            throw new errors_1.AppError('CONFLICT', `Überschneidet sich mit „${clash.name}“ (${(0, shared_1.formatServiceNumber)(clash, clash.start)}–${(0, shared_1.formatServiceNumber)(clash, clash.end)}).`);
        if (before) {
            const outside = await this.prisma.serviceNumber.count({ where: { rangeId: id, status: { in: ['ACTIVE', 'RESERVED'] }, OR: [{ value: { lt: d.start } }, { value: { gt: d.end } }] } });
            if (outside)
                throw new errors_1.AppError('CONFLICT', `${outside} vergebene Nummer(n) lägen außerhalb des neuen Bereichs.`);
            if ((before.prefix !== d.prefix || before.suffix !== d.suffix || before.padLength !== d.padLength) && (await this.prisma.serviceNumber.count({ where: { rangeId: id } })))
                throw new errors_1.AppError('CONFLICT', 'Präfix/Suffix/Länge lassen sich nicht mehr ändern, sobald Nummern vergeben wurden.');
        }
        const r = id ? await this.prisma.serviceNumberRange.update({ where: { id }, data: d }) : await this.prisma.serviceNumberRange.create({ data: { ...d, position: ((await this.prisma.serviceNumberRange.aggregate({ _max: { position: true } }))._max.position ?? 0) + 1 } });
        await this.core.audit.record(actor, { action: id ? 'dienstnummer.range.update' : 'dienstnummer.range.create', module: 'dienstnummer', entityType: 'ServiceNumberRange', entityId: r.id, before, after: r });
        return r;
    }
    async deleteRange(actor, id) {
        if (await this.prisma.serviceNumber.count({ where: { rangeId: id, status: { not: 'FREE' } } }))
            throw new errors_1.AppError('CONFLICT', 'Im Nummernkreis gibt es vergebene, gesperrte oder ehemalige Nummern – stattdessen deaktivieren.');
        await this.prisma.$transaction([this.prisma.serviceNumber.deleteMany({ where: { rangeId: id } }), this.prisma.serviceNumberRange.delete({ where: { id } })]);
        await this.core.audit.record(actor, { action: 'dienstnummer.range.delete', module: 'dienstnummer', entityType: 'ServiceNumberRange', entityId: id });
    }
    // ---------------- Übersicht ----------------
    /** Nummern mit Status/Person. „Frei“ enthält auch nie benutzte Nummern (bis `limit`). */
    async list(f) {
        const limit = Math.min(f.limit ?? 300, 1000);
        const rows = await this.prisma.serviceNumber.findMany({ where: { ...(f.rangeId ? { rangeId: f.rangeId } : {}), ...(f.status ? { status: f.status } : {}) }, include: { range: { select: { name: true, department: true } } }, orderBy: [{ rangeId: 'asc' }, { value: 'asc' }], take: 5000 });
        const userIds = [...new Set(rows.map((r) => r.userId).filter((x) => !!x))];
        const [users, links, people] = await Promise.all([
            this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, robloxUsername: true } }),
            this.prisma.discordLink.findMany({ where: { userId: { in: userIds } } }),
            this.prisma.personnel.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true, rank: true, team: true } }),
        ]);
        const u = new Map(users.map((x) => [x.id, x])), l = new Map(links.map((x) => [x.userId, x.discordId])), p = new Map(people.map((x) => [x.userId, x]));
        let out = rows.map((r) => ({ id: r.id, display: r.display, value: r.value, status: r.status, rangeId: r.rangeId, range: r.range.name, note: r.note, assignedAt: r.assignedAt, reservedAt: r.reservedAt, userId: r.userId,
            name: r.userId ? u.get(r.userId)?.displayName ?? null : null, roblox: r.userId ? u.get(r.userId)?.robloxUsername ?? null : null, discordId: r.userId ? l.get(r.userId) ?? null : null,
            personnelId: r.userId ? p.get(r.userId)?.id ?? null : null, rank: r.userId ? p.get(r.userId)?.rank ?? null : null, department: r.userId ? p.get(r.userId)?.team ?? r.range.department : r.range.department }));
        if (!f.status || f.status === 'FREE') {
            // nie benutzte Nummern als „frei“ ergänzen
            const ranges = await this.prisma.serviceNumberRange.findMany({ where: f.rangeId ? { id: f.rangeId } : { active: true } });
            for (const r of ranges) {
                const used = new Set(rows.filter((x) => x.rangeId === r.id).map((x) => x.value));
                let added = 0;
                for (let v = r.start; v <= r.end && added < limit; v++)
                    if (!used.has(v)) {
                        out.push({ id: `free:${r.id}:${v}`, display: (0, shared_1.formatServiceNumber)(r, v), value: v, status: 'FREE', rangeId: r.id, range: r.name, note: null, assignedAt: null, reservedAt: null, userId: null, name: null, roblox: null, discordId: null, personnelId: null, rank: null, department: r.department });
                        added++;
                    }
            }
        }
        const t = f.q?.trim().toLowerCase();
        if (t)
            out = out.filter((r) => [r.display, r.name, r.roblox, r.discordId, r.rank, r.department].some((v) => v && String(v).toLowerCase().includes(t)));
        if (f.department)
            out = out.filter((r) => r.department === f.department);
        if (f.rank)
            out = out.filter((r) => r.rank === f.rank);
        return out.sort((a, b) => a.range.localeCompare(b.range) || a.value - b.value).slice(0, limit);
    }
    async history(f) {
        const where = f.display ? { OR: [{ display: f.display }, { oldDisplay: f.display }] } : f.personnelId ? { personnelId: f.personnelId } : f.userId ? { userId: f.userId } : {};
        const ev = await this.prisma.serviceNumberEvent.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
        const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(ev.flatMap((e) => [e.userId, e.actorId, e.approverId]).filter((x) => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
        return ev.map((e) => ({ ...e, name: e.userId ? names.get(e.userId) ?? '—' : null, actor: e.actorId ? names.get(e.actorId) ?? '—' : 'System', approver: e.approverId ? names.get(e.approverId) ?? '—' : null }));
    }
    // ---------------- Vergabe (atomar) ----------------
    /** Nummer zu einer Schreibweise finden (Kreis + Wert). */
    async parse(display) {
        const ranges = await this.prisma.serviceNumberRange.findMany();
        for (const r of ranges) {
            if (!display.startsWith(r.prefix) || !display.endsWith(r.suffix))
                continue;
            const mid = display.slice(r.prefix.length, display.length - r.suffix.length || undefined);
            if (!/^\d+$/.test(mid))
                continue;
            const v = Number(mid);
            if (v >= r.start && v <= r.end && (0, shared_1.formatServiceNumber)(r, v) === display)
                return { range: r, value: v };
        }
        return null;
    }
    /** Nächste freie Nummer im Kreis ermitteln (ohne zu sperren – gesperrt wird über die Unique-Constraints beim Schreiben). */
    async candidate(tx, r) {
        if (r.reuse && r.order === 'LOWEST_FREE') {
            const free = await tx.serviceNumber.findFirst({ where: { rangeId: r.id, status: 'FREE' }, orderBy: { value: 'asc' } });
            const values = (await tx.serviceNumber.findMany({ where: { rangeId: r.id }, select: { value: true }, orderBy: { value: 'asc' } })).map((x) => x.value);
            let gap = null, expect = r.start;
            for (const v of values) {
                if (v > expect) {
                    gap = expect;
                    break;
                }
                if (v >= expect)
                    expect = v + 1;
            }
            if (gap === null && expect <= r.end)
                gap = expect;
            if (free && (gap === null || free.value < gap))
                return { value: free.value, existingId: free.id };
            return gap !== null && gap <= r.end ? { value: gap, existingId: null } : null;
        }
        const max = (await tx.serviceNumber.aggregate({ where: { rangeId: r.id }, _max: { value: true } }))._max.value;
        const next = max === null ? r.start : max + 1;
        if (next <= r.end)
            return { value: next, existingId: null };
        if (!r.reuse)
            return null;
        const free = await tx.serviceNumber.findFirst({ where: { rangeId: r.id, status: 'FREE' }, orderBy: { value: 'asc' } });
        return free ? { value: free.value, existingId: free.id } : null;
    }
    /**
     * Nummer atomar vergeben: reservieren → zuweisen → Personalakte → Historie, alles in einer Transaktion.
     * Kollidieren zwei Vergaben, schlägt die zweite am Unique-Index fehl und wird mit der nächsten Nummer wiederholt.
     */
    async allocate(actor, o) {
        for (let attempt = 0; attempt < 12; attempt++) {
            try {
                return await this.prisma.$transaction(async (tx) => {
                    const active = await tx.serviceNumber.findFirst({ where: { userId: o.userId, status: { in: ['ACTIVE', 'RESERVED'] } } });
                    if (active && !o.replaceOld)
                        throw new errors_1.AppError('CONFLICT', `Diese Person hat schon die Dienstnummer ${active.display}.`);
                    let range, value, existingId;
                    if (o.display) {
                        const p = await this.parse(o.display.trim());
                        if (!p)
                            throw new errors_1.AppError('VALIDATION_FAILED', `„${o.display}“ gehört zu keinem Nummernkreis.`);
                        if (!p.range.active)
                            throw new errors_1.AppError('CONFLICT', 'Dieser Nummernkreis ist deaktiviert.');
                        if (o.manual && !p.range.manual)
                            throw new errors_1.AppError('CONFLICT', 'In diesem Nummernkreis ist keine manuelle Vergabe erlaubt.');
                        const row = await tx.serviceNumber.findUnique({ where: { rangeId_value: { rangeId: p.range.id, value: p.value } } });
                        if (row && row.status !== 'FREE')
                            throw new errors_1.AppError('CONFLICT', `Die Nummer ${row.display} ist ${{ ACTIVE: 'schon vergeben', RESERVED: 'reserviert', BLOCKED: 'gesperrt', FORMER: 'ehemalig (nicht freigegeben)' }[row.status] ?? 'nicht frei'}.`);
                        range = p.range;
                        value = p.value;
                        existingId = row?.id ?? null;
                    }
                    else {
                        const r = await tx.serviceNumberRange.findUnique({ where: { id: o.rangeId } });
                        if (!r?.active)
                            throw new errors_1.AppError('NOT_FOUND', 'Nummernkreis nicht gefunden oder deaktiviert.');
                        const c = await this.candidate(tx, r);
                        if (!c)
                            throw new errors_1.AppError('CONFLICT', 'Keine freie Dienstnummer verfügbar.');
                        range = r;
                        value = c.value;
                        existingId = c.existingId;
                    }
                    const display = (0, shared_1.formatServiceNumber)(range, value);
                    const now = new Date();
                    // 1) reservieren (bedingt: nur wenn noch frei bzw. neu – sonst Unique-Fehler → Wiederholung)
                    const reserved = existingId
                        ? await tx.serviceNumber.updateMany({ where: { id: existingId, status: 'FREE' }, data: { status: 'RESERVED', userId: o.userId, reservedAt: now } })
                        : await tx.serviceNumber.create({ data: { rangeId: range.id, value, display, status: 'RESERVED', userId: o.userId, reservedAt: now } }).then(() => ({ count: 1 }));
                    if (!reserved.count)
                        throw new client_1.Prisma.PrismaClientKnownRequestError('race', { code: 'P2002', clientVersion: 'retry' });
                    // 2) alte Nummer abgeben (Änderung)
                    let old = null;
                    if (active && o.replaceOld) {
                        const r = await tx.serviceNumberRange.findUniqueOrThrow({ where: { id: active.rangeId } });
                        await tx.serviceNumber.update({ where: { id: active.id }, data: { status: r.releaseAs, personnelId: null, ...(r.releaseAs === 'FREE' ? { userId: null, assignedAt: null, reservedAt: null } : {}) } });
                        old = active.display;
                    }
                    // 3) zuweisen + Personalakte
                    const row = await tx.serviceNumber.update({ where: { display }, data: { status: 'ACTIVE', personnelId: o.personnelId, assignedAt: now } });
                    if (o.personnelId) {
                        await tx.personnel.updateMany({ where: { serviceNumber: display, id: { not: o.personnelId } }, data: { serviceNumber: null } });
                        await tx.personnel.update({ where: { id: o.personnelId }, data: { serviceNumber: display } });
                        await tx.personnelRecord.create({ data: { personnelId: o.personnelId, type: 'SERVICE_NUMBER', summary: old ? `Dienstnummer ${old} → ${display}` : `Dienstnummer ${display} vergeben`, details: o.reason ?? null, data: { display, old, manual: o.manual }, createdById: actor.userId ?? o.userId } });
                    }
                    await tx.serviceNumberEvent.create({ data: { display, oldDisplay: old, userId: o.userId, personnelId: o.personnelId, action: old ? 'CHANGED' : o.manual ? 'ASSIGNED_MANUAL' : 'ASSIGNED_AUTO', reason: o.reason ?? null, actorId: actor.userId, approverId: o.approverId ?? null } });
                    await this.core.audit.record(actor, { action: old ? 'dienstnummer.change' : o.manual ? 'dienstnummer.assign.manual' : 'dienstnummer.assign.auto', module: 'dienstnummer', entityType: 'ServiceNumber', entityId: row.id, before: old ? { display: old } : undefined, after: { display, userId: o.userId }, reason: o.reason }, tx);
                    return { display, old, range };
                }, { isolationLevel: client_1.Prisma.TransactionIsolationLevel.ReadCommitted });
            }
            catch (e) {
                if (isUnique(e))
                    continue; // jemand war schneller – nächste Nummer
                throw e;
            }
        }
        throw new errors_1.AppError('CONFLICT', 'Die Dienstnummer konnte gerade nicht vergeben werden (viele gleichzeitige Vergaben). Bitte erneut versuchen.');
    }
    /** Manuelle Vergabe (dienstnummer.assign) an eine Personalakte. */
    async assignManual(actor, d) {
        const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
        if (!d.display && !d.rangeId)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Nummer oder Nummernkreis angeben.');
        const r = await this.allocate(actor, { userId: p.userId, personnelId: p.id, display: d.display, rangeId: d.rangeId, reason: d.reason, manual: true });
        await this.prisma.hireQueue.updateMany({ where: { userId: p.userId, status: 'PENDING' }, data: { status: 'DONE' } });
        await this.afterAssign(actor, p.userId, r.display, { applicationName: null });
        return r;
    }
    /** Nummer ändern (dienstnummer.edit); die alte wird je nach Kreis frei, ehemalig oder gesperrt. */
    async change(actor, d) {
        const s = await this.settings();
        if (s.changeNeedsApprover && (!d.approverId || d.approverId === actor.userId))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Für den Wechsel ist ein Genehmiger (andere Person) nötig.');
        if (d.approverId && !(await this.perms.has(d.approverId, 'dienstnummer.edit')))
            throw new errors_1.AppError('VALIDATION_FAILED', 'Der Genehmiger braucht das Recht dienstnummer.edit.');
        const p = await this.prisma.personnel.findUnique({ where: { id: d.personnelId } });
        if (!p)
            throw new errors_1.AppError('NOT_FOUND', 'Personalakte nicht gefunden.');
        const r = await this.allocate(actor, { userId: p.userId, personnelId: p.id, display: d.display, rangeId: d.rangeId, reason: d.reason, manual: true, approverId: d.approverId ?? null, replaceOld: true });
        await this.afterAssign(actor, p.userId, r.display, { applicationName: null, changed: true });
        return r;
    }
    /** Nummer freigeben / als ehemalig markieren / sperren / entsperren / reservieren. */
    async setStatus(actor, display, to, reason, userId) {
        const p = await this.parse(display.trim());
        if (!p)
            throw new errors_1.AppError('VALIDATION_FAILED', 'Unbekannte Dienstnummer.');
        const row = await this.prisma.serviceNumber.findUnique({ where: { rangeId_value: { rangeId: p.range.id, value: p.value } } });
        await this.prisma.$transaction(async (tx) => {
            const status = to === 'UNBLOCK' ? 'FREE' : to;
            if (to === 'UNBLOCK' && row?.status !== 'BLOCKED')
                throw new errors_1.AppError('CONFLICT', 'Die Nummer ist nicht gesperrt.');
            if (to === 'RESERVED' && row && row.status !== 'FREE')
                throw new errors_1.AppError('CONFLICT', 'Nur freie Nummern lassen sich reservieren.');
            const keepUser = status === 'FORMER' || (status === 'BLOCKED' && row?.userId) || (status === 'RESERVED' && userId);
            const data = { status, ...(keepUser ? { userId: status === 'RESERVED' ? userId ?? null : row?.userId ?? null } : { userId: null }), personnelId: null, ...(status === 'RESERVED' ? { reservedAt: new Date() } : {}), note: reason ?? row?.note ?? null };
            if (row) {
                const upd = await tx.serviceNumber.updateMany({ where: { id: row.id, status: row.status }, data });
                if (!upd.count)
                    throw new errors_1.AppError('CONFLICT', 'Die Nummer wurde inzwischen geändert. Bitte neu laden.');
            }
            else
                await tx.serviceNumber.create({ data: { rangeId: p.range.id, value: p.value, display: (0, shared_1.formatServiceNumber)(p.range, p.value), ...data } });
            if (row?.personnelId && row.status === 'ACTIVE')
                await tx.personnel.updateMany({ where: { id: row.personnelId, serviceNumber: row.display }, data: { serviceNumber: null } });
            await tx.serviceNumberEvent.create({ data: { display: (0, shared_1.formatServiceNumber)(p.range, p.value), userId: row?.userId ?? userId ?? null, personnelId: row?.personnelId ?? null, action: { FREE: 'RELEASED', FORMER: 'FORMER', BLOCKED: 'BLOCKED', UNBLOCK: 'UNBLOCKED', RESERVED: 'RESERVED' }[to], reason: reason ?? null, actorId: actor.userId } });
            await this.core.audit.record(actor, { action: `dienstnummer.${to.toLowerCase()}`, module: 'dienstnummer', entityType: 'ServiceNumber', entityId: row?.id, before: row ? { status: row.status, userId: row.userId } : undefined, after: { display, status }, reason }, tx);
        });
        return { display, status: to === 'UNBLOCK' ? 'FREE' : to };
    }
    /** Discord nach Vergabe: Nickname, DM (je nach Einstellung). */
    async afterAssign(actor, userId, display, o) {
        const s = await this.settings();
        const p = await this.prisma.personnel.findUnique({ where: { userId }, include: { user: { select: { displayName: true } } } });
        const discordId = await this.core.discordIdOf(userId);
        const vars = { user: discordId ? `<@${discordId}>` : p?.user.displayName ?? '', name: p?.user.displayName ?? '', dienstnummer: display, rang: p?.rank ?? '—', abteilung: p?.team ?? '—', bewerbung: o.applicationName ?? '—', datum: new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }) };
        if (s.nickname.enabled && discordId) {
            const nick = (0, shared_1.fillTemplate)(s.nickname.format, vars).slice(0, 32);
            await this.core.setNickname(userId, nick);
            await this.core.audit.record(actor, { action: 'dienstnummer.nickname', module: 'dienstnummer', entityType: 'User', entityId: userId, after: { nickname: nick } });
        }
        if (s.dm.enabled && discordId && !o.changed) {
            await this.core.dm(userId, { embeds: [{ title: (0, shared_1.fillTemplate)(s.dm.title, vars).slice(0, 256), description: (0, shared_1.fillTemplate)(s.dm.template, vars).slice(0, 4000), color: parseInt(s.dm.color.slice(1), 16), timestamp: new Date().toISOString() }] });
            await this.core.audit.record(actor, { action: 'dienstnummer.dm', module: 'dienstnummer', entityType: 'User', entityId: userId, after: { display } });
        }
    }
    // ---------------- Bewerbung angenommen ----------------
    /**
     * Bewerbung angenommen → Benutzer/Personalakte anlegen → Rang/Abteilung → (je nach Zeitpunkt) Dienstnummer atomar vergeben
     * → Discord-Rollen, Nickname, DM → Audit. Fehlt eine Nummer, bleibt die Einstellung als „⚠️ Dienstnummer ausstehend“ stehen.
     */
    /** Zuordnung für eine Bewerbungsart. Polizei-Bewerbungen bekommen immer eine Personalakte, auch ohne eigene Zuordnung. */
    mappingFor(s, kind) {
        return s.mappings.find((x) => x.kind.toLowerCase() === kind.toLowerCase())
            ?? (kind === 'police' ? { kind: 'police', rangeId: null, department: null, rankId: null, createProfile: true, roleIds: [] } : undefined);
    }
    /**
     * Bereits angenommene Polizei-Bewerbungen ohne Personalakte nachträglich übernehmen (z. B. von vor der Automatik).
     * Legt nur die Akte an (Rang/Abteilung laut Zuordnung) – keine Dienstnummer, Rollen oder DMs.
     */
    async profilesFromApplications(actor) {
        const m = this.mappingFor(await this.settings(), 'police');
        if (!m?.createProfile)
            return { created: 0, skipped: 0 };
        const rank = m.rankId ? await this.prisma.hrRank.findUnique({ where: { id: m.rankId } }) : null;
        const dept = m.department ? (await this.core.config()).departments.find((d) => d.name === m.department) : null;
        const apps = await this.prisma.application.findMany({ where: { status: 'ACCEPTED' }, orderBy: { createdAt: 'asc' }, select: { id: true, number: true, discordId: true, discordName: true, robloxUsername: true } });
        let created = 0, skipped = 0;
        for (const a of apps) {
            if (!a.discordId) {
                skipped++;
                continue;
            }
            const made = await this.prisma.$transaction(async (tx) => {
                const u = await this.people.userForDiscord(tx, a.discordId, a.discordName || a.robloxUsername);
                const r = await this.core.ensurePersonnel(u.id, { rank: rank?.name ?? null, team: dept?.name ?? m.department ?? null }, tx);
                if (r.created)
                    await this.core.audit.record(actor, { action: 'personnel.create.application', module: 'personnel', entityType: 'Personnel', entityId: r.personnel.id, after: { application: a.number, rank: rank?.name, department: dept?.name, backfill: true } }, tx);
                return r.created;
            });
            if (made)
                created++;
        }
        return { created, skipped };
    }
    async onApplicationAccepted(actor, a) {
        const s = await this.settings();
        const m = this.mappingFor(s, a.kind);
        if (!m)
            return;
        if (!a.discordId) {
            await this.core.audit.record(actor, { action: 'dienstnummer.pending', module: 'dienstnummer', entityType: 'Application', entityId: a.applicationId, reason: 'Keine Discord-ID – Person bitte manuell anlegen' });
            return;
        }
        const rank = m.rankId ? await this.prisma.hrRank.findUnique({ where: { id: m.rankId } }) : null;
        const cfg = await this.core.config();
        const dept = m.department ? cfg.departments.find((d) => d.name === m.department) : null;
        const { user, personnel } = await this.prisma.$transaction(async (tx) => {
            const u = await this.people.userForDiscord(tx, a.discordId, a.name);
            if (a.robloxUsername && !u.robloxUsername)
                await tx.user.update({ where: { id: u.id }, data: { robloxUsername: a.robloxUsername, ...(a.robloxUserId && !(await tx.user.findUnique({ where: { robloxUserId: a.robloxUserId } })) ? { robloxUserId: a.robloxUserId } : {}) } });
            if (!m.createProfile)
                return { user: u, personnel: await tx.personnel.findUnique({ where: { userId: u.id } }) };
            const r = await this.core.ensurePersonnel(u.id, { rank: rank?.name ?? null, team: dept?.name ?? m.department ?? null }, tx);
            if (r.created)
                await this.core.audit.record(actor, { action: 'personnel.create.application', module: 'personnel', entityType: 'Personnel', entityId: r.personnel.id, after: { application: a.number, rank: rank?.name, department: dept?.name } }, tx);
            return { user: u, personnel: r.personnel };
        });
        // Rollen: Rang, Abteilung, zusätzliche
        const add = [...(s.rankRoles && rank ? rank.discordRoleIds : []), ...(s.departmentRoles && dept ? dept.discordRoleIds : []), ...m.roleIds];
        if (add.length && (await this.core.syncDiscordRoles(user.id, add, [], `Bewerbung ${a.number} angenommen`)))
            await this.core.audit.record(actor, { action: 'personnel.discord_roles', module: 'dienstnummer', entityType: 'User', entityId: user.id, after: { add, application: a.number } });
        if (!m.rangeId)
            return;
        const pending = async (reason) => {
            await this.prisma.hireQueue.upsert({ where: { applicationId: a.applicationId }, create: { applicationId: a.applicationId, kind: a.kind, userId: user.id, discordId: a.discordId, reason }, update: { reason, status: 'PENDING' } });
            await this.prisma.serviceNumberEvent.create({ data: { display: '—', userId: user.id, personnelId: personnel?.id ?? null, action: 'PENDING', reason, actorId: actor.userId } });
            await this.core.audit.record(actor, { action: 'dienstnummer.pending', module: 'dienstnummer', entityType: 'Application', entityId: a.applicationId, after: { userId: user.id }, reason });
        };
        if (s.timing !== 'ACCEPT')
            return pending(s.timing === 'MANUAL' ? 'Dienstnummer muss bestätigt werden' : 'Einstellung noch nicht abgeschlossen');
        if (actor.userId && !(await this.perms.has(actor.userId, 'applications.auto_assign_dienstnummer')))
            return pending('Entscheider hat kein Recht zur automatischen Vergabe');
        if (!personnel)
            return pending('Keine Personalakte');
        try {
            const r = await this.allocate(actor, { userId: user.id, personnelId: personnel.id, rangeId: m.rangeId, reason: `Bewerbung ${a.number}`, manual: false });
            await this.afterAssign(actor, user.id, r.display, { applicationName: a.kind === 'police' ? 'Polizei' : a.kind });
        }
        catch (e) {
            await pending(e instanceof errors_1.AppError ? e.message : 'Vergabe fehlgeschlagen');
        }
    }
    /** Ausstehende Einstellungen (ohne Nummer). */
    async pending() {
        const q = await this.prisma.hireQueue.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } });
        const users = new Map((await this.prisma.user.findMany({ where: { id: { in: q.map((x) => x.userId) } }, select: { id: true, displayName: true, personnel: { select: { id: true } } } })).map((u) => [u.id, u]));
        return q.map((x) => ({ ...x, name: users.get(x.userId)?.displayName ?? '—', personnelId: users.get(x.userId)?.personnel?.id ?? null }));
    }
    /** Ausstehende Einstellung bestätigen/abschließen: Nummer aus dem Kreis der Zuordnung vergeben. */
    async confirmPending(actor, id, display) {
        const h = await this.prisma.hireQueue.findUnique({ where: { id } });
        if (!h || h.status !== 'PENDING')
            throw new errors_1.AppError('NOT_FOUND', 'Eintrag nicht gefunden.');
        const s = await this.settings();
        const m = s.mappings.find((x) => x.kind.toLowerCase() === h.kind.toLowerCase());
        const p = (await this.prisma.personnel.findUnique({ where: { userId: h.userId } })) ?? (await this.prisma.$transaction(async (tx) => (await this.core.ensurePersonnel(h.userId, { team: m?.department ?? null }, tx)).personnel));
        const r = await this.allocate(actor, { userId: h.userId, personnelId: p.id, display, rangeId: display ? undefined : m?.rangeId ?? undefined, reason: 'Einstellung bestätigt', manual: true });
        await this.prisma.hireQueue.update({ where: { id }, data: { status: 'DONE' } });
        await this.afterAssign(actor, h.userId, r.display, { applicationName: h.kind === 'police' ? 'Polizei' : h.kind });
        return r;
    }
};
exports.ServiceNumbersService = ServiceNumbersService;
exports.ServiceNumbersService = ServiceNumbersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [hr_core_service_1.HrCoreService, hr_people_service_1.HrPeopleService, permission_service_1.PermissionService])
], ServiceNumbersService);
//# sourceMappingURL=service-numbers.service.js.map