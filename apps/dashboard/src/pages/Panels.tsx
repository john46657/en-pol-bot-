import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { api, type PanelConfig, type PanelRow } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

export const STARTER: PanelConfig = {
  embed: { title: 'Neues Panel', description: 'Beschreibung', color: '#5865f2' },
  buttons: [],
};

export function Panels() {
  const { guildId = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/message-panels`;
  const q = useQuery({ queryKey: ['panels', guildId], queryFn: () => api<PanelRow[]>(base) });
  const create = useMutation({
    mutationFn: () =>
      api<PanelRow>(base, { method: 'POST', body: { name: 'Neues Panel', config: STARTER } }),
    onSuccess: (p) => nav(`/guilds/${guildId}/panels/${p.id}`),
    onError: (e) => toast.error(errorText(e)),
  });
  const remove = useMutation({
    mutationFn: (p: PanelRow) => api(`${base}/${p.id}?deleteMessage=true`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Panel gelöscht.');
      void qc.invalidateQueries({ queryKey: ['panels', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Panels</h1>
      <p className="muted">
        Nachrichten mit Embed, Buttons und Auswahlmenü, die der Bot in einen Kanal sendet.
      </p>
      <button className="btn primary" disabled={create.isPending} onClick={() => create.mutate()}>
        Neues Panel
      </button>
      <QueryState query={q}>
        {(panels) =>
          panels.length === 0 ? (
            <p className="muted">Noch keine Panels.</p>
          ) : (
            <ul className="list">
              {panels.map((p) => (
                <li key={p.id} className="row">
                  <span className="grow">
                    <Link to={`/guilds/${guildId}/panels/${p.id}`}>
                      <strong>{p.name}</strong>
                    </Link>
                    <br />
                    <small className="muted">
                      {p.messageId
                        ? `Gesendet ${p.lastSentAt ? new Date(p.lastSentAt).toLocaleString('de-DE') : ''}`
                        : 'Noch nicht gesendet'}
                    </small>
                  </span>
                  <button
                    className="btn"
                    disabled={remove.isPending}
                    onClick={() =>
                      window.confirm(
                        `„${p.name}“ löschen? Die gesendete Nachricht wird ebenfalls entfernt.`,
                      ) && remove.mutate(p)
                    }
                  >
                    Löschen
                  </button>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
    </>
  );
}
