/**
 * KI-Checker für Bewerbungen: schätzt anhand typischer Merkmale, ob Antworten mit ChatGPT & Co. geschrieben
 * (oder hineinkopiert) wurden. Läuft ohne externen Dienst – gleiche Einschätzung im Dashboard und im Discord-Embed.
 * Ergebnis ist nur ein Hinweis, kein Beweis: auch Menschen schreiben ausformuliert.
 */
/** Ergebnis: { score 0–100, level 'LOW'|'MEDIUM'|'HIGH', reasons: string[], flagged: Indizes auffälliger Antworten } */

export const AI_LEVEL_LABEL = { LOW: 'gering', MEDIUM: 'mittel', HIGH: 'hoch' };
export const AI_HINT = 'Nur ein Hinweis, kein Beweis – im Zweifel im Gespräch nachfragen.';

/** Eindeutige Spuren aus dem Chat mit der KI (Antwort-Einleitung, Platzhalter, Selbstbezeichnung). */
const GIVEAWAYS = [
  [/\bals (eine? )?(ki|künstliche intelligenz|sprachmodell|ai)\b/i, '„als KI/Sprachmodell“'],
  [/\bas an ai\b|\blanguage model\b/i, '„as an AI“'],
  [/\b(chat ?gpt|openai|gemini|copilot)\b/i, 'nennt ChatGPT/KI-Dienst'],
  [/^\s*(gerne|natürlich|klar|sure|certainly)[!,.]?\s+(hier|here)\b/im, 'Antwort beginnt wie eine Chat-Antwort („Gerne! Hier …“)'],
  [/\bhier (ist|sind) (eine?|einige|ein paar|mögliche?)\b[^.\n]{0,40}\b(antwort|beispiel|vorschl|formulier|text)/i, '„Hier ist eine mögliche Antwort …“'],
  [/\[(dein|ihr|name|server|servername|your|platzhalter)[^\]]{0,30}\]/i, 'Platzhalter wie „[Dein Name]“'],
];

/** Formulierungen, die KI-Texte überdurchschnittlich oft benutzen (deutsch + englisch). */
const PHRASES = [
  /\bzusammenfassend\b/i, /\bdarüber hinaus\b/i, /\bdes weiteren\b/i, /\babschließend (lässt sich|möchte ich|kann man)\b/i,
  /\binsgesamt (lässt sich|kann man) sagen\b/i, /\bes ist (mir )?(besonders |sehr )?wichtig,? (zu|dass)\b/i, /\bvon (großer|zentraler|entscheidender) bedeutung\b/i,
  /\b(spielt|spielen) eine (entscheidende|wichtige|zentrale) rolle\b/i, /\bich bin (fest )?(davon )?überzeugt,? dass\b/i, /\bich freue mich (darauf|auf die möglichkeit)\b/i,
  /\bnicht nur\b[^.\n]{1,80}\bsondern auch\b/i, /\bin diesem zusammenhang\b/i, /\bim hinblick auf\b/i, /\bein (respektvoller|professioneller|konstruktiver) umgang\b/i,
  /\b(professionalität|teamfähigkeit|zuverlässigkeit) und (respekt|zuverlässigkeit|teamgeist|professionalität)\b/i, /\bimmersive?n? (erlebnis|erfahrung|rollenspiel)\b/i,
  /\b(sachlich|ruhig) und (respektvoll|sachlich|lösungsorientiert)\b/i, /\blösungsorientiert\b/i, /\bauf augenhöhe\b/i, /\bwertvolle[nrs]? (erfahrung|beitrag|mitglied|teil)/i,
  /\bmeine (fähigkeiten|kenntnisse) (einbringen|weiterentwickeln)\b/i, /\bkommunikation ist (der schlüssel|das a und o|entscheidend)\b/i, /\beinen positiven beitrag\b/i,
  /\bfurthermore\b/i, /\bin conclusion\b/i, /\bi am (truly )?passionate\b/i, /\bdelve\b/i, /\bit is (important|crucial|essential) to\b/i, /\bfoster(ing)?\b/i,
];

/** Lockere Schreibweise spricht eher für einen Menschen. */
const CASUAL = /\b(xd|lol|ka|idk|nen|hab|digga|bro|bissl|bisschen halt)\b|[😂🤣😅👍🙏😁😄]|:\)|:D/iu;

const sentences = (t) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 3);

