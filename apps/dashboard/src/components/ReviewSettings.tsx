import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  api,
  type DenyReason,
  type DiscordChannel,
  type QuestionsResponse,
  type RankRow,
  type ReviewOptions,
  type TeamRow,
} from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

interface Onboarding {
  rankId?: string;
  teamId?: string;
  probationDays?: number;
  rpNameQuestionId?: string;
}
interface AppDetail {
  config: {
    review?: Record<string, unknown> & {
      createTicket?: boolean;
      ticketCategoryId?: string;
      resultChannelId?: string;
      resultPostDenied?: boolean;
      resultAcceptedText?: string;
      resultDeniedText?: string;
      acceptPipeline?: Record<string, boolean>;
      denyReasons?: DenyReason[];
      onboarding?: Onboarding;
    };
  } | null;
}
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'grund';

/** Einstellungen der Bearbeitung: Annahme-Schritte einzeln schaltbar und eigene Ablehnungsgründe. */
export function ReviewSettings({
  guildId,
  applicationId,
}: {
  guildId: string;
  applicationId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/applications/${applicationId}`;
  const app = useQuery({
    queryKey: ['application-config', applicationId],
    queryFn: () => api<AppDetail>(base),
  });
  const options = useQuery({
    queryKey: ['review-options', guildId],
    queryFn: () => api<ReviewOptions>(`/guilds/${guildId}/submissions/options/review`),
  });
  const guildBase = `/guilds/${guildId}`;
  const ranks = useQuery({
    queryKey: ['ranks', guildId],
    queryFn: () => api<RankRow[]>(`${guildBase}/personnel-structure/ranks`),
  });
  const teams = useQuery({
    queryKey: ['teams', guildId],
    queryFn: () => api<TeamRow[]>(`${guildBase}/personnel-structure/teams`),
  });
  const questions = useQuery({
    queryKey: ['questions', applicationId],
    queryFn: () => api<QuestionsResponse>(`${base}/questions`),
  });
  if (!app.data || !options.data) return <p className="muted">Lade Einstellungen …</p>;
  return (
    <Form
      key={JSON.stringify(app.data.config?.review ?? {})}
      app={app.data}
      options={options.data}
      base={base}
      ranks={ranks.data ?? []}
      teams={teams.data ?? []}
      textQuestions={(questions.data?.questions ?? []).filter(
        (q) => q.type === 'TEXT' || q.type === 'USERNAME',
      )}
      onSaved={() => {
        toast.success('Gespeichert.');
        void qc.invalidateQueries({ queryKey: ['application-config', applicationId] });
      }}
      onError={(e) => toast.error(errorText(e))}
    />
  );
}

function Form({
  app,
  options,
  base,
  ranks,
  teams,
  textQuestions,
  onSaved,
  onError,
}: {
  app: AppDetail;
  options: ReviewOptions;
  base: string;
  ranks: RankRow[];
  teams: TeamRow[];
  textQuestions: { id: string; title: string }[];
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const review = app.config?.review ?? {};
  const [steps, setSteps] = useState<Record<string, boolean>>(review.acceptPipeline ?? {});
  const [reasons, setReasons] = useState<DenyReason[]>(review.denyReasons ?? []);
  const [onb, setOnb] = useState<Onboarding>(review.onboarding ?? {});
  const [out, setOut] = useState({
    createTicket: review.createTicket ?? false,
    ticketCategoryId: review.ticketCategoryId ?? '',
    resultChannelId: review.resultChannelId ?? '',
    resultPostDenied: review.resultPostDenied ?? false,
    resultAcceptedText: review.resultAcceptedText ?? '',
    resultDeniedText: review.resultDeniedText ?? '',
  });
  const guildBase = base.replace(/\/applications\/[^/]+$/, '');
  const categories = useQuery({ queryKey: ['ticket-cats', guildBase], queryFn: () => api<{ id: string; name: string; active: boolean }[]>(`${guildBase}/tickets/categories`), retry: false });
  const channels = useQuery({ queryKey: ['channels', guildBase], queryFn: () => api<DiscordChannel[]>(`${guildBase}/discord/channels`), retry: false });
  const setO = (p: Partial<Onboarding>) =>
    setOnb(
      (o) =>
        Object.fromEntries(
          Object.entries({ ...o, ...p }).filter(([, v]) => v !== '' && v !== undefined),
        ) as Onboarding,
    );
  const save = useMutation({
    mutationFn: () =>
      api(base, {
        method: 'PATCH',
        body: {
          config: {
            review: {
              ...review,
              acceptPipeline: steps,
              denyReasons: reasons,
              onboarding: onb,
              createTicket: out.createTicket,
              resultPostDenied: out.resultPostDenied,
              // leere Felder entfernen (= Standard)
              ticketCategoryId: out.ticketCategoryId || undefined,
              resultChannelId: out.resultChannelId || undefined,
              resultAcceptedText: out.resultAcceptedText.trim() || undefined,
              resultDeniedText: out.resultDeniedText.trim() || undefined,
            },
          },
        },
      }),
    onSuccess: onSaved,
    onError,
  });
  const set = (i: number, p: Partial<DenyReason>) =>
    setReasons((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <section className="card comp">
      <h3>Bearbeitung</h3>
      <h4>Schritte bei Annahme</h4>
      <p className="muted">
        Jeder Schritt lässt sich einzeln abschalten. „Noch nicht verfügbar“ bedeutet: das zugehörige
        Modul (z. B. Personalakte) existiert noch – der Schritt wird bei Annahme ehrlich als nicht
        ausgeführt gemeldet.
      </p>
      <ul className="plain">
        {options.steps.map((st) => (
          <li key={st.key}>
            <label>
              <input
                type="checkbox"
                checked={steps[st.key] ?? true}
                onChange={(e) => setSteps((x) => ({ ...x, [st.key]: e.target.checked }))}
              />{' '}
              {st.label}
              {!st.available && <small className="muted"> (noch nicht verfügbar)</small>}
            </label>
          </li>
        ))}
      </ul>
      <h4>Neue Mitarbeiter (bei Annahme)</h4>
      <div className="two">
        <label className="fld">
          <span>Einstiegsdienstgrad</span>
          <select value={onb.rankId ?? ''} onChange={(e) => setO({ rankId: e.target.value })}>
            <option value="">– der als „Einstieg“ markierte –</option>
            {ranks
              .filter((r) => r.active)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </label>
        <label className="fld">
          <span>Team</span>
          <select value={onb.teamId ?? ''} onChange={(e) => setO({ teamId: e.target.value })}>
            <option value="">– kein Team –</option>
            {teams
              .filter((t) => t.active)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="two">
        <label className="fld">
          <span>Probezeit (Tage, 0 = keine)</span>
          <input
            type="number"
            min={0}
            max={365}
            value={onb.probationDays ?? 0}
            onChange={(e) => setO({ probationDays: Number(e.target.value) || undefined })}
          />
        </label>
        <label className="fld">
          <span>Frage mit dem RP-Namen</span>
          <select
            value={onb.rpNameQuestionId ?? ''}
            onChange={(e) => setO({ rpNameQuestionId: e.target.value })}
          >
            <option value="">– Discord-Anzeigename verwenden –</option>
            {textQuestions.map((q) => (
              <option key={q.id} value={q.id}>
                {q.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h4>Ablehnungsgründe</h4>
      <p className="muted">
        {reasons.length === 0
          ? 'Es gelten die Standardgründe: ' +
            options.defaultDenyReasons.map((r) => r.label).join(', ') +
            '.'
          : 'Eigene Gründe ersetzen die Standardgründe.'}
      </p>
      {reasons.map((r, i) => (
        <div key={i} className="card comp">
          <div className="two">
            <label className="fld">
              <span>Bezeichnung</span>
              <input
                value={r.label}
                maxLength={100}
                onChange={(e) =>
                  set(i, {
                    label: e.target.value,
                    id: r.id.startsWith('neu-') ? `neu-${slug(e.target.value)}` : r.id,
                  })
                }
              />
            </label>
            <label className="fld">
              <span>Text an den Bewerber</span>
              <input
                value={r.text ?? ''}
                maxLength={1000}
                onChange={(e) => set(i, { text: e.target.value })}
              />
            </label>
          </div>
          <div>
            <button className="btn" onClick={() => setReasons((x) => x.filter((_, j) => j !== i))}>
              Entfernen
            </button>
          </div>
        </div>
      ))}
      <div className="actions">
        <button
          className="btn"
          disabled={reasons.length >= 25}
          onClick={() =>
            setReasons((r) => [...r, { id: `neu-${r.length + 1}`, label: '', text: '' }])
          }
        >
          + Grund
        </button>
      </div>
      <h4>Ticket und Ergebnis</h4>
      <label className="fld">
        <span>
          <input type="checkbox" checked={out.createTicket} onChange={(e) => setOut({ ...out, createTicket: e.target.checked })} /> Nach dem Absenden automatisch ein Bewerbungsticket eröffnen
        </span>
      </label>
      <label className="fld">
        <span>Ticket-Kategorie für Bewerbungstickets dieser Art</span>
        <select value={out.ticketCategoryId} onChange={(e) => setOut({ ...out, ticketCategoryId: e.target.value })}>
          <option value="">– Server-Einstellung –</option>
          {(categories.data ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="fld">
        <span>Ergebnis-Kanal (Annahmen werden dort bekannt gegeben)</span>
        <select value={out.resultChannelId} onChange={(e) => setOut({ ...out, resultChannelId: e.target.value })}>
          <option value="">– kein Ergebnis-Kanal –</option>
          {(channels.data ?? []).filter((c) => c.kind === 'text').map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
        </select>
      </label>
      <label className="fld">
        <span><input type="checkbox" checked={out.resultPostDenied} onChange={(e) => setOut({ ...out, resultPostDenied: e.target.checked })} /> Auch Ablehnungen im Ergebnis-Kanal melden</span>
      </label>
      <label className="fld"><span>Text bei Annahme (Platzhalter: {'{user}'}, {'{applicationName}'}, {'{reviewer}'})</span><input maxLength={1000} placeholder="🎉 {user} wurde bei **{applicationName}** angenommen. Willkommen im Team!" value={out.resultAcceptedText} onChange={(e) => setOut({ ...out, resultAcceptedText: e.target.value })} /></label>
      <label className="fld"><span>Text bei Ablehnung</span><input maxLength={1000} placeholder="❌ Die Bewerbung von {user} für **{applicationName}** wurde abgelehnt." value={out.resultDeniedText} onChange={(e) => setOut({ ...out, resultDeniedText: e.target.value })} /></label>
      <div className="actions">
        <button
          className="btn primary"
          disabled={save.isPending || reasons.some((r) => !r.label.trim())}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Speichere …' : 'Speichern'}
        </button>
      </div>
    </section>
  );
}
