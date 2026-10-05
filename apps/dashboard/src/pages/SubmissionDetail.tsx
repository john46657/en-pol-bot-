import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  api,
  STATUS_TEXT,
  type DecisionResponse,
  type DenyReason,
  type ReviewOptions,
  type SubmissionDetail as Detail,
  type BuilderQuestion,
} from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { SubmissionRatings } from '../components/SubmissionRatings';
import { useToast } from '../toast';

const ICON = { done: '✅', skipped: '⏭️', failed: '❌', unavailable: '⏳' } as const;
const show = (v: unknown, q?: BuilderQuestion): string => {
  if (v === null || v === undefined || v === '') return '–';
  const label = (x: string) => q?.options?.find((o) => o.value === x)?.label ?? x;
  if (Array.isArray(v)) return v.map((x) => label(String(x))).join(', ');
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein';
  return label(String(v));
};

export function SubmissionDetail() {
  const { guildId = '', submissionId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/submissions/${submissionId}`;
  const q = useQuery({ queryKey: ['submission', submissionId], queryFn: () => api<Detail>(base) });
  const options = useQuery({
    queryKey: ['review-options', guildId],
    queryFn: () => api<ReviewOptions>(`/guilds/${guildId}/submissions/options/review`),
  });
  const history = useQuery({
    queryKey: ['submission-history', submissionId],
    queryFn: () =>
      api<{ id: string; action: string; actorId: string | null; createdAt: string }[]>(
        `${base}/history`,
      ),
  });
  const userId = q.data?.userId;
  const past = useQuery({
    queryKey: ['submission-user-history', guildId, userId],
    enabled: !!userId,
    queryFn: () =>
      api<{ id: string; submissionNumber: string | null; status: string; submittedAt: string | null; createdAt: string; publicReason: string | null; application: { name: string } }[]>(
        `/guilds/${guildId}/submissions/by-user/${userId}`,
      ),
  });
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [reasonId, setReasonId] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<DecisionResponse | null>(null);
  const refresh = () =>
    Promise.all(
      ['submission', 'submission-history', 'submissions'].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
  const decide = useMutation({
    mutationFn: (kind: 'accept' | 'deny') =>
      api<DecisionResponse>(`${base}/${kind}`, {
        method: 'POST',
        body:
          kind === 'accept'
            ? { note: note || undefined }
            : { reasonId: reasonId || undefined, note: note || undefined },
      }),
    onSuccess: (r) => {
      setResult(r);
      setNote('');
      toast[r.overall === 'success' ? 'success' : 'error'](
        r.overall === 'success'
          ? 'Entscheidung gespeichert.'
          : 'Entscheidung gespeichert – nicht alle Schritte gelungen.',
      );
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const contact = useMutation({
    mutationFn: (kind: 'clarify' | 'interview') =>
      api<{ message: string }>(`${base}/${kind}`, { method: 'POST', body: { text } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setText('');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const flow = useMutation({
    mutationFn: (v: { path: string; body?: unknown; msg: string }) =>
      api(`${base}/${v.path}`, { method: 'POST', body: v.body }).then(() => v.msg),
    onSuccess: (m) => {
      toast.success(m);
      setAssignee('');
      void refresh();
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const start = useMutation({
    mutationFn: () => api(`${base}/review/start`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(errorText(e)),
  });

  return (
    <>
      <Link to={`/guilds/${guildId}/submissions`} className="muted">
        ← Alle Einreichungen
      </Link>
      <QueryState query={q}>
        {(s) => {
          const raw = s.version.questions;
          const questions = (Array.isArray(raw) ? raw : (raw.questions ?? [])).sort(
            (a, b) => a.order - b.order,
          );
          const answers = new Map(s.answers.map((a) => [a.questionId, a.value]));
          const open = s.status === 'SUBMITTED' || s.status === 'UNDER_REVIEW' || s.status === 'ON_HOLD';
          const reasons: DenyReason[] = s.application.config?.review?.denyReasons?.length
            ? s.application.config.review.denyReasons
            : (options.data?.defaultDenyReasons ?? []);
          let n = 0;
          return (
            <>
              <h1>
                {s.submissionNumber ? `#${s.submissionNumber} · ` : ''}
                {s.displayNameSnapshot}{' '}
                <small className="muted">
                  {s.application.name} · v{s.version.version}
                </small>
              </h1>
              <p>
                <span className={`pill s-${s.status}`}>{STATUS_TEXT[s.status] ?? s.status}</span>{' '}
                {s.isTest && <span className="pill">TEST</span>}{' '}
                <small className="muted">Discord-ID {s.userId}</small>
              </p>
              {s.publicReason && <p className="muted">Begründung/Nachricht: {s.publicReason}</p>}
              <p aria-label="Bearbeiter">
                <strong>Bearbeiter:</strong>{' '}
                {s.assigneeUserId ? <code>{s.assigneeUserId}</code> : <span className="muted">Noch nicht zugewiesen</span>}
              </p>

              {result && (
                <div
                  className={`alert ${result.overall === 'success' ? 'ok-note' : 'error'}`}
                  role="status"
                >
                  <div>
                    <strong>{result.message.split('\n')[0]}</strong>
                    <ul className="plain">
                      {result.steps.map((st) => (
                        <li key={st.key}>
                          {ICON[st.status]} {st.label}
                          {st.detail ? <small className="muted"> – {st.detail}</small> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <h2>Antworten</h2>
              <ol className="plain">
                {questions
                  .filter(
                    (qq) =>
                      !['PARAGRAPH', 'INFO', 'SEPARATOR'].includes(qq.type) && answers.has(qq.id),
                  )
                  .map((qq) => (
                    <li key={qq.id} className="card">
                      <strong>
                        {++n}. {qq.title}
                      </strong>
                      <div>{show(answers.get(qq.id), qq)}</div>
                    </li>
                  ))}
              </ol>

              {open && (
                <>
                  <h2>Bearbeitung</h2>
                  <div className="actions">
                    {s.assigneeUserId ? (
                      <button className="btn" disabled={flow.isPending} onClick={() => flow.mutate({ path: 'release', msg: 'Freigegeben.' })}>
                        ↩️ Freigeben
                      </button>
                    ) : null}
                    <button className="btn primary" disabled={flow.isPending} onClick={() => flow.mutate({ path: 'claim', msg: 'Übernommen.' })}>
                      👤 Bewerbung übernehmen
                    </button>
                    <input className="inline-input" placeholder="Discord-ID zuweisen (Führungskraft)" aria-label="Bearbeiter zuweisen" value={assignee} onChange={(e) => setAssignee(e.target.value)} />
                    <button className="btn" disabled={!/^\d{5,25}$/.test(assignee.trim()) || flow.isPending} onClick={() => flow.mutate({ path: 'assign', body: { assigneeId: assignee.trim() }, msg: 'Zugewiesen.' })}>
                      Zuweisen
                    </button>
                    <button
                      className="btn"
                      disabled={flow.isPending}
                      onClick={() => {
                        const reason = window.prompt('Grund für das Zurücknehmen (Pflicht)');
                        if (reason) flow.mutate({ path: 'withdraw', body: { reason }, msg: 'Bewerbung zurückgenommen.' });
                      }}
                    >
                      ↩ Zurücknehmen
                    </button>
                    {s.status === 'ON_HOLD' ? (
                      <button className="btn" disabled={flow.isPending} onClick={() => flow.mutate({ path: 'hold', body: { hold: false }, msg: 'Bewerbung wird weiter bearbeitet.' })}>
                        ▶️ Fortsetzen
                      </button>
                    ) : (
                      <button
                        className="btn"
                        disabled={flow.isPending}
                        onClick={() => {
                          const reason = window.prompt('Grund für das Zurückstellen (optional)');
                          if (reason !== null) flow.mutate({ path: 'hold', body: { hold: true, ...(reason.trim() ? { reason } : {}) }, msg: 'Bewerbung zurückgestellt.' });
                        }}
                      >
                        🟠 Zurückstellen
                      </button>
                    )}
                  </div>
                  {s.status === 'SUBMITTED' && (
                    <button
                      className="btn"
                      disabled={start.isPending}
                      onClick={() => start.mutate()}
                    >
                      In Prüfung nehmen
                    </button>
                  )}
                  <div className="card comp">
                    <label className="fld">
                      <span>Nachricht an den Bewerber (optional, bei Annehmen/Ablehnen)</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button
                        className="btn primary"
                        disabled={decide.isPending}
                        onClick={() =>
                          window.confirm(
                            'Bewerbung annehmen? Rollen werden vergeben und der Bewerber informiert.',
                          ) && decide.mutate('accept')
                        }
                      >
                        🟢 Annehmen
                      </button>
                      <select
                        value={reasonId}
                        onChange={(e) => setReasonId(e.target.value)}
                        aria-label="Ablehnungsgrund"
                      >
                        <option value="">– Ablehnungsgrund –</option>
                        {reasons.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn"
                        disabled={decide.isPending || !reasonId}
                        onClick={() =>
                          window.confirm('Bewerbung ablehnen?') && decide.mutate('deny')
                        }
                      >
                        🔴 Ablehnen
                      </button>
                    </div>
                  </div>
                  <div className="card comp">
                    <label className="fld">
                      <span>Rückfrage oder Gesprächseinladung (geht per DM an den Bewerber)</span>
                      <textarea
                        rows={2}
                        maxLength={1500}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                    <div className="actions">
                      <button
                        className="btn"
                        disabled={!text.trim() || contact.isPending}
                        onClick={() => contact.mutate('clarify')}
                      >
                        🟡 Rückfrage senden
                      </button>
                      <button
                        className="btn"
                        disabled={!text.trim() || contact.isPending}
                        onClick={() => contact.mutate('interview')}
                      >
                        🎙️ Gespräch vorschlagen
                      </button>
                    </div>
                  </div>
                </>
              )}

              <h2>Bewerbungshistorie dieses Benutzers</h2>
              {past.data && past.data.length > 0 ? (
                <ul className="plain" aria-label="Bewerbungshistorie">
                  {past.data.map((p) => (
                    <li key={p.id} className="card">
                      <Link to={`/guilds/${guildId}/submissions/${p.id}`}>
                        <strong>{p.submissionNumber ? `#${p.submissionNumber}` : 'Entwurf'}</strong>
                      </Link>{' '}
                      {p.application.name} · <span className={`pill s-${p.status}`}>{STATUS_TEXT[p.status] ?? p.status}</span>{' '}
                      <small className="muted">{new Date(p.submittedAt ?? p.createdAt).toLocaleDateString('de-DE')}</small>
                      {p.id === s.id && <small className="muted"> (diese)</small>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Keine weiteren Bewerbungen.</p>
              )}

              <SubmissionRatings guildId={guildId} submissionId={submissionId} />
              <h2>Notizen</h2>
              {s.notes.length === 0 ? (
                <p className="muted">Keine.</p>
              ) : (
                <ul className="plain">
                  {s.notes.map((x) => (
                    <li key={x.id} className="card">
                      <small className="muted">
                        {x.authorId} · {new Date(x.createdAt).toLocaleString('de-DE')}
                      </small>
                      <div>{x.content}</div>
                    </li>
                  ))}
                </ul>
              )}

              <h2>Verlauf</h2>
              <ul className="plain">
                {history.data?.map((h) => (
                  <li key={h.id}>
                    <code>{h.action}</code>{' '}
                    <small className="muted">
                      {h.actorId ? `von ${h.actorId} · ` : ''}
                      {new Date(h.createdAt).toLocaleString('de-DE')}
                    </small>
                  </li>
                ))}
              </ul>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
