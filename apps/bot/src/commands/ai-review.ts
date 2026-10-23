import { AI_REVIEW_CRITERIA, AI_REVIEW_DISCLAIMER, AI_REVIEW_OVERALL_LABEL, AI_REVIEW_RATING_LABEL, AI_REVIEW_RECOMMENDATION_LABEL, type AiReviewState, type AiReviewView } from '@enrp/shared';
import { BotApiError, type Api } from '../api';
import { clip, COLORS, errorReply, plain, type ButtonSpec, type EmbedData, type Reply } from '../format';
import { mapError } from './errors';

/**
 * KI-Bewerbungsprüfung per Discord-Button an der Bewerbungs-Nachricht. Startet die Analyse als klickender Prüfer (gleiche
 * Rechte wie im Dashboard), wartet kurz auf das Ergebnis und zeigt eine Zusammenfassung **nur dem Prüfer** (private Antwort).
 * Dashboard und Discord lesen dasselbe gespeicherte Ergebnis; ausführlich steht es im Dashboard.
 */
export type AiKind = 'p' | 'q';
type State = AiReviewState & { number: string; dashboardUrl?: string; started?: boolean };
const path = (kind: AiKind, id: string) => `${kind === 'p' ? '/applications' : '/qualifications/applications'}/${id}/ai-review`;
/** Warten auf das Ergebnis (in Tests verkürzt). Discord erlaubt nach dem Aufschieben 15 Minuten für die Antwort. */
export const aiPoll = { intervalMs: 2_000, maxMs: 60_000 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const REC_ICON = { geeignet: '🟢', rueckfragen_noetig: '🟡', manuelle_pruefung: '🟠' } as const;
const RATING_ICON = { gut: '🟢', ausreichend: '🟡', mangelhaft: '🔴', nicht_beurteilbar: '⚪' } as const;
const bullets = (l: string[], n = 4) => (l.length ? clip(l.slice(0, n).map((x) => `• ${plain(x)}`).join('\n'), 1024) : '—');

/** Private Zusammenfassung für den Prüfer. */
export function aiReviewReply(s: State, kind: AiKind, id: string): Reply {
  const links: ButtonSpec[] = s.dashboardUrl && /^https?:\/\//.test(s.dashboardUrl) ? [{ id: 'link', label: 'Ausführlich im Dashboard', style: 'secondary', url: s.dashboardUrl }] : [];
  const again: ButtonSpec = { id: `quali:aiforce:${kind}:${id}`, label: 'Neu analysieren', style: 'secondary', emoji: '🔄' };
  const r = s.review, done = r?.status === 'DONE' ? r : s.lastDone;
  if (r?.status === 'RUNNING') return { ephemeral: true, embeds: [{ title: `🤖 KI-Prüfung · ${s.number}`, color: COLORS.info, description: '⏳ Die Analyse läuft noch. Klicke gleich noch einmal auf **KI-Prüfung** oder sieh im Dashboard nach – es wird keine zweite Analyse gestartet.' }], buttons: links };
  const failed = r?.status === 'FAILED' ? `⚠️ Letzte Analyse fehlgeschlagen: ${plain(r.error ?? 'unbekannter Fehler')}` : null;
  if (!done) return { ephemeral: true, embeds: [{ title: `🤖 KI-Prüfung · ${s.number}`, color: COLORS.warning, description: failed ?? 'Noch keine Analyse vorhanden.' }], buttons: [...(s.available ? [again] : []), ...links] };
  return { ephemeral: true, embeds: [reviewEmbed(s, done, failed)], buttons: [...(s.available && (s.stale || failed) ? [again] : []), ...links] };
}

function reviewEmbed(s: State, d: AiReviewView, failed: string | null): EmbedData {
  const res = d.result!;
  const score = res.gesamt.punkte === null ? '' : ` · Richtwert ${res.gesamt.punkte}/10`;
  const crit = res.kriterien.map((k) => `${RATING_ICON[k.bewertung]} ${AI_REVIEW_CRITERIA.find((c) => c.key === k.kriterium)?.label ?? k.kriterium}: ${AI_REVIEW_RATING_LABEL[k.bewertung]}`).join('\n');
  return {
    title: `🤖 KI-Prüfung · ${s.number}`,
    color: res.empfehlung === 'geeignet' ? COLORS.success : COLORS.warning,
    description: clip([
      `**Empfehlung:** ${REC_ICON[res.empfehlung]} ${AI_REVIEW_RECOMMENDATION_LABEL[res.empfehlung]}`,
      `**Gesamt:** ${AI_REVIEW_OVERALL_LABEL[res.gesamt.einstufung]}${score}`,
      plain(res.gesamt.begruendung),
      ...(s.stale ? ['', '⚠️ Die Bewerbung oder die hinterlegten Regeln wurden seitdem geändert – das Ergebnis ist möglicherweise veraltet.'] : []),
      ...(failed ? ['', failed] : []),
      '', `-# ${AI_REVIEW_DISCLAIMER}`,
    ].join('\n'), 4000),
    fields: [
      { name: 'Kriterien', value: clip(crit, 1024) },
      { name: 'Stärken', value: bullets(res.staerken), inline: true },
      { name: 'Schwächen', value: bullets(res.schwaechen), inline: true },
      { name: 'Fehlende Angaben', value: bullets(res.fehlende_angaben) },
      ...(res.widersprueche.length ? [{ name: 'Widersprüche', value: bullets(res.widersprueche) }] : []),
      { name: 'Rückfragen fürs Gespräch', value: bullets(res.rueckfragen, 5) },
      ...(res.unsicherheiten.length ? [{ name: 'Unsicherheiten', value: bullets(res.unsicherheiten, 3) }] : []),
    ],
    footer: `${d.model ?? d.provider} · ${d.finishedAt ? new Date(d.finishedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''}${d.requestedByName ? ` · gestartet von ${plain(d.requestedByName)}` : ''} · nur für dich sichtbar`,
  };
}

/** Button „KI-Prüfung“ (`force` = „Neu analysieren“). Fehler mit verständlicher Meldung (fehlender Schlüssel, Limits …). */
export async function runAiReview(c: { api: Api; discordId: string }, kind: AiKind, id: string, force = false): Promise<Reply> {
  try {
    let s = await c.api.asUser<State>(c.discordId, 'POST', path(kind, id), force ? { force: true } : {});
    const until = Date.now() + aiPoll.maxMs;
    while (s.review?.status === 'RUNNING' && Date.now() < until) {
      await sleep(aiPoll.intervalMs);
      s = await c.api.asUser<State>(c.discordId, 'GET', path(kind, id));
    }
    return aiReviewReply(s, kind, id);
  } catch (e) {
    // eigene, verständliche Meldungen der API (kein Schlüssel, ausgeschaltet, Tageslimit, keine Antworten)
    if (e instanceof BotApiError && (e.status === 503 || e.status === 429 || e.status === 400) && e.message) return errorReply(`🤖 ${e.message}`);
    if (e instanceof BotApiError && e.status === 404) return errorReply('Diese Bewerbung gibt es nicht mehr.');
    return mapError(e);
  }
}

export const aiButton = (kind: AiKind, id: string): ButtonSpec => ({ id: `quali:ai:${kind}:${id}`, label: 'KI-Prüfung', style: 'secondary', emoji: '🤖' });
export const isAiKind = (k: unknown): k is AiKind => k === 'p' || k === 'q';
export type { Api };
