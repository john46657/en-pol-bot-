import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DenyReason, type ReviewOptions } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

interface AppDetail {
  config: {
    review?: Record<string, unknown> & {
      acceptPipeline?: Record<string, boolean>;
      denyReasons?: DenyReason[];
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
  if (!app.data || !options.data) return <p className="muted">Lade Einstellungen …</p>;
  return (
    <Form
      key={JSON.stringify(app.data.config?.review ?? {})}
      app={app.data}
      options={options.data}
      base={base}
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
  onSaved,
  onError,
}: {
  app: AppDetail;
  options: ReviewOptions;
  base: string;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const review = app.config?.review ?? {};
  const [steps, setSteps] = useState<Record<string, boolean>>(review.acceptPipeline ?? {});
  const [reasons, setReasons] = useState<DenyReason[]>(review.denyReasons ?? []);
  const save = useMutation({
    mutationFn: () =>
      api(base, {
        method: 'PATCH',
        body: { config: { review: { ...review, acceptPipeline: steps, denyReasons: reasons } } },
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
