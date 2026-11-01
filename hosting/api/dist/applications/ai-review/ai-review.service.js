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
exports.AiReviewService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../../prisma/prisma.service");
const audit_service_1 = require("../../audit/audit.service");
const errors_1 = require("../../common/errors");
const guild_context_1 = require("../../common/guild-context");
const applications_service_1 = require("../applications.service");
const web_url_1 = require("../../common/web-url");
const ai_provider_1 = require("./ai-provider");
const notify_service_1 = require("../../notifications/notify.service");
const discord_service_1 = require("../../discord/discord.service");
const application_events_1 = require("../../common/application-events");
const SETTINGS_KEY = 'applications.aiReview';
const ENTITY = { POLICE: 'Application', QUALIFICATION: 'QualificationApplication' };
/** Wer über eine Bewerbung dieser Art entscheiden/prüfen darf – bekommt die Meldung „KI-Analyse fertig/fehlgeschlagen“. */
const REVIEW_PERMISSION = { POLICE: 'applications.review', QUALIFICATION: 'qualifications.decide' };
/** Wartezeit nach dem Einreichen, bevor die automatische Analyse startet (Bewerbung ist dann sicher gespeichert und gepostet). */
const AUTO_DELAY_MS = process.env.NODE_ENV === 'test' ? 50 : 3_000;
/** Höchstens so viele automatische Analysen warten gleichzeitig (Schutz bei Massen-Einreichungen). */
const AUTO_QUEUE_MAX = 200;
/**
 * KI-Bewerbungsprüfung: startet eine Analyse automatisch bei neuer Bewerbung (abschaltbar je Server) oder auf ausdrückliche
 * Aktion (Dashboard-Button oder Discord-Button, auch erneut), speichert
 * das geprüfte Ergebnis dauerhaft je Bewerbung und liefert Dashboard und Discord denselben Stand. Ändert nie den Status der
 * Bewerbung, vergibt keine Rollen und sendet nichts an Bewerber.
 *
 * Schutz vor unnötigen Aufrufen: vorhandenes Ergebnis wird wiederverwendet (gleicher Fingerabdruck), eine laufende Analyse
 * wird nicht doppelt gestartet, höchstens `maxConcurrent` gleichzeitig, Tageslimit, begrenzte Eingabe, Zeitlimit,
 * begrenzte Wiederholungen nur bei vorübergehenden Fehlern.
 */
