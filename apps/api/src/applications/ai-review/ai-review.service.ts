import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { aiReviewFingerprintSource, aiReviewResultSchema, aiReviewSettingsSchema, buildAiReviewPrompt, parseAiReview, type AiReviewSettings, type AiReviewState, type AiReviewView } from '@enrp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService, type Actor } from '../../audit/audit.service';
import { AppError } from '../../common/errors';
import { settingsGuild } from '../../common/guild-context';
import { ApplicationsService } from '../applications.service';
import { webUrl } from '../../common/web-url';
import { aiConfig, AiProviderError, createAiProvider, type AiConfig } from './ai-provider';

export type AiReviewKind = 'POLICE' | 'QUALIFICATION';
const SETTINGS_KEY = 'applications.aiReview';
const ENTITY: Record<AiReviewKind, string> = { POLICE: 'Application', QUALIFICATION: 'QualificationApplication' };
type Row = Prisma.ApplicationAiReviewGetPayload<object>;
interface Loaded { guildId: string | null; number: string; typeName: string; answers: { question: string; answer: string }[] }

/**
 * KI-Bewerbungsprüfung: startet eine Analyse nur auf ausdrückliche Aktion (Dashboard-Button oder Discord-Button), speichert
 * das geprüfte Ergebnis dauerhaft je Bewerbung und liefert Dashboard und Discord denselben Stand. Ändert nie den Status der
 * Bewerbung, vergibt keine Rollen und sendet nichts an Bewerber.
 *
 * Schutz vor unnötigen Aufrufen: vorhandenes Ergebnis wird wiederverwendet (gleicher Fingerabdruck), eine laufende Analyse
 * wird nicht doppelt gestartet, höchstens `maxConcurrent` gleichzeitig, Tageslimit, begrenzte Eingabe, Zeitlimit,
 * begrenzte Wiederholungen nur bei vorübergehenden Fehlern.
 */
@Injectable()
export class AiReviewService implements OnModuleInit {
  private readonly log = new Logger('AiReview');
  /** Bewerbungen, für die dieser Prozess gerade eine Analyse prüft oder ausführt (`KIND:id`) */
  private readonly busy = new Set<string>();
  /** gleichzeitig laufende KI-Anfragen dieses Prozesses */
  private active = 0;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly apps: ApplicationsService) {}

  /** Nach einem Neustart: abgebrochene Analysen als fehlgeschlagen markieren – nie automatisch erneut an die KI senden. */
  async onModuleInit() {
    const r = await this.prisma.applicationAiReview.updateMany({ where: { status: 'RUNNING' }, data: { status: 'FAILED', error: 'Analyse durch einen Neustart des Systems unterbrochen. Bitte erneut starten.', finishedAt: new Date() } }).catch(() => ({ count: 0 }));
    if (r.count) this.log.warn(`${r.count} unterbrochene KI-Prüfung(en) als fehlgeschlagen markiert`);
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
    return { configured: !!createAiProvider(c), enabled: s.enabled, provider: c.provider, model: c.model, dailyLimit: c.dailyLimit, usedToday: used, maxConcurrent: c.maxConcurrent, maxInputChars: c.maxInputChars, timeoutMs: c.timeoutMs };
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
    if (!createAiProvider(c)) return 'Die KI-Prüfung ist nicht eingerichtet: Auf dem Server ist kein GEMINI_API_KEY hinterlegt.';
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
  async start(actor: Actor & { name?: string | null }, kind: AiReviewKind, id: string, opts: { force?: boolean; via: 'WEB' | 'DISCORD' }): Promise<AiReviewState & { number: string; dashboardUrl: string; started: boolean }> {
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
      void this.run(actor, kind, id, app, row.id, prompt, c).finally(() => { this.active--; this.busy.delete(key); });
    } finally {
      if (!handedOver) this.busy.delete(key);
    }
    return { ...(await this.state(kind, id)), started: true };
  }

  /** Eigentlicher Aufruf (Hintergrund). Fehler beschädigen die Bewerbung nie – nur die Zeile der Analyse wird als FAILED markiert. */
  private async run(actor: Actor, kind: AiReviewKind, id: string, app: Loaded, reviewId: string, prompt: { system: string; user: string }, c: AiConfig) {
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
    }
  }
}
