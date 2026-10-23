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
var DutyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DutyService = exports.newShiftId = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const realtime_service_1 = require("../realtime/realtime.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const errors_1 = require("../common/errors");
const discord_service_1 = require("../discord/discord.service");
const shifts_1 = require("./shifts");
const guild_context_1 = require("../common/guild-context");
/** Schicht-ID wie bei Trident: Discord-Snowflake aus dem Beginn der Schicht (Zeitstempel + Zufall), als Text. */
const newShiftId = (at) => ((BigInt(at.getTime() - 1_420_070_400_000) << BigInt(22)) | BigInt((0, node_crypto_1.randomInt)(1 << 22))).toString();
exports.newShiftId = newShiftId;
/** Gehört die Sitzung zur selben Schicht wie die vorige? Gleiche Schicht-ID oder nahtloser Statuswechsel (ältere Sitzungen). */
const sameShift = (prev, s) => !!prev && prev.userId === s.userId && ((!!prev.shiftId && prev.shiftId === s.shiftId) || prev.endedAt?.getTime() === s.startedAt.getTime());
/** Dienststatus wird ausschließlich explizit gesetzt – Online-Status ist niemals Dienststatus. */
let DutyService = DutyService_1 = class DutyService {
    prisma;
    audit;
    rt;
    discord;
    shifts;
    constructor(prisma, audit, rt, discord, shifts) {
        this.prisma = prisma;
        this.audit = audit;
        this.rt = rt;
        this.discord = discord;
        this.shifts = shifts;
    }
    async setStatus(actor, status, d, targetUserId) {
        const userId = targetUserId ?? actor.userId;
        let previous = null;
        let summary = null;
        const cfg = await this.shifts.config();
        let type = null;
        return this.prisma.$transaction(async (tx) => {
            const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
            type = status === 'OFF_DUTY' ? (cfg.types.find((t) => t.id === open?.shiftType) ?? null) : await this.shifts.resolve(cfg, d.shiftType, open?.shiftType);
            const sameType = !type || status === 'OFF_DUTY' || type.id === open?.shiftType;
            if ((open?.status ?? 'OFF_DUTY') === status && !d.unitId && sameType)
                throw new errors_1.AppError('CONFLICT', `Dieser Status ist bereits gesetzt (${status}).`);
            // Erlaubte Rollen der Schichtart (wie Trident „Permitted Roles“): beim Start bzw. Wechsel der Art; die Leitung darf für andere setzen
            if (type && status !== 'OFF_DUTY' && type.id !== open?.shiftType && !targetUserId && type.permittedRoleIds.length) {
                const roles = d.discordRoleIds ?? (await tx.serverMembership.findMany({ where: { userId, status: 'MEMBER' }, select: { discordRoleIds: true } })).flatMap((m) => m.discordRoleIds);
                // ohne Auswahl: statt der Standard-Art die erste, die erlaubt ist
                if (!d.shiftType && !shifts_1.ShiftsService.permitted(type, roles))
                    type = cfg.types.find((t) => shifts_1.ShiftsService.permitted(t, roles)) ?? type;
                if (!shifts_1.ShiftsService.permitted(type, roles))
                    throw new errors_1.AppError('PERMISSION_DENIED', `Für die Schichtart „${type.name}“ fehlt dir die passende Discord-Rolle.`);
            }
            if (targetUserId && !(await tx.user.findUnique({ where: { id: targetUserId, active: true } })))
                throw new errors_1.AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
            const at = new Date(); // gleicher Zeitpunkt für Ende und Beginn → Schicht-Logs erkennen zusammenhängende Sitzungen
            if (open)
                await tx.dutySession.update({ where: { id: open.id }, data: { endedAt: at } });
            previous = open ? { status: open.status, startedAt: open.startedAt, shiftType: open.shiftType } : null;
            if (d.unitId && !(await tx.unit.findUnique({ where: { id: d.unitId } })))
                throw new errors_1.AppError('NOT_FOUND', 'Einheit nicht gefunden.');
            // Schicht-ID: neue Schicht → neue ID; Pause/Schichtwechsel → ID der laufenden Schicht
            let shiftId = open?.shiftId ?? null;
            if (open && !shiftId) {
                // ältere Sitzungen ohne ID: zusammenhängende Sitzungen der laufenden Schicht nachträglich verknüpfen
                const chain = [open.id];
                let start = open.startedAt;
                for (let i = 0; i < 500; i++) {
                    const p = await tx.dutySession.findFirst({ where: { userId, endedAt: start }, select: { id: true, startedAt: true, shiftId: true } });
                    if (!p)
                        break;
                    chain.push(p.id);
                    start = p.startedAt;
                    if (p.shiftId) {
                        shiftId = p.shiftId;
                        break;
                    }
                }
                shiftId ??= (0, exports.newShiftId)(start);
                await tx.dutySession.updateMany({ where: { id: { in: chain } }, data: { shiftId } });
            }
            if (!open && status !== 'OFF_DUTY')
                shiftId = (0, exports.newShiftId)(at);
            let created = null;
            if (status !== 'OFF_DUTY') {
                const pers = await tx.personnel.findFirst({ where: { userId } });
                // servereigene Dienstzeit: Akten-Bereich des Servers (bzw. der gemeinsamen Shift-Log-Gruppe); ohne Server gemeinsamer Bestand
                created = await tx.dutySession.create({ data: { userId, serverId: (0, guild_context_1.recordSpace)() ?? null, status, startedAt: at, lastActivityAt: at, unitId: d.unitId, shiftType: type?.id ?? null, shiftId, callsign: (d.callsign ?? pers?.callsign ?? undefined)?.toUpperCase() } });
            }
            if (shiftId) {
                const parts = await tx.dutySession.findMany({ where: { userId, shiftId }, select: { status: true, startedAt: true, endedAt: true } });
                const sec = (x) => Math.max(0, Math.round(((x.endedAt ?? at).getTime() - x.startedAt.getTime()) / 1000));
                summary = { shiftId, startedAt: new Date(Math.min(...parts.map((x) => x.startedAt.getTime()))),
                    workSeconds: parts.filter((x) => x.status !== 'BREAK').reduce((n, x) => n + sec(x), 0), breakSeconds: parts.filter((x) => x.status === 'BREAK').reduce((n, x) => n + sec(x), 0) };
            }
            await this.audit.record(actor, { action: targetUserId && targetUserId !== actor.userId ? 'duty.status.set_by_supervisor' : 'duty.status', module: 'team', entityType: 'User', entityId: userId, before: { status: open?.status ?? 'OFF_DUTY' }, after: { status } }, tx);
            return created ?? { status: 'OFF_DUTY' };
        }).then(async (r) => {
            this.rt.publish('team', 'duty.changed', { userId, status });
            const before = previous;
            const t = type;
            if ((before?.status ?? 'OFF_DUTY') !== status || (t && status !== 'OFF_DUTY' && t.id !== before?.shiftType))
                await this.notifyDiscord(actor, userId, status, before, cfg, t, summary);
            return r;
        });
    }
    /**
     * Discord-Abgleich: Dienst-Rollen (Im Dienst/Pause/Training/Verwaltung) und Meldung im Dienst-Channel.
     * Wird nur eingereiht, wenn ein Dienst-Channel oder eine Dienst-Rolle eingestellt ist. Fehler stören den Statuswechsel nie.
     */
    async notifyDiscord(actor, userId, status, before, cfg, type, summary) {
        try {
            const ch = await this.discord.channels();
            // Schichten-Modul an: Rollen und Log-Channel der Schicht-Art; sonst die Dienst-Rollen aus den Einstellungen
            const shift = cfg.enabled && cfg.types.length ? { ...shifts_1.ShiftsService.roleChanges(cfg, type, status), channelId: type?.logChannelId ?? null, name: type?.name ?? null } : null;
            const roles = shift ? shift.add.length + shift.remove.length > 0 : !!(ch.dutyRole || ch.breakRole || ch.trainingRole || ch.adminDutyRole);
            if (!ch.duty && !roles && !shift?.channelId)
                return;
            const [user, link] = await Promise.all([
                this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { callsign: true, rank: true } } } }),
                this.prisma.discordLink.findUnique({ where: { userId } }),
            ]);
            const by = actor.userId && actor.userId !== userId ? await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }) : null;
            await this.discord.enqueue('duty', 'duty.changed', {
                discordId: link?.discordId ?? null, name: user?.displayName ?? '—', callsign: user?.personnel[0]?.callsign ?? null, rank: user?.personnel[0]?.rank ?? null,
                status, previous: before?.status ?? 'OFF_DUTY', previousMinutes: before ? Math.round((Date.now() - before.startedAt.getTime()) / 60_000) : null,
                previousSeconds: before ? Math.round((Date.now() - before.startedAt.getTime()) / 1000) : null, setBy: by?.displayName ?? null,
                // Shift-Log wie Trident: Schicht-ID, Beginn der Schicht, Gesamtzeit ohne Pausen, Pausenzeit
                ...(summary ? { shiftId: summary.shiftId, shiftStartedAt: summary.startedAt.toISOString(), totalSeconds: summary.workSeconds, breakSeconds: summary.breakSeconds } : {}),
                ...(shift ? { shiftType: shift.name, roles: { add: shift.add, remove: shift.remove }, ...(shift.channelId ? { channelId: shift.channelId } : {}) } : {}),
            }, { always: roles || !!shift?.channelId });
        }
        catch { /* best effort */ }
    }
    touched = new Map();
    /** Aktivität merken (höchstens einmal pro Minute in die Datenbank). Nur laufende Schichten „Im Dienst“. */
    async touch(userId, force = false) {
        const now = Date.now();
        if (!force && now - (this.touched.get(userId) ?? 0) < 60_000)
            return;
        this.touched.set(userId, now);
        if (this.touched.size > 5000)
            this.touched.clear();
        await this.prisma.dutySession.updateMany({ where: { userId, endedAt: null, status: 'ON_DUTY' }, data: { lastActivityAt: new Date(now) } }).catch(() => undefined);
    }
    /** „Bin noch im Dienst“ / Herzschlag aus dem Dashboard. */
    async active(userId) {
        await this.touch(userId, true);
        const open = await this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } });
        return { onDuty: open?.status === 'ON_DUTY', status: open?.status ?? 'OFF_DUTY' };
    }
    /**
     * Jede Minute: Wer „Im Dienst“ ist und seit `afterMinutes` nichts gemacht hat, bekommt eine Erinnerung (Discord-DM mit Buttons + Glocke im Dashboard).
     * Mit `autoOffMinutes` endet die Schicht automatisch, wenn danach weiter nichts passiert. Pause/Training/Verwaltung sind ausgenommen.
     */
    async remindTick(now = new Date()) {
        const { reminder: r } = await this.shifts.config();
        const out = { reminded: 0, ended: 0 };
        if (!r.enabled)
            return out;
        const sessions = await this.prisma.dutySession.findMany({ where: { endedAt: null, status: 'ON_DUTY' } });
        for (const s of sessions) {
            const last = Math.max(s.startedAt.getTime(), s.lastActivityAt?.getTime() ?? 0);
            const link = await this.prisma.discordLink.findUnique({ where: { userId: s.userId } });
            if (s.remindedAt && s.remindedAt.getTime() >= last) {
                // schon erinnert, seitdem nichts passiert
                if (r.autoOffMinutes > 0 && now.getTime() - s.remindedAt.getTime() >= r.autoOffMinutes * 60_000) {
                    await this.setStatus({ userId: null }, 'OFF_DUTY', {}, s.userId).catch(() => undefined);
                    const minutes = Math.round((now.getTime() - s.startedAt.getTime()) / 60_000);
                    await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Deine Schicht wurde automatisch beendet', body: `Keine Aktivität seit ${Math.round((now.getTime() - last) / 60_000)} Minuten.` } });
                    if (link)
                        await this.discord.enqueue('duty', 'duty.reminder', { kind: 'ended', discordId: link.discordId, idleMinutes: Math.round((now.getTime() - last) / 60_000), shiftMinutes: minutes }, { always: true });
                    out.ended++;
                }
                continue;
            }
            if (now.getTime() - last < r.afterMinutes * 60_000)
                continue;
            await this.prisma.dutySession.update({ where: { id: s.id }, data: { remindedAt: now } });
            const idle = Math.round((now.getTime() - last) / 60_000);
            await this.prisma.notification.create({ data: { userId: s.userId, type: 'DUTY_REMINDER', title: 'Bist du noch im Dienst?', body: `Seit ${idle} Minuten keine Aktivität.${r.autoOffMinutes ? ` Ohne Reaktion endet deine Schicht in ${r.autoOffMinutes} Minuten automatisch.` : ''}` } });
            if (link)
                await this.discord.enqueue('duty', 'duty.reminder', { kind: 'reminder', discordId: link.discordId, idleMinutes: idle, autoOffMinutes: r.autoOffMinutes }, { always: true });
            this.rt.publish('team', 'duty.reminder', { userId: s.userId });
            out.reminded++;
        }
        return out;
    }
    team() {
        return this.prisma.dutySession.findMany({
            where: { endedAt: null, ...(0, guild_context_1.recordWhere)() },
            include: { user: { select: { id: true, displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { rank: true, callsign: true } } } } },
            orderBy: { startedAt: 'asc' },
        });
    }
    mine(userId) { return this.prisma.dutySession.findFirst({ where: { userId, endedAt: null } }); }
    /**
     * Dienststunden der letzten `days` Tage, pro Benutzer und Status (in Minuten).
     * Sitzungen, die vor dem Zeitraum begonnen haben oder noch laufen, zählen nur mit dem Anteil im Zeitraum.
     */
    async hours(days, userId) {
        const now = new Date();
        const since = new Date(now.getTime() - days * 86_400_000);
        const sessions = await this.prisma.dutySession.findMany({
            where: { ...(userId ? { userId } : {}), ...(0, guild_context_1.recordWhere)(), OR: [{ endedAt: null }, { endedAt: { gt: since } }] },
            include: { user: { select: { displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { rank: true, callsign: true } } } } },
        });
        const rows = new Map();
        for (const s of sessions) {
            const from = Math.max(s.startedAt.getTime(), since.getTime());
            const to = (s.endedAt ?? now).getTime();
            if (to <= from)
                continue;
            const r = rows.get(s.userId) ?? { userId: s.userId, name: s.user.displayName, rank: s.user.personnel[0]?.rank ?? null, callsign: s.user.personnel[0]?.callsign ?? null, minutes: 0, byStatus: {}, sessions: 0 };
            const min = (to - from) / 60_000;
            r.minutes += min;
            r.byStatus[s.status] = (r.byStatus[s.status] ?? 0) + min;
            r.sessions++;
            rows.set(s.userId, r);
        }
        const round = (r) => ({ ...r, minutes: Math.round(r.minutes), byStatus: Object.fromEntries(Object.entries(r.byStatus).map(([k, v]) => [k, Math.round(v)])) });
        const users = [...rows.values()].map(round).sort((a, b) => b.minutes - a.minutes);
        return { days, since, users };
    }
    /**
     * Gesamtwerte aller Schichten eines Benutzers (Discord: `/shift manage`, `/shift admin`): Anzahl und Zeit im Dienst ohne Pausen,
     * dazu die letzte Schicht (Status, Zeit, Schichtart, ID).
     */
    async shiftStats(userId) {
        const sessions = await this.prisma.dutySession.findMany({ where: { userId, ...(0, guild_context_1.recordWhere)() }, select: { userId: true, shiftId: true, shiftType: true, startedAt: true, endedAt: true, status: true }, orderBy: { startedAt: 'asc' } });
        const now = Date.now();
        let count = 0, ms = 0, lastMs = 0;
        let prev;
        for (const s of sessions) {
            if (!sameShift(prev, s)) {
                count++;
                lastMs = 0;
            }
            const work = s.status !== 'BREAK' ? Math.max(0, (s.endedAt?.getTime() ?? now) - s.startedAt.getTime()) : 0;
            ms += work;
            lastMs += work;
            prev = s;
        }
        const cfg = prev ? await this.shifts.config() : null;
        const last = prev ? { shiftId: prev.shiftId, status: prev.endedAt ? 'ENDED' : prev.status, seconds: Math.round(lastMs / 1000), shiftType: cfg.types.find((t) => t.id === prev.shiftType)?.name ?? null } : null;
        return { count, minutes: Math.round(ms / 60_000), seconds: Math.round(ms / 1000), last };
    }
    /** Sitzungen einer Schicht (im Bereich des Servers). */
    async shiftParts(shiftId) {
        if (!/^\d{1,25}$/.test(shiftId))
            throw new errors_1.AppError('NOT_FOUND', 'Schicht nicht gefunden.');
        const parts = await this.prisma.dutySession.findMany({ where: { shiftId, ...(0, guild_context_1.recordWhere)() }, orderBy: { startedAt: 'asc' } });
        if (!parts.length)
            throw new errors_1.AppError('NOT_FOUND', 'Schicht nicht gefunden.');
        return parts;
    }
    static workMs(parts, now = Date.now()) {
        return parts.filter((p) => p.status !== 'BREAK').reduce((n, p) => n + Math.max(0, (p.endedAt?.getTime() ?? now) - p.startedAt.getTime()), 0);
    }
    /**
     * Schichtleitung (`/shift admin` → Modify Shift): Zeit im Dienst einer Schicht ändern. Mehr Zeit → Beginn der Schicht früher;
     * weniger Zeit → Dienst-Sitzungen von hinten kürzen (Ende früher, bei laufender Sitzung Beginn später). Pausen bleiben, wie sie sind.
     */
    async modifyShift(actor, shiftId, action, seconds) {
        const parts = await this.shiftParts(shiftId);
        const now = Date.now();
        const before = DutyService_1.workMs(parts, now);
        let delta = (action === 'add' ? seconds : action === 'remove' ? -seconds : seconds - Math.round(before / 1000)) * 1000;
        if (delta > 0) {
            const first = parts[0];
            if (first.status === 'BREAK')
                throw new errors_1.AppError('CONFLICT', 'Die Schicht beginnt mit einer Pause – Zeit kann nicht hinzugefügt werden.');
            await this.prisma.dutySession.update({ where: { id: first.id }, data: { startedAt: new Date(first.startedAt.getTime() - delta) } });
        }
        else if (delta < 0) {
            let rest = -delta;
            for (const p of [...parts].reverse()) {
                if (rest <= 0)
                    break;
                if (p.status === 'BREAK')
                    continue;
                const end = p.endedAt?.getTime() ?? now;
                const cut = Math.min(rest, Math.max(0, end - p.startedAt.getTime()));
                if (!cut)
                    continue;
                await this.prisma.dutySession.update({ where: { id: p.id }, data: p.endedAt ? { endedAt: new Date(end - cut) } : { startedAt: new Date(p.startedAt.getTime() + cut) } });
                rest -= cut;
            }
            delta = -(-delta - rest);
        }
        const after = Math.max(0, Math.round((before + delta) / 1000));
        await this.audit.record(actor, { action: 'duty.shift.update', module: 'team', entityType: 'DutyShift', entityId: shiftId, before: { userId: parts[0].userId, seconds: Math.round(before / 1000) }, after: { action, seconds: after } });
        this.rt.publish('team', 'duty.changed', { userId: parts[0].userId });
        return { shiftId, userId: parts[0].userId, seconds: after };
    }
    /** Schichtleitung: eine beendete Schicht löschen (laufende erst beenden). */
    async deleteShift(actor, shiftId) {
        const parts = await this.shiftParts(shiftId);
        if (parts.some((p) => !p.endedAt))
            throw new errors_1.AppError('CONFLICT', 'Die Schicht läuft noch – bitte zuerst beenden.');
        await this.prisma.dutySession.deleteMany({ where: { id: { in: parts.map((p) => p.id) } } });
        await this.audit.record(actor, { action: 'duty.shift.delete', module: 'team', entityType: 'DutyShift', entityId: shiftId, before: { userId: parts[0].userId, seconds: Math.round(DutyService_1.workMs(parts) / 1000), startedAt: parts[0].startedAt.toISOString() } });
        this.rt.publish('team', 'duty.changed', { userId: parts[0].userId });
        return { shiftId, deleted: true };
    }
    /** Schichtleitung (Clear User Shifts): alle beendeten Schichten eines Mitglieds löschen, optional nur eine Schichtart. Die laufende bleibt. */
    async clearShifts(actor, userId, shiftType) {
        const open = await this.prisma.dutySession.findFirst({ where: { userId, endedAt: null }, select: { shiftId: true } });
        const where = { userId, endedAt: { not: null }, ...(0, guild_context_1.recordWhere)(), ...(shiftType ? { shiftType } : {}), ...(open?.shiftId ? { NOT: { shiftId: open.shiftId } } : {}) };
        const { count } = await this.prisma.dutySession.deleteMany({ where });
        await this.audit.record(actor, { action: 'duty.shifts.reset', module: 'team', entityType: 'User', entityId: userId, after: { sessions: count, shiftType: shiftType ?? null } });
        this.rt.publish('team', 'duty.changed', { userId });
        return { deleted: count };
    }
    /** Discord-IDs verknüpfter Benutzer (für @Erwähnungen in Discord). */
    async discordIds(userIds) {
        const links = await this.prisma.discordLink.findMany({ where: { userId: { in: [...new Set(userIds)] } }, select: { userId: true, discordId: true } });
        return new Map(links.map((l) => [l.userId, l.discordId]));
    }
    /**
     * Rangliste (Discord: `/shift leaderboard`, wie Trident): Zeit im Dienst ohne Pausen in Sekunden, Anzahl Schichten.
     * `days` = null → alle Zeiten; mit `shiftType` nur Sitzungen dieser Schichtart.
     */
    async leaderboard(days, me, shiftType) {
        const now = Date.now();
        const since = days ? now - days * 86_400_000 : null;
        const sessions = await this.prisma.dutySession.findMany({
            where: { ...(0, guild_context_1.recordWhere)(), ...(shiftType ? { shiftType } : {}), ...(since ? { OR: [{ endedAt: null }, { endedAt: { gt: new Date(since) } }] } : {}) },
            select: { userId: true, shiftId: true, status: true, startedAt: true, endedAt: true, user: { select: { displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { callsign: true } } } } },
            orderBy: [{ userId: 'asc' }, { startedAt: 'asc' }],
        });
        const rows = new Map();
        for (const s of sessions) {
            const r = rows.get(s.userId) ?? { userId: s.userId, name: s.user.displayName, callsign: s.user.personnel[0]?.callsign ?? null, ms: 0, shifts: 0 };
            if (!sameShift(r.prev, s))
                r.shifts++;
            r.prev = s;
            if (s.status !== 'BREAK')
                r.ms += Math.max(0, (s.endedAt?.getTime() ?? now) - Math.max(s.startedAt.getTime(), since ?? 0));
            rows.set(s.userId, r);
        }
        const discord = await this.discordIds([...rows.keys()]);
        const users = [...rows.values()].map((r) => ({ userId: r.userId, name: r.name, callsign: r.callsign, discordId: discord.get(r.userId) ?? null, shifts: r.shifts, seconds: Math.round(r.ms / 1000), minutes: Math.round(r.ms / 60_000) }))
            .filter((u) => u.seconds > 0).sort((a, b) => b.seconds - a.seconds);
        return { days, shiftType: shiftType ?? null, me, users };
    }
    /** Laufende Schichten (Discord: `/shift active`): Beginn der Schicht, Zeit im Dienst ohne Pausen, Status, Schichtart. */
    async activeShifts() {
        const open = await this.prisma.dutySession.findMany({
            where: { endedAt: null, ...(0, guild_context_1.recordWhere)() },
            include: { user: { select: { displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { callsign: true } } } } },
        });
        const ids = open.map((o) => o.shiftId).filter((x) => !!x);
        const parts = ids.length ? await this.prisma.dutySession.findMany({ where: { shiftId: { in: ids } }, select: { shiftId: true, status: true, startedAt: true, endedAt: true } }) : [];
        const [cfg, discord] = await Promise.all([this.shifts.config(), this.discordIds(open.map((o) => o.userId))]);
        const now = Date.now();
        return open.map((o) => {
            const mine = o.shiftId ? parts.filter((p) => p.shiftId === o.shiftId) : [o];
            const startedAt = new Date(Math.min(...mine.map((p) => p.startedAt.getTime())));
            const seconds = Math.round(mine.filter((p) => p.status !== 'BREAK').reduce((n, p) => n + (p.endedAt?.getTime() ?? now) - p.startedAt.getTime(), 0) / 1000);
            return { userId: o.userId, name: o.user.displayName, callsign: o.callsign ?? o.user.personnel[0]?.callsign ?? null, discordId: discord.get(o.userId) ?? null,
                status: o.status, shiftId: o.shiftId, shiftType: cfg.types.find((t) => t.id === o.shiftType)?.name ?? null, startedAt, seconds };
        }).sort((a, b) => b.seconds - a.seconds);
    }
    /**
     * Schicht-Logs: zusammenhängende Dienst-Sitzungen (Im Dienst ↔ Pause ↔ Schichtwechsel) bis „Außer Dienst“ ergeben eine Schicht.
     * Je Schicht: wer, Schichtart, Beginn/Ende, Dauer, Pausen und wer sie gestartet/beendet hat (aus dem Audit-Log).
     */
    async shiftLog(f) {
        // Discord-Mitglied (`/shift admin`) → Benutzer; nicht verknüpft = keine Schichten
        let member;
        if (f.discordId) {
            const link = await this.prisma.discordLink.findUnique({ where: { discordId: f.discordId }, select: { userId: true } });
            const user = link && await this.prisma.user.findUnique({ where: { id: link.userId }, select: { displayName: true } });
            if (!link || !user)
                return { days: f.days, since: new Date(Date.now() - f.days * 86_400_000), member: null, items: [] };
            member = { userId: link.userId, name: user.displayName };
            f = { ...f, userId: link.userId };
        }
        const now = new Date();
        const since = new Date(now.getTime() - f.days * 86_400_000);
        // Sitzungen etwas vor dem Zeitraum mitnehmen, damit Schichten über die Grenze vollständig sind
        const sessions = await this.prisma.dutySession.findMany({
            where: { ...(f.userId ? { userId: f.userId } : {}), ...(0, guild_context_1.recordWhere)(), OR: [{ endedAt: null }, { endedAt: { gt: new Date(since.getTime() - 86_400_000) } }] },
            include: { user: { select: { displayName: true, personnel: { ...(0, guild_context_1.onePersonnel)(), select: { rank: true, callsign: true } } } } },
            orderBy: [{ userId: 'asc' }, { startedAt: 'asc' }],
        });
        const groups = [];
        for (const s of sessions) {
            const g = groups[groups.length - 1];
            const prev = g?.[g.length - 1];
            // gleiche Schicht-ID bzw. Statuswechsel im selben Moment (ältere Sitzungen) → gleiche Schicht
            if (sameShift(prev, s))
                g.push(s);
            else
                groups.push([s]);
        }
        const cfg = await this.shifts.config();
        const typeName = (id) => (id ? cfg.types.find((t) => t.id === id)?.name ?? id : null);
        const shifts = groups.map((g) => {
            const first = g[0], last = g[g.length - 1];
            const end = last.endedAt;
            const ms = (s) => (s.endedAt ?? now).getTime() - s.startedAt.getTime();
            const types = [...new Set(g.map((s) => s.shiftType).filter((x) => !!x))];
            return {
                id: first.id, shiftId: g.find((s) => s.shiftId)?.shiftId ?? null, userId: first.userId, name: first.user.displayName, rank: first.user.personnel[0]?.rank ?? null, callsign: last.callsign ?? first.user.personnel[0]?.callsign ?? null,
                shiftTypes: types, shiftType: typeName(types[0] ?? null), shiftTypeNames: types.map((t) => typeName(t)),
                startedAt: first.startedAt, endedAt: end, active: !end, status: end ? 'OFF_DUTY' : last.status,
                minutes: Math.round(g.reduce((n, s) => n + ms(s), 0) / 60_000),
                breakMinutes: Math.round(g.filter((s) => s.status === 'BREAK').reduce((n, s) => n + ms(s), 0) / 60_000),
                breaks: g.filter((s) => s.status === 'BREAK').length,
                seconds: Math.round(g.filter((s) => s.status !== 'BREAK').reduce((n, s) => n + ms(s), 0) / 1000),
                startedBy: null, endedBy: null,
            };
        }).filter((x) => (x.endedAt ?? now) > since && (!f.shiftType || x.shiftTypes.includes(f.shiftType)))
            .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 500);
        // Wer hat gestartet/beendet? Audit-Eintrag zum Statuswechsel (selbst, per Discord oder durch die Schichtleitung)
        if (shifts.length) {
            const audits = await this.prisma.auditLog.findMany({
                where: { module: 'team', action: { in: ['duty.status', 'duty.status.set_by_supervisor'] }, entityType: 'User', entityId: { in: [...new Set(shifts.map((s) => s.userId))] }, createdAt: { gt: new Date(since.getTime() - 86_400_000) } },
                select: { actorUserId: true, entityId: true, createdAt: true },
            });
            const names = new Map((await this.prisma.user.findMany({ where: { id: { in: [...new Set(audits.map((a) => a.actorUserId).filter((x) => !!x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
            const near = (userId, at) => {
                if (!at)
                    return null;
                const a = audits.filter((x) => x.entityId === userId && Math.abs(x.createdAt.getTime() - at.getTime()) < 10_000).sort((x, y) => Math.abs(x.createdAt.getTime() - at.getTime()) - Math.abs(y.createdAt.getTime() - at.getTime()))[0];
                return a?.actorUserId ? names.get(a.actorUserId) ?? null : null;
            };
            for (const s of shifts) {
                s.startedBy = near(s.userId, s.startedAt);
                s.endedBy = near(s.userId, s.endedAt);
            }
        }
        return { days: f.days, since, ...(member ? { member } : {}), items: shifts.map(({ shiftTypes: _, ...s }) => s) };
    }
    /** Team-Dashboard: pro aktivem Beamten Dienststatus, Einheit, aktueller Einsatz und letzte Statusänderung. */
    async overview() {
        const [people, open, units, assignments, cfg] = await Promise.all([
            this.prisma.personnel.findMany({ where: { employmentStatus: 'ACTIVE' }, include: { user: { select: { id: true, displayName: true, active: true } } }, orderBy: { callsign: 'asc' } }),
            this.prisma.dutySession.findMany({ where: { endedAt: null, ...(0, guild_context_1.recordWhere)() } }),
            this.prisma.unit.findMany({ include: { members: true } }),
            this.prisma.incidentUnit.findMany({ where: { clearedAt: null, incident: { status: { notIn: ['CLOSED', 'CANCELLED'] } } }, include: { incident: { select: { id: true, number: true, title: true, status: true, priority: true } } } }),
            this.shifts.config(),
        ]);
        const ids = people.map((p) => p.userId);
        const lastEnded = await this.prisma.dutySession.groupBy({ by: ['userId'], where: { userId: { in: ids }, endedAt: { not: null } }, _max: { endedAt: true } });
        const ended = new Map(lastEnded.map((l) => [l.userId, l._max.endedAt]));
        return people.filter((p) => p.user.active).map((p) => {
            const session = open.find((o) => o.userId === p.userId);
            const unit = units.find((u) => u.members.some((m) => m.userId === p.userId));
            const inc = unit ? assignments.find((a) => a.unitId === unit.id)?.incident ?? null : null;
            return {
                userId: p.userId, personnelId: p.id, name: p.user.displayName, rank: p.rank, callsign: p.callsign, team: p.team,
                dutyStatus: session?.status ?? 'OFF_DUTY', onDutySince: session?.startedAt ?? null,
                // Leitstelle: seit wann nichts mehr gemacht (Dashboard/MDT, Discord); `reminded` = Erinnerung ist raus, noch keine Reaktion
                lastActivityAt: session ? new Date(Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0)) : null,
                reminded: !!session?.remindedAt && session.remindedAt.getTime() >= Math.max(session.startedAt.getTime(), session.lastActivityAt?.getTime() ?? 0),
                shiftType: cfg.enabled ? cfg.types.find((t) => t.id === session?.shiftType)?.name ?? null : null,
                lastStatusChange: session?.startedAt ?? ended.get(p.userId) ?? null,
                unit: unit ? { id: unit.id, callsign: unit.callsign, status: unit.status } : null,
                currentIncident: inc,
            };
        });
    }
};
exports.DutyService = DutyService;
exports.DutyService = DutyService = DutyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, realtime_service_1.RealtimeService, discord_service_1.DiscordService, shifts_1.ShiftsService])
], DutyService);
//# sourceMappingURL=duty.service.js.map