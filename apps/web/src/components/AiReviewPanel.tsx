import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AI_REVIEW_CRITERIA, AI_REVIEW_DISCLAIMER, AI_REVIEW_OVERALL_LABEL, AI_REVIEW_RATING_LABEL, AI_REVIEW_RECOMMENDATION_LABEL, type AiReviewSettings, type AiReviewState, type AiReviewView } from '@enrp/shared';
import { api } from '../lib/api';
import { errText } from '../lib/tickets';
import { useServer } from '../lib/guilds';
import { Button, Card, Field, fmt, Textarea } from './ui';

type Kind = 'police' | 'qualification';
const path = (kind: Kind, id: string) => `${kind === 'police' ? '/applications' : '/qualifications/applications'}/${id}/ai-review`;
const REC_TONE = { geeignet: 'border-success/50 bg-success/10 text-success', rueckfragen_noetig: 'border-warning/50 bg-warning/10 text-warning', manuelle_pruefung: 'border-danger/40 bg-danger/10 text-danger' } as const;
const RATING_TONE = { gut: 'text-success', ausreichend: 'text-warning', mangelhaft: 'text-danger', nicht_beurteilbar: 'text-muted' } as const;

/**
 * KI-Bewerbungsprüfung in der aufgeklappten Bewerbung: lädt nur das gespeicherte Ergebnis (startet beim Öffnen nichts),
 * Analyse erst auf Klick. Während der Analyse wird der Stand alle 2 s abgefragt. Nur Entscheidungshilfe – entscheiden
 * weiterhin die Buttons darunter.
 */
export function AiReviewPanel({ kind, id }: { kind: Kind; id: string }) {
  const qc = useQueryClient();
  const key = ['ai-review', kind, id];
  const q = useQuery({ queryKey: key, queryFn: () => api<AiReviewState>(path(kind, id)), refetchInterval: (x) => (x.state.data?.review?.status === 'RUNNING' ? 2_000 : false) });
  const start = useMutation({
    mutationFn: (force: boolean) => api<AiReviewState>(path(kind, id), { method: 'POST', body: force ? { force: true } : {} }),
    onSuccess: (s) => qc.setQueryData(key, s),
  });
  const s = q.data;
  const running = s?.review?.status === 'RUNNING' || start.isPending;
  const failed = s?.review?.status === 'FAILED' ? s.review : null;
  const done = s?.review?.status === 'DONE' ? s.review : s?.lastDone ?? null;
  return (
    <section aria-label="KI-Bewerbungsprüfung" className="mb-3 rounded-md border border-line p-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">🧠 KI-Bewerbungsprüfung</p>
        {s?.available && (
          <div className="flex flex-wrap gap-2">
            {!done && <Button size="sm" disabled={running} onClick={() => start.mutate(false)}>{running ? 'Analyse läuft …' : 'KI-Bewerbung prüfen'}</Button>}
            {done && <Button size="sm" variant="secondary" disabled={running} onClick={() => start.mutate(true)}>{running ? 'Analyse läuft …' : 'Erneut analysieren'}</Button>}
          </div>
        )}
      </div>
      {q.isLoading && <p className="mt-1 text-xs text-muted">Lade gespeichertes Ergebnis …</p>}
      {q.error && <p role="alert" className="mt-1 text-xs text-danger">{errText(q.error)}</p>}
      {s && !s.available && <p className="mt-1 text-xs text-muted">{s.reason}</p>}
      {start.error && <p role="alert" className="mt-1 text-xs text-danger">{errText(start.error)}</p>}
      {running && <p role="status" className="mt-2 flex items-center gap-2 text-xs text-muted"><span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Die KI prüft die Bewerbung – das dauert meist 5–30 Sekunden.</p>}
      {failed && !running && <p role="alert" className="mt-2 text-xs text-danger">Letzte Analyse fehlgeschlagen ({fmt(failed.createdAt)}): {failed.error}</p>}
      {s?.stale && done && <p className="mt-2 rounded border border-warning/50 bg-warning/10 p-1.5 text-xs text-warning">⚠️ Die Bewerbung oder die hinterlegten Regeln wurden seit dieser Analyse geändert – das Ergebnis ist möglicherweise veraltet.</p>}
      {done?.result && <AiReviewResultView r={done} />}
      {s?.available && !done && !running && !failed && <p className="mt-1 text-xs text-muted">Noch nicht analysiert. Die Analyse startet nur auf Klick und wird gespeichert.</p>}
    </section>
  );
}