/** Prüft alle Antworten einer Bewerbung. `durationSec` = Zeit zum Ausfüllen (Discord-Chat / Webformular), wenn bekannt. */
export function aiCheck(answers, durationSec) {
  const texts = answers.map((a) => String(a.answer ?? '').trim());
  const all = texts.join('\n\n');
  const chars = all.replace(/\s+/g, ' ').length;
  const flagged = new Set();
  const hits = [];
  const mark = (re) => texts.forEach((t, i) => { if (re.test(t)) flagged.add(i); });
  if (chars < 40) return { score: 0, level: 'LOW', reasons: [], flagged: [] };

  for (const [re, label] of GIVEAWAYS) if (re.test(all)) { mark(re); hits.push({ points: 60, reason: `Eindeutige KI-Spur: ${label}` }); }

  // Tempo: mehr Zeichen pro Sekunde, als man tippen kann → kopiert
  if (durationSec && durationSec > 0 && chars >= 300) {
    const cpm = Math.round((chars / durationSec) * 60);
    const time = durationSec < 120 ? `${durationSec} s` : `${Math.round(durationSec / 60)} min`;
    if (cpm >= 600) hits.push({ points: 45, reason: `${chars} Zeichen in ${time} (≈ ${cpm} Zeichen/Min) – so schnell tippt niemand, wahrscheinlich hineinkopiert` });
    else if (cpm >= 360) hits.push({ points: 25, reason: `${chars} Zeichen in ${time} (≈ ${cpm} Zeichen/Min) – sehr schnell für selbst getippten Text` });
  }

  const phraseHits = PHRASES.filter((re) => re.test(all));
  if (phraseHits.length) {
    phraseHits.forEach(mark);
    const examples = phraseHits.slice(0, 4).map((re) => `„${all.match(re)[0]}“`).join(', ');
    hits.push({ points: Math.min(48, phraseHits.length * 8), reason: `Typische KI-Formulierungen (${phraseHits.length}): ${examples}` });
  }

  // Formatierung, die man im Discord-Chat selten selbst tippt
  if (/—/.test(all)) { mark(/—/); hits.push({ points: 12, reason: 'Geviertstrich „—“ (kommt fast nur aus KI-Texten/Kopien)' }); }
  if (/\*\*[^*\n]+\*\*|^#{1,4} /m.test(all)) { mark(/\*\*[^*\n]+\*\*|^#{1,4} /m); hits.push({ points: 12, reason: 'Markdown-Formatierung (**fett**, Überschriften)' }); }
  if (/(^|\n)\s*([-•*]|\d+\.)\s+\S.*\n\s*([-•*]|\d+\.)\s+\S/.test(all)) hits.push({ points: 8, reason: 'Aufzählungen/Listen in den Antworten' });

  // Aufbau: alle Antworten lang, gleichförmige Sätze, makellose Zeichensetzung
  const filled = texts.filter((t) => t.length > 0);
  const avg = filled.reduce((n, t) => n + t.length, 0) / Math.max(1, filled.length);
  if (filled.length >= 3 && avg >= 400 && filled.every((t) => t.length >= 150)) hits.push({ points: 10, reason: `Alle Antworten auffällig lang und ausformuliert (Ø ${Math.round(avg)} Zeichen)` });
  const s = sentences(all);
  if (s.length >= 8) {
    const lens = s.map((x) => x.split(/\s+/).length);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const cv = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length) / mean;
    if (cv < 0.35 && mean >= 12) hits.push({ points: 10, reason: 'Sehr gleichförmige, lange Sätze' });
  }
  const long = filled.filter((t) => t.length >= 100);
  if (long.length >= 3 && long.every((t) => /[.!?]$/.test(t)) && s.length >= 6 && s.every((x) => /^[\p{Lu}„"(\d]/u.test(x))) hits.push({ points: 8, reason: 'Durchgehend saubere Groß-/Kleinschreibung und Zeichensetzung' });

  let score = hits.reduce((n, h) => n + h.points, 0);
  if (CASUAL.test(all) || (long.length && long.every((t) => t === t.toLowerCase()))) score -= 15;
  score = Math.max(0, Math.min(100, score));
  return {
    score, level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW',
    reasons: hits.sort((a, b) => b.points - a.points).map((h) => h.reason),
    flagged: [...flagged].sort((a, b) => a - b),
  };
}
