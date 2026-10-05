import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';
import { UserName } from './UserName';

interface Ratings {
  enabled: boolean;
  fields: { id: string; label: string; max: number }[];
  mine: Record<string, number>;
  reviewers: { reviewerId: string; values: Record<string, number> }[];
  averages: Record<string, number | null>;
  overallPercent: number | null;
}
const stars = (value: number | undefined, max: number) => '★'.repeat(value ?? 0) + '☆'.repeat(max - (value ?? 0));

/** Interne Bewertung einer Bewerbung (nur Team): eigene Sterne setzen, Mittelwerte und Einzelbewertungen sehen. Ohne Recht oder ohne Felder wird nichts angezeigt. */
export function SubmissionRatings({ guildId, submissionId }: { guildId: string; submissionId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const base = `/guilds/${guildId}/submissions/${submissionId}/ratings`;
  const q = useQuery({ queryKey: ['submission-ratings', submissionId], queryFn: () => api<Ratings>(base), retry: false });
  const set = useMutation({
    mutationFn: (values: Record<string, number | null>) => api<Ratings>(base, { method: 'PUT', body: { values } }),
    onSuccess: (r) => {
      qc.setQueryData(['submission-ratings', submissionId], r);
      void qc.invalidateQueries({ queryKey: ['submission-history', submissionId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!q.data?.enabled) return null;
  const r = q.data;
  return (
    <div className="card comp">
      <h2>Interne Bewertung</h2>
      <p className="muted">Nur für das Team sichtbar. Jede Person ändert nur die eigene Bewertung; die Mittelwerte berücksichtigen alle.</p>
      <table>
        <thead>
          <tr><th>Kriterium</th><th>Meine Bewertung</th><th>Ø Team</th></tr>
        </thead>
        <tbody>
          {r.fields.map((f) => (
            <tr key={f.id}>
              <td>{f.label}</td>
              <td>
                <span role="group" aria-label={`Bewertung ${f.label}`}>
                  {Array.from({ length: f.max }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="linklike"
                      aria-label={`${f.label}: ${n} von ${f.max}`}
                      aria-pressed={r.mine[f.id] === n}
                      disabled={set.isPending}
                      onClick={() => set.mutate({ [f.id]: r.mine[f.id] === n ? null : n })}
                      style={{ fontSize: '1.2em', color: (r.mine[f.id] ?? 0) >= n ? '#f59e0b' : undefined }}
                    >
                      {(r.mine[f.id] ?? 0) >= n ? '★' : '☆'}
                    </button>
                  ))}
                </span>
              </td>
              <td>{r.averages[f.id] === null || r.averages[f.id] === undefined ? '–' : `${r.averages[f.id]} / ${f.max}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Gesamt:</strong> {r.overallPercent === null ? '–' : `${r.overallPercent} %`} · {r.reviewers.length} Bewertung{r.reviewers.length === 1 ? '' : 'en'}
      </p>
      {r.reviewers.length > 0 && (
        <details>
          <summary>Einzelbewertungen</summary>
          <ul className="plain">
            {r.reviewers.map((x) => (
              <li key={x.reviewerId}>
                <UserName id={x.reviewerId} />: {r.fields.map((f) => `${f.label} ${stars(x.values[f.id], f.max)}`).join(' · ')}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
