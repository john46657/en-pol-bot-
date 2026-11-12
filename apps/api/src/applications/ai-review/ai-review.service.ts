import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AI_PROVIDER_LABEL, AI_REVIEW_RECOMMENDATION_LABEL, aiReviewFingerprintSource, aiReviewResultSchema, aiReviewSettingsSchema, buildAiReviewPrompt, parseAiReview, type AiReviewResult, type AiReviewSettings, type AiReviewState, type AiReviewVia, type AiReviewView } from '@enrp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../../audit/audit.service';
import { AppError } from '../../common/errors';
import { settingsGuild } from '../../common/guild-context';
import { ApplicationsService } from '../applications.service';
import { webUrl } from '../../common/web-url';
import { aiConfig, aiKeyHint, AiProviderError, createAiProvider, type AiConfig } from './ai-provider';
import { NotifyService } from '../../notifications/notify.service';
import { DiscordService } from '../../discord/discord.service';
import { applicationEvents, type SubmittedApplication } from '../../common/application-events';

export type AiReviewKind = 'POLICE' | 'QUALIFICATION';
const SETTINGS_KEY = 'applications.aiReview';
const ENTITY: Record<AiReviewKind, string> = { POLICE: 'Application', QUALIFICATION: 'QualificationApplication' };
/** Wer über eine Bewerbung dieser Art entscheiden/prüfen darf – bekommt die Meldung „KI-Analyse fertig/fehlgeschlagen“. */
const REVIEW_PERMISSION: Record<AiReviewKind, string> = { POLICE: 'applications.review', QUALIFICATION: 'qualifications.decide' };
/** Wartezeit nach dem Einreichen, bevor die automatische Analyse startet (Bewerbung ist dann sicher gespeichert und gepostet). */
const AUTO_DELAY_MS = process.env.NODE_ENV === 'test' ? 50 : 3_000;
/** Höchstens so viele automatische Analysen warten gleichzeitig (Schutz bei Massen-Einreichungen). */
const AUTO_QUEUE_MAX = 200;
/** Ziel der Discord-Meldung einer automatischen Analyse (Kanal der Bewerbung) */
interface AutoTarget { channelKey: 'applications' | 'qualifications'; channelId: string | null }
type Row = Prisma.ApplicationAiReviewGetPayload<object>;
interface Loaded { guildId: string | null; number: string; typeName: string; answers: { question: string; answer: string }[] }

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
@Injectable()
export class AiReviewService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('AiReview');
  /** Bewerbungen, für die dieser Prozess gerade eine Analyse prüft oder ausführt (`KIND:id`) */
  private readonly busy = new Set<string>();
  /** gleichzeitig laufende KI-Anfragen dieses Prozesses */
  private active = 0;
  /** wartende automatische Analysen (neue Bewerbungen), werden nacheinander gestartet, sobald ein Platz frei ist */
  private readonly queue: SubmittedApplication[] = [];
  private pumping = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private offEvents: (() => void) | null = null;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly apps: ApplicationsService, private readonly notify: NotifyService, private readonly discord: DiscordService) {}

  onModuleDestroy() {
    this.offEvents?.();
    this.offEvents = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.queue.length = 0;
  }

  /** Nach einem Neustart: abgebrochene Analysen als fehlgeschlagen markieren – nie automatisch erneut an die KI senden. */
  async onModuleInit() {
    const r = await this.prisma.applicationAiReview.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Analyse durch einen Neustart des Systems unterbrochen. Bitte erneut starten.', finishedAt: new Date() } }).catch(() => ({ count: 0 }));
    if (r.count) this.log.warn(`${r.count} unterbrochene KI-Prüfung(en) als fehlgeschlagen markiert`);
    // neue Bewerbungen (Web/Dashboard und Discord) → automatische Analyse im Hintergrund
    this.offEvents = applicationEvents.on((a) => this.enqueueAuto(a));
  }

  // ───────────── Automatische Analyse neuer Bewerbungen ─────────────
  /** Nimmt eine neue Bewerbung in die Warteschlange. Läuft vollständig im Hintergrund und wirft nie. */
  enqueueAuto(a: SubmittedApplication) {
    if (!createAiProvider(this.cfg())) return; // kein Anbieter eingerichtet → nichts zu tun (kein Fehler)
    if (this.queue.some((x) => x.kind === a.kind && x.id === a.id)) return;
    if (this.queue.length >= AUTO_QUEUE_MAX) { this.log.warn(`KI-Warteschlange voll – automatische Prüfung für ${a.number} übersprungen`); return; }
    this.queue.push(a);
    setTimeout(() => void this.pump(), AUTO_DELAY_MS).unref?.();
  }

  /** Startet wartende Analysen nacheinander, solange Plätze frei sind; sonst später erneut versuchen. */
  private async pump() {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const c = this.cfg();
        if (this.active >= c.maxConcurrent) { this.later(5_000); return; }
        const a = this.queue.shift()!;
        await this.autoStart(a).catch((e) => this.log.warn(`automatische KI-Prüfung ${a.number}: ${e instanceof Error ? e.message : e}`));
      }
    } finally { this.pumping = false; }
  }
  private later(ms: number) {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.pump(); }, ms);
    this.retryTimer.unref?.();
  }

  private async autoStart(a: SubmittedApplication) {
    const s = await this.settings(a.guildId);
    if (!s.enabled || !s.auto) return; // je Server ausgeschaltet → still überspringen
    try {
      await this.start({ userId: null, name: 'Automatik' }, a.kind, a.id, { via: 'AUTO', target: { channelKey: a.channelKey, channelId: a.channelId ?? null } });
    } catch (e) {
      // Limit erreicht o. Ä.: Bewerbung bleibt unverändert, Prüfer erfahren es einmal und können später manuell starten
      if (e instanceof AppError) {
        this.log.warn(`automatische KI-Prüfung ${a.number} nicht gestartet: ${e.code}`);
        if (e.code === 'RATE_LIMITED') await this.notify.notifyPermission(REVIEW_PERMISSION[a.kind], { type: 'AI_REVIEW', title: `⏸️ KI-Analyse für ${a.number} nicht gestartet`, body: `${e.message} Die Analyse kann im Dashboard jederzeit manuell gestartet werden.`, entityType: ENTITY[a.kind], entityId: a.id }, { guildId: a.guildId });
        return;
      }
      throw e;
    }
  }

  private cfg(): AiConfig { return aiConfig(); }

  // ───────────── Einstellungen je Server ─────────────
  async settings(guildId: string | null): Promise<AiReviewSettings & { own: boolean }> {
    const g = settingsGuild(guildId);
    const own = g ? await this.prisma.systemSetting.findUnique({ where: { key: `${SETTINGS_KEY}@${g}` } }) : null;
    const s = own ?? await this.prisma.systemSetting.findUnique({ where: { key: SETTINGS_KEY } });
    const p = aiReviewSettingsSchema.safeParse(s?.value ?? {});
    return { ...(p.success ? p.data : aiReviewSettingsSchema.parse({})), own: !!own };
  }
  async saveSettings(actor: Actor, guildId: string | null, value: AiReviewSettings) {
    const g = settingsGuild(guildId);
    const key = g ? `${SETTINGS_KEY}@${g}` : SETTINGS_KEY;
    const data = aiReviewSettingsSchema.parse(value);
    await this.prisma.systemSetting.upsert({ where: { key }, create: { key, value: data }, update: { value: data } });
    await this.audit.record(actor, { action: 'application.ai_review.settings', module: 'applications', entityType: 'SystemSetting', entityId: key, after: { enabled: data.enabled, rulesChars: data.rules.length, criteriaChars: data.criteria.length } });
    return this.settings(guildId);
  }

  /** Status für das Dashboard (ohne Schlüssel – nur ob einer hinterlegt ist). */
  async status(guildId: string | null) {
    const c = this.cfg();
    const s = await this.settings(guildId);
    const since = new Date(Date.now() - 86_400_000);
    const used = await this.prisma.applicationAiReview.count({ where: { createdAt: { gte: since } } });
    const last = await this.prisma.applicationAiReview.findFirst({ where: { status: { in: ['DONE', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, select: { status: true, error: true, finishedAt: true } });
    return { configured: !!createAiProvider(c), enabled: s.enabled, auto: s.auto, provider: c.provider, providerLabel: AI_PROVIDER_LABEL[c.provider], keyEnv: aiKeyHint(c), model: c.model, dailyLimit: c.dailyLimit, usedToday: used, maxConcurrent: c.maxConcurrent, maxInputChars: c.maxInputChars, timeoutMs: c.timeoutMs, running: this.active, queued: this.queue.length, last: last ? { ok: last.status === 'DONE', error: last.error, at: last.finishedAt?.toISOString() ?? null } : null };
  }

  // ───────────── Bewerbung laden (vorhandene Daten, nichts wird verändert) ─────────────
  private async load(kind: AiReviewKind, id: string): Promise<Loaded> {
    if (kind === 'POLICE') {
      const a = await this.apps.get(id);
      const [form, police] = await Promise.all([this.apps.form(a.guildId), this.apps.police(a.guildId)]);
      const labels = new Map(form.map((f) => [f.key, f.label]));
      const answers = Object.entries((a.answers ?? {}) as Record<string, unknown>).map(([k, v]) => ({ question: labels.get(k) ?? k, answer: String(v ?? '') }));
      return { guildId: a.guildId, number: a.number, typeName: police.name || 'EN Polizei', answers };
    }
    const a = await this.prisma.qualificationApplication.findUnique({ where: { id } });
    if (!a) throw new AppError('NOT_FOUND', 'Bewerbung nicht gefunden.');
    const answers = (Array.isArray(a.answers) ? a.answers as { question?: unknown; answer?: unknown }[] : []).map((x) => ({ question: String(x.question ?? ''), answer: String(x.answer ?? '') }));
    return { guildId: a.guildId, number: a.number, typeName: a.unitName, answers };
  }
  private hash(app: Loaded, s: AiReviewSettings) {
    return createHash('sha256').update(aiReviewFingerprintSource({ typeName: app.typeName, answers: app.answers, settings: s })).digest('hex');
  }

  private view(r: Row | null): AiReviewView | null {
    if (!r) return null;
    const res = r.result ? aiReviewResultSchema.safeParse(r.result) : null;
    return { id: r.id, status: r.status as AiReviewView['status'], result: res?.success ? res.data : null, error: r.error, provider: r.provider, model: r.model, requestedByName: r.requestedByName, via: r.via as AiReviewView['via'], createdAt: r.createdAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null, truncated: r.truncated };
  }
  /** Eine Analyse gilt als „hängend“, wenn sie länger läuft, als Zeitlimit × Versuche erlauben (z. B. anderer Prozess abgestürzt). */
  private hung(r: Row) { const c = this.cfg(); return r.status === 'RUNNING' && Date.now() - r.createdAt.getTime() > c.timeoutMs * (c.maxRetries + 1) + 60_000; }

  private unavailable(c: AiConfig, s: AiReviewSettings): string | null {
    if (!createAiProvider(c)) return `Die KI-Prüfung ist nicht eingerichtet: Auf dem Server ist kein KI-Anbieter hinterlegt (z. B. ${aiKeyHint(c)}).`;
    if (!s.enabled) return 'Die KI-Prüfung ist für diesen Server ausgeschaltet (Bewerbungen → Einrichtung → KI-Prüfung).';
    return null;
  }

  /** Gespeicherter Stand – löst nie eine Analyse aus. */
  async state(kind: AiReviewKind, id: string): Promise<AiReviewState & { number: string; dashboardUrl: string }> {
    const app = await this.load(kind, id);
    const s = await this.settings(app.guildId);
    const rows = await this.prisma.applicationAiReview.findMany({ where: { kind, applicationId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
    const latest = rows[0] ?? null, lastDone = rows.find((r) => r.status === 'DONE') ?? null;
    const reason = this.unavailable(this.cfg(), s);
    return { number: app.number, dashboardUrl: webUrl(`/applications?q=${encodeURIComponent(app.number)}`), available: !reason, reason, review: this.view(latest && this.hung(latest) ? { ...latest, status: 'FAILED', error: 'Analyse wurde nicht abgeschlossen. Bitte erneut starten.' } : latest), lastDone: this.view(lastDone), stale: !!lastDone && lastDone.inputHash !== this.hash(app, s) };
  }

  /**
   * Analyse starten (nur auf ausdrückliche Aktion). Ohne `force` wird ein vorhandenes, aktuelles Ergebnis wiederverwendet;
   * eine bereits laufende Analyse wird nie doppelt gestartet. Läuft im Hintergrund – Ergebnis über `state`.
   */
  async start(actor: Actor & { name?: string | null }, kind: AiReviewKind, id: string, opts: { force?: boolean; via: AiReviewVia; target?: AutoTarget }): Promise<AiReviewState & { number: string; dashboardUrl: string; started: boolean }> {
    const key = `${kind}:${id}`;
    const same = async () => ({ ...(await this.state(kind, id)), started: false });
    // Sperre sofort (vor dem ersten await) – zwei gleichzeitige Klicks starten nie zwei Analysen
    if (this.busy.has(key)) return same();
    this.busy.add(key);
    let handedOver = false;
    try {
      const c = this.cfg();
      const app = await this.load(kind, id);
      const s = await this.settings(app.guildId);
      const reason = this.unavailable(c, s);
      if (reason) throw new AppError('CAPABILITY_UNAVAILABLE', reason);
      const hash = this.hash(app, s);
      // läuft schon in einem anderen Prozess → nichts Neues starten
      const latest = await this.prisma.applicationAiReview.findFirst({ where: { kind, applicationId: id }, orderBy: { createdAt: 'desc' } });
      if (latest?.status === 'RUNNING' && !this.hung(latest)) return await same();
      // aktuelles Ergebnis vorhanden → wiederverwenden, außer es wird bewusst neu angefordert
      if (!opts.force) {
        const done = await this.prisma.applicationAiReview.findFirst({ where: { kind, applicationId: id, status: 'DONE' }, orderBy: { createdAt: 'desc' } });
        if (done && done.inputHash === hash) return await same();
      }
      if (!app.answers.some((a) => a.answer.trim() && a.answer.trim() !== '—')) throw new AppError('VALIDATION_FAILED', 'Die Bewerbung enthält keine Antworten, die geprüft werden könnten.');
      const used = await this.prisma.applicationAiReview.count({ where: { createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
      if (used >= c.dailyLimit) throw new AppError('RATE_LIMITED', `Das eingestellte Tageslimit von ${c.dailyLimit} KI-Prüfungen (letzte 24 Stunden) ist erreicht. Bitte später erneut versuchen.`);
      if (this.active >= c.maxConcurrent) throw new AppError('RATE_LIMITED', `Gerade laufen schon ${c.maxConcurrent} KI-Prüfungen. Bitte in einem Moment erneut versuchen.`);
      const prompt = buildAiReviewPrompt({ typeName: app.typeName, answers: app.answers, settings: s }, { maxChars: c.maxInputChars });
      const by = actor.name ?? (actor.userId ? (await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }))?.displayName : null) ?? null;
      const row = await this.prisma.applicationAiReview.create({ data: { kind, applicationId: id, guildId: app.guildId, inputHash: hash, provider: c.provider, model: c.model, truncated: prompt.truncated, requestedById: actor.userId, requestedByName: by, via: opts.via } });
      // Protokoll: wer wann – ohne Bewerbungstext
      await this.audit.record(actor, { action: 'application.ai_review.start', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, after: { reviewId: row.id, number: app.number, model: c.model, via: opts.via, force: !!opts.force, chars: prompt.chars, truncated: prompt.truncated } });
      this.active++;
      handedOver = true;
      void this.run(actor, kind, id, app, row.id, prompt, c, opts.target).finally(() => { this.active--; this.busy.delete(key); if (this.queue.length) void this.pump(); });
    } finally {
      if (!handedOver) this.busy.delete(key);
    }
    return { ...(await this.state(kind, id)), started: true };
  }

  /** Eigentlicher Aufruf (Hintergrund). Fehler beschädigen die Bewerbung nie – nur die Zeile der Analyse wird als FAILED markiert. */
  private async run(actor: Actor, kind: AiReviewKind, id: string, app: Loaded, reviewId: string, prompt: { system: string; user: string }, c: AiConfig, target?: AutoTarget) {
    const provider = createAiProvider(c)!;
    const started = Date.now();
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= c.maxRetries; attempt++) {
        if (attempt) await new Promise((r) => setTimeout(r, Math.min(8_000, 1_500 * 2 ** (attempt - 1))));
        try {
          const out = await provider.generate(prompt, AbortSignal.timeout(c.timeoutMs));
          const parsed = parseAiReview(out.text);
          if (!parsed.ok) { lastErr = new AiProviderError('BAD_RESPONSE', parsed.error, true); continue; }
          await this.prisma.applicationAiReview.update({ where: { id: reviewId }, data: { status: 'DONE', result: parsed.result as unknown as Prisma.InputJsonValue, model: out.model, finishedAt: new Date() } });
          await this.audit.record(actor, { action: 'application.ai_review.done', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, after: { reviewId, number: app.number, model: out.model, recommendation: parsed.result.empfehlung, ms: Date.now() - started } });
          await this.announce(actor, kind, id, app, { ok: true, result: parsed.result }, target);
          return;
        } catch (e) {
          lastErr = e;
          if (!(e instanceof AiProviderError) || !e.retryable) break;
        }
      }
      throw lastErr;
    } catch (e) {
      const msg = e instanceof AiProviderError ? e.message : 'Unerwarteter Fehler bei der KI-Prüfung.';
      // nur die Fehlerart loggen – nie Schlüssel, Prompt oder Bewerbungstext
      this.log.warn(`KI-Prüfung ${reviewId} (${app.number}) fehlgeschlagen: ${e instanceof AiProviderError ? e.kind : e instanceof Error ? e.name : 'unknown'}`);
      await this.prisma.applicationAiReview.update({ where: { id: reviewId }, data: { status: 'FAILED', error: msg, finishedAt: new Date() } }).catch(() => undefined);
      await this.audit.record(actor, { action: 'application.ai_review.failed', module: 'applications', entityType: ENTITY[kind], entityId: id, serverId: app.guildId, result: 'FAILED', after: { reviewId, number: app.number, error: e instanceof AiProviderError ? e.kind : 'INTERNAL', ms: Date.now() - started } }).catch(() => undefined);
      await this.announce(actor, kind, id, app, { ok: false, error: msg }, target).catch(() => undefined);
    }
  }

  /**
   * Ergebnis melden: Benachrichtigung im Dashboard an alle Prüfer dieses Servers (außer wer die Analyse selbst gestartet hat)
   * und – nur bei automatischen Analysen – eine kurze Meldung im Discord-Kanal der Bewerbung. Ohne Bewerbungstext, ohne Begründungen.
   */
  private async announce(actor: Actor, kind: AiReviewKind, id: string, app: Loaded, r: { ok: true; result: AiReviewResult } | { ok: false; error: string }, target?: AutoTarget) {
    try {
      const rec = r.ok ? AI_REVIEW_RECOMMENDATION_LABEL[r.result.empfehlung] : null;
      const score = r.ok && r.result.gesamt.punkte !== null ? ` · Richtwert ${r.result.gesamt.punkte}/10` : '';
      await this.notify.notifyPermission(REVIEW_PERMISSION[kind], r.ok
        ? { type: 'AI_REVIEW', title: `🤖 KI-Analyse ${app.number} abgeschlossen`, body: `Empfehlung: ${rec}${score}. Entscheidung trifft das Team.`, entityType: ENTITY[kind], entityId: id }
        : { type: 'AI_REVIEW', title: `⚠️ KI-Analyse ${app.number} fehlgeschlagen`, body: r.error, entityType: ENTITY[kind], entityId: id },
      { guildId: app.guildId, exceptUserId: actor.userId });
      if (!target) return;
      await this.discord.enqueue(target.channelKey, 'application.ai_review', {
        id, kind: kind === 'POLICE' ? 'p' : 'q', number: app.number, typeName: app.typeName, ok: r.ok,
        ...(r.ok ? { recommendation: r.result.empfehlung, recommendationLabel: rec, score: r.result.gesamt.punkte, overall: r.result.gesamt.einstufung } : { error: r.error }),
        dashboardUrl: webUrl(kind === 'POLICE' ? `/applications?q=${encodeURIComponent(app.number)}` : `/qualifications?id=${id}`),
        ...(target.channelId ? { channelId: target.channelId } : {}),
      }, { always: !!target.channelId });
    } catch (e) { this.log.warn(`KI-Ergebnis ${app.number} konnte nicht gemeldet werden: ${e instanceof Error ? e.message : e}`); }
  }
}