let AiReviewService = class AiReviewService {
    prisma;
    audit;
    apps;
    notify;
    discord;
    log = new common_1.Logger('AiReview');
    /** Bewerbungen, für die dieser Prozess gerade eine Analyse prüft oder ausführt (`KIND:id`) */
    busy = new Set();
    /** gleichzeitig laufende KI-Anfragen dieses Prozesses */
    active = 0;
    /** wartende automatische Analysen (neue Bewerbungen), werden nacheinander gestartet, sobald ein Platz frei ist */
    queue = [];
    pumping = false;
    retryTimer = null;
    offEvents = null;
    constructor(prisma, audit, apps, notify, discord) {
        this.prisma = prisma;
        this.audit = audit;
        this.apps = apps;
        this.notify = notify;
        this.discord = discord;
    }
    onModuleDestroy() {
        this.offEvents?.();
        this.offEvents = null;
        if (this.retryTimer)
            clearTimeout(this.retryTimer);
        this.queue.length = 0;
    }
    /** Nach einem Neustart: abgebrochene Analysen als fehlgeschlagen markieren – nie automatisch erneut an die KI senden. */
    async onModuleInit() {
        const r = await this.prisma.applicationAiReview.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Analyse durch einen Neustart des Systems unterbrochen. Bitte erneut starten.', finishedAt: new Date() } }).catch(() => ({ count: 0 }));
        if (r.count)
            this.log.warn(`${r.count} unterbrochene KI-Prüfung(en) als fehlgeschlagen markiert`);
        // neue Bewerbungen (Web/Dashboard und Discord) → automatische Analyse im Hintergrund
        this.offEvents = application_events_1.applicationEvents.on((a) => this.enqueueAuto(a));
    }
    // ───────────── Automatische Analyse neuer Bewerbungen ─────────────
    /** Nimmt eine neue Bewerbung in die Warteschlange. Läuft vollständig im Hintergrund und wirft nie. */
    enqueueAuto(a) {
        if (!(0, ai_provider_1.createAiProvider)(this.cfg()))
            return; // kein Anbieter eingerichtet → nichts zu tun (kein Fehler)
        if (this.queue.some((x) => x.kind === a.kind && x.id === a.id))
            return;
        if (this.queue.length >= AUTO_QUEUE_MAX) {
            this.log.warn(`KI-Warteschlange voll – automatische Prüfung für ${a.number} übersprungen`);
            return;
        }
        this.queue.push(a);
        setTimeout(() => void this.pump(), AUTO_DELAY_MS).unref?.();
    }
    /** Startet wartende Analysen nacheinander, solange Plätze frei sind; sonst später erneut versuchen. */
    async pump() {
        if (this.pumping)
            return;
        this.pumping = true;
        try {
            while (this.queue.length) {
                const c = this.cfg();
                if (this.active >= c.maxConcurrent) {
                    this.later(5_000);
                    return;
                }
                const a = this.queue.shift();
                await this.autoStart(a).catch((e) => this.log.warn(`automatische KI-Prüfung ${a.number}: ${e instanceof Error ? e.message : e}`));
            }
        }
        finally {
            this.pumping = false;
        }
    }
    later(ms) {
        if (this.retryTimer)
            return;
        this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.pump(); }, ms);
        this.retryTimer.unref?.();
    }
    async autoStart(a) {
        const s = await this.settings(a.guildId);
        if (!s.enabled || !s.auto)
            return; // je Server ausgeschaltet → still überspringen
        try {
            await this.start({ userId: null, name: 'Automatik' }, a.kind, a.id, { via: 'AUTO', target: { channelKey: a.channelKey, channelId: a.channelId ?? null } });
        }
        catch (e) {
            // Limit erreicht o. Ä.: Bewerbung bleibt unverändert, Prüfer erfahren es einmal und können später manuell starten
            if (e instanceof errors_1.AppError) {
                this.log.warn(`automatische KI-Prüfung ${a.number} nicht gestartet: ${e.code}`);
                if (e.code === 'RATE_LIMITED')
                    await this.notify.notifyPermission(REVIEW_PERMISSION[a.kind], { type: 'AI_REVIEW', title: `⏸️ KI-Analyse für ${a.number} nicht gestartet`, body: `${e.message} Die Analyse kann im Dashboard jederzeit manuell gestartet werden.`, entityType: ENTITY[a.kind], entityId: a.id }, { guildId: a.guildId });
                return;
            }
            throw e;
        }
    }
    cfg() { return (0, ai_provider_1.aiConfig)(); }
    // ───────────── Einstellungen je Server ─────────────
    async settings(guildId) {
        const g = (0, guild_context_1.settingsGuild)(guildId);
        const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `${SETTINGS_KEY}@${g}` } }) : null;
        const s = own ?? await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
        const p = shared_1.aiReviewSettingsSchema.safeParse(s?.value ?? {});
        return { ...(p.success ? p.data : shared_1.aiReviewSettingsSchema.parse({})), own: !!own };
    }
    async saveSettings(actor, guildId, value) {
        const g = (0, guild_context_1.settingsGuild)(guildId);
        const key = g ? `${SETTINGS_KEY}@${g}` : SETTINGS_KEY;
        const data = shared_1.aiReviewSettingsSchema.parse(value);
        await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: data }, update: { value: data } });
        await this.audit.record(actor, { action: 'application.ai_review.settings', module: 'applications', entityType: 'SystemSetting', entityId: key, after: { enabled: data.enabled, rulesChars: data.rules.length, criteriaChars: data.criteria.length } });
        return this.settings(guildId);
    }
    /** Status für das Dashboard (ohne Schlüssel – nur ob einer hinterlegt ist). */
    async status(guildId) {
        const c = this.cfg();
        const s = await this.settings(guildId);
        const since = new Date(Date.now() - 86_400_000);
        const used = await this.prisma.applicationAiReview.count({ where: { createdAt: { gte: since } } });
        const last = await this.prisma.applicationAiReview.findFirst({ where: { status: { in: ['DONE', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, select: { status: true, error: true, finishedAt: true } });
        return { configured: !!(0, ai_provider_1.createAiProvider)(c), enabled: s.enabled, auto: s.auto, provider: c.provider, providerLabel: shared_1.AI_PROVIDER_LABEL[c.provider], keyEnv: (0, ai_provider_1.aiKeyHint)(c), model: c.model, dailyLimit: c.dailyLimit, usedToday: used, maxConcurrent: c.maxConcurrent, maxInputChars: c.maxInputChars, timeoutMs: c.timeoutMs, running: this.active, queued: this.queue.length, last: last ? { ok: last.status === 'DONE', error: last.error, at: last.finishedAt?.toISOString() ?? null } : null };
    }
    // ───────────── Bewerbung laden (vorhandene Daten, nichts wird verändert) ─────────────
    async load(kind, id) {
        if (kind === 'POLICE') {
            const a = await this.apps.get(id);
            const [form, police] = await Promise.all([this.apps.form(a.guildId), this.apps.police(a.guildId)]);
            const labels = new Map(form.map((f) => [f.key, f.label]));
            const answers = Object.entries((a.answers ?? {})).map(([k, v]) => ({ question: labels.get(k) ?? k, answer: String(v ?? '') }));
            return { guildId: a.guildId, number: a.number, typeName: police.name || 'EN Polizei', answers };
        }
        const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
        if (!a)
            throw new errors_1.AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
        const answers = (Array.isArray(a.answers) ? a.answers : []).map((x) => ({ question: String(x.question ?? ''), answer: String(x.answer ?? '') }));
        return { guildId: a.guildId, number: a.number, typeName: a.unitName, answers };
    }
    hash(app, s) {
        return (0, node_crypto_1.createHash)('sha256').update((0, shared_1.aiReviewFingerprintSource)({ typeName: app.typeName, answers: app.answers, settings: s })).digest('hex');
    }
    view(r) {
        if (!r)
            return null;
        const res = r.result ? shared_1.aiReviewResultSchema.safeParse(r.result) : null;
        return { id: r.id, status: r.status, result: res?.success ? res.data : null, error: r.error, provider: r.provider, model: r.model, requestedByName: r.requestedByName, via: r.via, createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, truncated: r.truncated };
    }
    /** Eine Analyse gilt als „hängend“, wenn sie länger läuft, als Zeitlimit × Versuche erlauben (z. B. anderer Prozess abgestürzt). */
    hung(r) { const c = this.cfg(); return r.status === 'RUNNING' && Date.now() - r.createdAt.getTime() > c.timeoutMs * (c.maxRetries + 1) + 60_000; }
    unavailable(c, s) {
        if (!(0, ai_provider_1.createAiProvider)(c))
            return `Die KI-Prüfung ist nicht eingerichtet: Auf dem Server ist kein KI-Anbieter hinterlegt (z. B. ${(0, ai_provider_1.aiKeyHint)(c)}).`;
        if (!s.enabled)
            return 'Die KI-Prüfung ist für diesen Server ausgeschaltet (Bewerbungen → Einrichtung → KI-Prüfung).';
        return null;
    }
    /** Gespeicherter Stand – löst nie eine Analyse aus. */
    async state(kind, id) {
        const app = await this.load(kind, id);
        const s = await this.settings(app.guildId);
        const rows = await this.prisma.applicationAiReview.findMany({ where: { kind, applicationId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
        const latest = rows[0] ?? null, lastDone = rows.find((r) => r.status === 'DONE') ?? null;
        const reason = this.unavailable(this.cfg(), s);
        return { number: app.number, dashboardUrl: (0, web_url_1.webUrl)(`/applications?q=${encodeURIComponent(app.number)}`), available: !reason, reason, review: this.view(latest && this.hung(latest) ? { ...latest, status: 'FAILED', error: 'Analyse wurde nicht abgeschlossen. Bitte erneut starten.' } : latest), lastDone: this.view(lastDone), stale: !!lastDone && lastDone.inputHash !== this.hash(app, s) };
    }
    /**
     * Analyse starten (nur auf ausdrückliche Aktion). Ohne `force` wird ein vorhandenes, aktuelles Ergebnis wiederverwendet;
     * eine bereits laufende Analyse wird nie doppelt gestartet. Läuft im Hintergrund – Ergebnis über `state`.
     */
    async start(actor, kind, id, opts) {
        const key = `${kind}:${id}`;
        const same = async () => ({ ...(await this.state(kind, id)), started: false });
        // Sperre sofort (vor dem ersten await) – zwei gleichzeitige Klicks starten nie zwei Analysen
        if (this.busy.has(key))
            return same();
        this.busy.add(key);
        let handedOver = false;
        try {
            const c = this.cfg();
            const app = await this.load(kind, id);
            const s = await this.settings(app.guildId);
            const reason = this.unavailable(c, s);
            if (reason)
                throw new errors_1.AppError('CAPABILITY_UNAVAILABLE', reason);
            const hash = this.hash(app, s);
            // läuft schon in einem anderen Prozess → nichts Neues starten
            const latest = await this.prisma.applicationAiReview.findFirst({ where: { kind, applicationId: id }, orderBy: { createdAt: 'desc' } });
            if (latest?.status === 'RUNNING' && !this.hung(latest))
                return await same();
            // aktuelles Ergebnis vorhanden → wiederverwenden, außer es wird bewusst neu angefordert
            if (!opts.force) {
                const done = await this.prisma.applicationAiReview.findFirst({ where: { kind, applicationId: id, status: 'DONE' }, orderBy: { createdAt: 'desc' } });
                if (done && done.inputHash === hash)
                    return await same();
            }
            if (!app.answers.some((a) => a.answer.trim() && a.answer.trim() !== '—'))
                throw new errors_1.AppError('VALIDATION_FAILED', 'Die Bewerbung enthält keine Antworten, die geprüft werden könnten.');
            const used = await this.prisma.applicationAiReview.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
            if (used >= c.dailyLimit)
                throw new errors_1.AppError('RATE_LIMITED', `Das eingestellte Tageslimit von ${c.dailyLimit} KI-Prüfungen (letzte 24 Stunden) ist erreicht. Bitte später erneut versuchen.`);
            if (this.active >= c.maxConcurrent)
                throw new errors_1.AppError('RATE_LIMITED', `Gerade laufen schon ${c.maxConcurrent} KI-Prüfungen. Bitte in einem Moment erneut versuchen.`);
            const prompt = (0, shared_1.buildAiReviewPrompt)({ typeName: app.typeName, answers: app.answers, settings: s }, { maxChars: c.maxInputChars });
            const by = actor.name ?? (actor.userId ? (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }))?.displayName : null) ?? null;
            const row = await this.prisma.applicationAiReview.create({ data: { kind, applicationId: id, guildId: app.guildId, inputHash: hash, provider: c.provider, model: c.model, truncated: prompt.truncated, requestedById: actor.userId, requestedByName: by, via: opts.via } });
            // Protokoll: wer wann – ohne Bewerbungstext
            await this.audit.record(actor, { action: 'application.ai_review.start', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, after: { reviewId: row.id, number: app.number, model: c.model, via: opts.via, force: !!opts.force, chars: prompt.chars, truncated: prompt.truncated } });
            this.active++;
            handedOver = true;
            void this.run(actor, kind, id, app, row.id, prompt, c, opts.target).finally(() => { this.active--; this.busy.delete(key); if (this.queue.length)
                void this.pump(); });
        }
        finally {
            if (!handedOver)
                this.busy.delete(key);
        }
        return { ...(await this.state(kind, id)), started: true };
    }
    /** Eigentlicher Aufruf (Hintergrund). Fehler beschädigen die Bewerbung nie – nur die Zeile der Analyse wird als FAILED markiert. */
    async run(actor, kind, id, app, reviewId, prompt, c, target) {
        const provider = (0, ai_provider_1.createAiProvider)(c);
        const started = Date.now();
        try {
            let lastErr;
            for (let attempt = 0; attempt <= c.maxRetries; attempt++) {
                if (attempt)
                    await new Promise((r) => setTimeout(r, Math.min(8_000, 1_500 * 2 ** (attempt - 1))));
                try {
                    const out = await provider.generate(prompt, AbortSignal.timeout(c.timeoutMs));
                    const parsed = (0, shared_1.parseAiReview)(out.text);
                    if (!parsed.ok) {
                        lastErr = new ai_provider_1.AiProviderError('BAD_RESPONSE', parsed.error, true);
                        continue;
                    }
                    await this.prisma.applicationAiReview.update({ where: { id: reviewId }, data: { status: 'DONE', result: parsed.result, model: out.model, finishedAt: new Date() } });
                    await this.audit.record(actor, { action: 'application.ai_review.done', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, after: { reviewId, number: app.number, model: out.model, recommendation: parsed.result.empfehlung, ms: Date.now() - started } });
                    await this.announce(actor, kind, id, app, { ok: true, result: parsed.result }, target);
                    return;
                }
                catch (e) {
                    lastErr = e;
                    if (!(e instanceof ai_provider_1.AiProviderError) || !e.retryable)
                        break;
                }
            }
            throw lastErr;
        }
        catch (e) {
            const msg = e instanceof ai_provider_1.AiProviderError ? e.message : 'Unerwarteter Fehler bei der KI-Prüfung.';
            // nur die Fehlerart loggen – nie Schlüssel, Prompt oder Bewerbungstext
            this.log.warn(`KI-Prüfung ${reviewId} (${app.number}) fehlgeschlagen: ${e instanceof ai_provider_1.AiProviderError ? e.kind : e instanceof Error ? e.name : 'unknown'}`);
            await this.prisma.applicationAiReview.update({ where: { id: reviewId }, data: { status: 'FAILED', error: msg, finishedAt: new Date() } }).catch(() => undefined);
            await this.audit.record(actor, { action: 'application.ai_review.failed', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, result: 'FAILED', after: { reviewId, number: app.number, error: e instanceof ai_provider_1.AiProviderError ? e.kind : 'INTERNAL', ms: Date.now() - started } }).catch(() => undefined);
            await this.announce(actor, kind, id, app, { ok: false, error: msg }, target).catch(() => undefined);
        }
    }
    /**
     * Ergebnis melden: Benachrichtigung im Dashboard an alle Prüfer dieses Servers (außer wer die Analyse selbst gestartet hat)
     * und – nur bei automatischen Analysen – eine kurze Meldung im Discord-Kanal der Bewerbung. Ohne Bewerbungstext, ohne Begründungen.
     */
    async announce(actor, kind, id, app, r, target) {
        try {
            const rec = r.ok ? shared_1.AI_REVIEW_RECOMMENDATION_LABEL[r.result.empfehlung] : null;
            const score = r.ok && r.result.gesamt.punkte !== null ? ` · Richtwert ${r.result.gesamt.punkte}/10` : '';
            await this.notify.notifyPermission(REVIEW_PERMISSION[kind], r.ok
                ? { type: 'AI_REVIEW', title: `🤖 KI-Analyse ${app.number} abgeschlossen`, body: `Empfehlung: ${rec}${score}. Entscheidung trifft das Team.`, entityType: ENTITY[kind], entityId: id }
                : { type: 'AI_REVIEW', title: `⚠️ KI-Analyse ${app.number} fehlgeschlagen`, body: r.error, entityType: ENTITY[kind], entityId: id }, { guildId: app.guildId, exceptUserId: actor.userId });
            if (!target)
                return;
            await this.discord.enqueue(target.channelKey, 'application.ai_review', {
                id, kind: kind === 'POLICE' ? 'p' : 'q', number: app.number, typeName: app.typeName, ok: r.ok,
                ...(r.ok ? { recommendation: r.result.empfehlung, recommendationLabel: rec, score: r.result.gesamt.punkte, overall: r.result.gesamt.einstufung } : { error: r.error }),
                dashboardUrl: (0, web_url_1.webUrl)(kind === 'POLICE' ? `/applications?q=${encodeURIComponent(app.number)}` : `/qualifications?id=${id}`),
                ...(target.channelId ? { channelId: target.channelId } : {}),
            }, { always: !!target.channelId });
        }
        catch (e) {
            this.log.warn(`KI-Ergebnis ${app.number} konnte nicht gemeldet werden: ${e instanceof Error ? e.message : e}`);
        }
    }
};
exports.AiReviewService = AiReviewService;
exports.AiReviewService = AiReviewService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, applications_service_1.ApplicationsService, notify_service_1.NotifyService, discord_service_1.DiscordService])
], AiReviewService);
//# sourceMappingURL=ai-review.service.js.map