function List({ title, items, empty = '—' }: { title: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted">{title}</p>
      {items.length ? <ul className="list-disc pl-5 text-xs">{items.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-xs text-muted">{empty}</p>}
    </div>
  );
}

function AiReviewResultView({ r }: { r: AiReviewView }) {
  const res = r.result!;
  return (
    <div className="mt-2 grid gap-2">
      <div className={`rounded-md border p-2 ${REC_TONE[res.empfehlung]}`}>
        <p className="font-semibold">Empfehlung: {AI_REVIEW_RECOMMENDATION_LABEL[res.empfehlung]}</p>
        <p className="text-xs text-fg">{res.empfehlung_begruendung}</p>
      </div>
      <p>
        <span className="font-medium">Gesamt: {AI_REVIEW_OVERALL_LABEL[res.gesamt.einstufung]}</span>
        {res.gesamt.punkte !== null && <span className="text-xs text-muted" title="Grober Richtwert der KI – keine objektive Bewertung, keine Erfolgswahrscheinlichkeit"> · Richtwert {res.gesamt.punkte}/10</span>}
        <span className="block text-xs">{res.gesamt.begruendung}</span>
      </p>
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-muted">Einzelkriterien</summary>
        <ul className="mt-1 grid gap-1 text-xs">{res.kriterien.map((k) => (
          <li key={k.kriterium}><span className={`font-medium ${RATING_TONE[k.bewertung]}`}>{AI_REVIEW_RATING_LABEL[k.bewertung]}</span> – {AI_REVIEW_CRITERIA.find((c) => c.key === k.kriterium)?.label ?? k.kriterium}: <span className="text-muted">{k.begruendung}</span></li>
        ))}</ul>
      </details>
      <div className="grid gap-2 sm:grid-cols-2">
        <List title="Stärken" items={res.staerken} />
        <List title="Schwächen" items={res.schwaechen} />
        <List title="Fehlende Angaben" items={res.fehlende_angaben} empty="Keine erkannt." />
        <List title="Widersprüche" items={res.widersprueche} empty="Keine erkannt." />
        <List title="Rückfragen fürs Gespräch" items={res.rueckfragen} />
        <List title="Unsicherheiten" items={res.unsicherheiten} empty="Keine genannt." />
      </div>
      <p className="text-xs text-muted">Analysiert {fmt(r.finishedAt ?? r.createdAt)} · Modell {r.model ?? r.provider}{r.requestedByName && ` · gestartet von ${r.requestedByName}`}{r.via === 'DISCORD' && ' (Discord)'}{r.truncated && ' · Eingabe wegen der Länge gekürzt'}</p>
      <p className="text-xs text-muted">{AI_REVIEW_DISCLAIMER}</p>
    </div>
  );
}

interface AiStatus { configured: boolean; enabled: boolean; provider: string; model: string; dailyLimit: number; usedToday: number }

/** Einrichtung: RP-Regeln und Auswahlkriterien für die KI-Prüfung je Server (ohne sie bewertet die KI diese Punkte als „nicht beurteilbar“). */
export function AiReviewSettingsCard() {
  const qc = useQueryClient();
  const [server] = useServer();
  const settings = useQuery({ queryKey: ['ai-review-settings', server], queryFn: () => api<AiReviewSettings & { own: boolean }>('/application-ai-review/settings', { query: { guildId: server } }) });
  const status = useQuery({ queryKey: ['ai-review-status', server], queryFn: () => api<AiStatus>('/application-ai-review/status', { query: { guildId: server } }) });
  const [draft, setDraft] = useState<AiReviewSettings>();
  const [msg, setMsg] = useState<string>();
  useEffect(() => { if (settings.data) setDraft({ enabled: settings.data.enabled, rules: settings.data.rules, criteria: settings.data.criteria }); }, [settings.data]);
  const save = useMutation({
    mutationFn: (d: AiReviewSettings) => api('/application-ai-review/settings', { method: 'PUT', query: { guildId: server }, body: d }),
    onSuccess: () => { setMsg('Gespeichert.'); void qc.invalidateQueries({ queryKey: ['ai-review-settings'] }); void qc.invalidateQueries({ queryKey: ['ai-review-status'] }); },
  });
  const st = status.data;
  return (
    <Card title="KI-Bewerbungsprüfung">
      <p className="mb-3 text-sm text-muted">Prüfer können eine Bewerbung im Dashboard („KI-Bewerbung prüfen“) oder per Discord-Button „KI-Prüfung“ von einer KI (Google Gemini) auswerten lassen. Die KI ist nur eine Entscheidungshilfe: Sie nimmt nichts an, lehnt nichts ab und ändert keinen Status. Übermittelt werden nur Fragen und Antworten – ohne Discord-/Roblox-Namen, IDs und Kontaktdaten.</p>
      {st && (
        <p className="mb-3 rounded-md border border-line p-2 text-xs">
          {st.configured ? <>✅ KI-Schlüssel auf dem Server hinterlegt · Modell <b>{st.model}</b> · {st.usedToday}/{st.dailyLimit} Analysen in den letzten 24 Stunden</> : <>⚪ Kein <code>GEMINI_API_KEY</code> auf dem Server hinterlegt – die KI-Prüfung ist ausgeblendet, bis der Betreiber ihn einträgt.</>}
        </p>
      )}
      {draft && (
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />KI-Prüfung auf diesem Server anbieten</label>
          <Field label="Geltende RP-Regeln (Auszug)" hint="Ohne Regeln bewertet die KI das Regelverständnis ausdrücklich als „nicht beurteilbar“. Keine personenbezogenen Daten eintragen.">{(id) => <Textarea id={id} rows={6} maxLength={8000} value={draft.rules} onChange={(e) => setDraft({ ...draft, rules: e.target.value })} placeholder="z. B. Kein Fail-RP, kein Powergaming, Funkdisziplin …" />}</Field>
          <Field label="Auswahlkriterien des Teams" hint="Woran ihr Bewerbungen messt. Ohne Kriterien: „nicht beurteilbar“. Die KI erfindet keine eigenen Anforderungen.">{(id) => <Textarea id={id} rows={4} maxLength={4000} value={draft.criteria} onChange={(e) => setDraft({ ...draft, criteria: e.target.value })} placeholder="z. B. Mindestens 2 Stunden pro Woche aktiv, ruhiger Umgang im Funk …" />}</Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={save.isPending} onClick={() => { setMsg(undefined); save.mutate(draft); }}>KI-Einstellungen speichern</Button>
            {msg && <span className="text-sm text-muted">{msg}</span>}
            {save.error && <span role="alert" className="text-sm text-danger">{errText(save.error)}</span>}
          </div>
          <p className="text-xs text-muted">Ändern sich Regeln oder Kriterien, werden vorhandene Ergebnisse als „möglicherweise veraltet“ markiert. Kostenlose Kontingente des Anbieters können sich ändern und sind nicht garantiert.</p>
        </div>
      )}
    </Card>
  );
}
