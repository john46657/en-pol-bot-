import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { formatMinutes, renderApplicationText, type FormField } from '@enrp/shared';
import { ApplicationsService } from '../applications/applications.service';
import { AppError } from '../common/errors';
import { webUrl } from '../common/web-url';
import { loadEnv } from '../config/env';
import { QualificationsService } from './qualifications.service';

/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit aus der Qualifikations-Konfiguration. */
export const POLICE_KEY = '@polizei';

/** Inhalt des Links: wer sich wofür bewirbt (vom Bot nach allen Vorabprüfungen ausgestellt). */
interface Claims { k: string; d: string; n: string; g?: string; j?: string; t: number; e: number }
export interface WebApplyInput { unit: string; discordId: string; discordName: string; guildId?: string; joinedAt?: Date }

/**
 * Bewerbungsart „Web“: Der Bot stellt einen signierten, zeitlich begrenzten Link aus, die Person füllt die Fragen
 * im Browser aus. Kein Konto nötig – die Discord-Identität steckt im Link. Geprüft wird beim Absenden genauso wie bei
 * einer Bewerbung per Direktnachricht (gleiche Service-Methoden).
 */
@Injectable()
export class WebApplyService {
  private readonly secret = loadEnv().SESSION_SECRET;
  constructor(private readonly q: QualificationsService, private readonly apps: ApplicationsService) {}

  private sign(body: string) { return createHmac('sha256', this.secret).update(`webapply:${body}`).digest('base64url'); }

  private verify(token: string): Claims {
    const [body, sig] = token.split('.');
    const expected = body ? this.sign(body) : '';
    if (!body || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new AppError('NOT_FOUND', 'Dieser Bewerbungslink ist ungültig.');
    const c = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Claims;
    if (c.e < Date.now()) throw new AppError('CONFLICT', 'Dieser Bewerbungslink ist abgelaufen. Starte die Bewerbung im Discord neu.');
    return c;
  }

  /** Name, Einstellungen und Fragen einer Bewerbung (Polizei oder Einheit). */
  private async flow(key: string, guildId?: string) {
    const cfg = await this.q.config(guildId);
    if (key === POLICE_KEY) {
      const name = cfg.police.name;
      return { name, title: `Bewerbung – ${name}`, enabled: cfg.police.enabled, settings: cfg.police.settings, questions: await this.apps.form(guildId), police: true };
    }
    const u = cfg.units.find((x) => x.key === key);
    if (!u) throw new AppError('NOT_FOUND', 'Diese Bewerbung gibt es nicht mehr.');
    return { name: u.name, title: u.name, enabled: u.enabled, settings: u.settings, questions: u.questions as FormField[], police: false };
  }

  /** Vom Bot: Link für eine Person ausstellen; gültig so lange wie das Zeitlimit der Bewerbung. */
  async link(d: WebApplyInput) {
    const f = await this.flow(d.unit, d.guildId);
    if (!f.enabled) throw new AppError('CONFLICT', `Bewerbungen für ${f.name} sind derzeit geschlossen.`);
    const now = Date.now();
    const claims: Claims = { k: d.unit, d: d.discordId, n: d.discordName, ...(d.guildId ? { g: d.guildId } : {}), ...(d.joinedAt ? { j: d.joinedAt.toISOString() } : {}), t: now, e: now + f.settings.timeLimitMinutes * 60_000 };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { url: webUrl(`/bewerbung/${body}.${this.sign(body)}`), expiresAt: new Date(claims.e).toISOString(), timeLimit: formatMinutes(f.settings.timeLimitMinutes) };
  }

  /** Öffentlich: Formular zum Link. */
  async open(token: string) {
    const c = this.verify(token);
    const f = await this.flow(c.k, c.g);
    if (!f.enabled) throw new AppError('CONFLICT', `Bewerbungen für ${f.name} sind derzeit geschlossen.`);
    return { title: f.title, name: f.name, discordName: c.n, expiresAt: new Date(c.e).toISOString(), questions: f.questions, robloxField: f.police && !f.questions.some((x) => x.type === 'ROBLOX') };
  }

  /** Öffentlich: Antworten absenden – gleiche Prüfungen wie bei der Bewerbung per Direktnachricht. */
  async submit(token: string, b: { answers: Record<string, string | string[]>; robloxUsername?: string }) {
    const c = this.verify(token);
    const f = await this.flow(c.k, c.g);
    const meta = { discordId: c.d, discordName: c.n, durationSec: Math.min(86_400, Math.max(0, Math.round((Date.now() - c.t) / 1000))), ...(c.g ? { guildId: c.g } : {}), ...(c.j ? { joinedAt: new Date(c.j) } : {}) };
    let number: string;
    if (f.police) {
      const rb = f.questions.find((x) => x.type === 'ROBLOX');
      const robloxUsername = (rb ? String(b.answers[rb.key] ?? '') : b.robloxUsername ?? '').trim();
      if (!robloxUsername) throw new AppError('VALIDATION_FAILED', 'Bitte gib deinen Roblox-Benutzernamen an.');
      ({ number } = await this.apps.submit({ robloxUsername, answers: b.answers }, meta));
    } else {
      ({ number } = await this.q.submit({ unit: c.k, ...meta, answers: f.questions.map((x) => ({ question: x.label, answer: b.answers[x.key] ?? null })) }));
    }
    return { number, message: renderApplicationText(f.settings.messages.completion, { '{number}': number, '{applicationName}': f.name }).replace(/hier per Direktnachricht/g, 'per Direktnachricht') };
  }
}
