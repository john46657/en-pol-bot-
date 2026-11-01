"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAiKind = exports.aiButton = exports.aiPoll = void 0;
exports.aiReviewReply = aiReviewReply;
exports.runAiReview = runAiReview;
const shared_1 = require("@enrp/shared");
const api_1 = require("../api");
const format_1 = require("../format");
const errors_1 = require("./errors");
const path = (kind, id) => `${kind === 'p' ? '/applications' : '/qualifications/applications'}/${id}/ai-review`;
/** Warten auf das Ergebnis (in Tests verkürzt). Discord erlaubt nach dem Aufschieben 15 Minuten für die Antwort. */
exports.aiPoll = { intervalMs: 2_000, maxMs: 60_000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REC_ICON = { geeignet: '🟢', rueckfragen_noetig: '🟡', manuelle_pruefung: '🟠' };
const RATING_ICON = { gut: '🟢', ausreichend: '🟡', mangelhaft: '🔴', nicht_beurteilbar: '⚪' };
const bullets = (l, n = 4) => (l.length ? (0, format_1.clip)(l.slice(0, n).map((x) => `• ${(0, format_1.plain)(x)}`).join('\n'), 1024) : '—');
/** Private Zusammenfassung für den Prüfer. */
function aiReviewReply(s, kind, id) {
    const links = s.dashboardUrl && /^https?:\/\//.test(s.dashboardUrl) ? [{ id: 'link', label: 'Ausführlich im Dashboard', style: 'secondary', url: s.dashboardUrl }] : [];
    const again = { id: `quali:aiforce:${kind}:${id}`, label: 'Neu analysieren', style: 'secondary', emoji: '🔄' };
    const r = s.review, done = r?.status === 'DONE' ? r : s.lastDone;
    if (r?.status === 'RUNNING')
        return { ephemeral: true, embeds: [{ title: `🤖 KI-Prüfung · ${s.number}`, color: format_1.COLORS.info, description: '⏳ Die Analyse läuft noch. Klicke gleich noch einmal auf **KI-Prüfung** oder sieh im Dashboard nach – es wird keine zweite Analyse gestartet.' }], buttons: links };
    const failed = r?.status === 'FAILED' ? `⚠️ Letzte Analyse fehlgeschlagen: ${(0, format_1.plain)(r.error ?? 'unbekannter Fehler')}` : null;
    if (!done)
        return { ephemeral: true, embeds: [{ title: `🤖 KI-Prüfung · ${s.number}`, color: format_1.COLORS.warning, description: failed ?? 'Noch keine Analyse vorhanden.' }], buttons: [...(s.available ? [again] : []), ...links] };
    return { ephemeral: true, embeds: [reviewEmbed(s, done, failed)], buttons: [...(s.available && (s.stale || failed) ? [again] : []), ...links] };
}
function reviewEmbed(s, d, failed) {
    const res = d.result;
    const score = res.gesamt.punkte === null ? '' : ` · Richtwert ${res.gesamt.punkte}/10`;
    const crit = res.kriterien.map((k) => `${RATING_ICON[k.bewertung]} ${shared_1.AI_REVIEW_CRITERIA.find((c) => c.key === k.kriterium)?.label ?? k.kriterium}: ${shared_1.AI_REVIEW_RATING_LABEL[k.bewertung]}`).join('\n');
    return {
        title: `🤖 KI-Prüfung · ${s.number}`,
        color: res.empfehlung === 'geeignet' ? format_1.COLORS.success : format_1.COLORS.warning,
        description: (0, format_1.clip)([
            `**Empfehlung:** ${REC_ICON[res.empfehlung]} ${shared_1.AI_REVIEW_RECOMMENDATION_LABEL[res.empfehlung]}`,
            `**Gesamt:** ${shared_1.AI_REVIEW_OVERALL_LABEL[res.gesamt.einstufung]}${score}`,
            (0, format_1.plain)(res.gesamt.begruendung),
            ...(s.stale ? ['', '⚠️ Die Bewerbung oder die hinterlegten Regeln wurden seitdem geändert – das Ergebnis ist möglicherweise veraltet.'] : []),
            ...(failed ? ['', failed] : []),
            '', `-# ${shared_1.AI_REVIEW_DISCLAIMER}`,
        ].join('\n'), 4000),
        fields: [
            { name: 'Kriterien', value: (0, format_1.clip)(crit, 1024) },
            { name: 'Stärken', value: bullets(res.staerken), inline: true },
            { name: 'Schwächen', value: bullets(res.schwaechen), inline: true },
            { name: 'Fehlende Angaben', value: bullets(res.fehlende_angaben) },
            ...(res.widersprueche.length ? [{ name: 'Widersprüche', value: bullets(res.widersprueche) }] : []),
            { name: 'Rückfragen fürs Gespräch', value: bullets(res.rueckfragen, 5) },
            ...(res.unsicherheiten.length ? [{ name: 'Unsicherheiten', value: bullets(res.unsicherheiten, 3) }] : []),
        ],
        footer: `${d.model ?? d.provider} · ${d.finishedAt ? new Date(d.finishedAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' }) : ''}${d.requestedByName ? ` · gestartet von ${(0, format_1.plain)(d.requestedByName)}` : ''} · nur für dich sichtbar`,
    };
}
/** Button „KI-Prüfung“ (`force` = „Neu analysieren“). Fehler mit verständlicher Meldung (fehlender Schlüssel, Limits …). */
async function runAiReview(c, kind, id, force = false) {
    try {
        let s = await c.api.asUser(c.discordId, 'POST', path(kind, id), force ? { force: true } : {});
        const until = Date.now() + exports.aiPoll.maxMs;
        while (s.review?.status === 'RUNNING' && Date.now() < until) {
            await sleep(exports.aiPoll.intervalMs);
            s = await c.api.asUser(c.discordId, 'GET', path(kind, id));
        }
        return aiReviewReply(s, kind, id);
    }
    catch (e) {
        // eigene, verständliche Meldungen der API (kein Schlüssel, ausgeschaltet, Tageslimit, keine Antworten)
        if (e instanceof api_1.BotApiError && (e.status === 503 || e.status === 429 || e.status === 400) && e.message)
            return (0, format_1.errorReply)(`🤖 ${e.message}`);
        if (e instanceof api_1.BotApiError && e.status === 404)
            return (0, format_1.errorReply)('Diese Bewerbung gibt es nicht mehr.');
        return (0, errors_1.mapError)(e);
    }
}
const aiButton = (kind, id) => ({ id: `quali:ai:${kind}:${id}`, label: 'KI-Prüfung', style: 'secondary', emoji: '🤖' });
exports.aiButton = aiButton;
const isAiKind = (k) => k === 'p' || k === 'q';
exports.isAiKind = isAiKind;
//# sourceMappingURL=ai-review.js.map