import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { api } from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { useToast } from '../toast';

export interface ModulesResponse {
  state: { disabled: string[]; disabledCommands: string[] };
  modules: { key: string; label: string; description: string; commands: string[]; navKeys: string[] }[];
  coreCommands: string[];
}

/** Module & Befehle: ganze Module oder einzelne Slash-Befehle je Server an- und abschalten. */
export function Modules() {
  const { guildId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['modules', guildId], queryFn: () => api<ModulesResponse>(`/guilds/${guildId}/modules`) });
  const [draft, setDraft] = useState<ModulesResponse['state'] | null>(null);
  const save = useMutation({
    mutationFn: (state: ModulesResponse['state']) => api(`/guilds/${guildId}/modules`, { method: 'PUT', body: state }),
    onSuccess: () => {
      toast.success('Module gespeichert.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['modules', guildId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  return (
    <>
      <h1>Module &amp; Befehle</h1>
      <p className="muted">Abgeschaltete Module verschwinden aus dem Menü, ihre Slash-Befehle antworten mit einem Hinweis und ihre Dashboard-Funktionen sind gesperrt. Gespeicherte Daten bleiben erhalten. Grundbefehle (/nexus, /server, /health, /diagnose) sind immer verfügbar.</p>
      <QueryState query={q}>
        {(d) => {
          const s = draft ?? d.state;
          const toggle = (list: 'disabled' | 'disabledCommands', key: string, on: boolean) =>
            setDraft({ ...s, [list]: on ? s[list].filter((k) => k !== key) : [...s[list], key] });
          return (
            <>
              <ul className="list" aria-label="Module">
                {d.modules.map((m) => {
                  const on = !s.disabled.includes(m.key);
                  return (
                    <li key={m.key} className="row" style={{ alignItems: 'flex-start' }}>
                      <span className="grow">
                        <label>
                          <input type="checkbox" checked={on} aria-label={`Modul ${m.label}`} onChange={(e) => toggle('disabled', m.key, e.target.checked)} /> <strong>{m.label}</strong>
                        </label>
                        <br />
                        <small className="muted">{m.description}</small>
                        {m.commands.length > 0 && (
                          <div className="actions">
                            {m.commands.map((c) => (
                              <label key={c} style={{ opacity: on ? 1 : 0.5 }}>
                                <input type="checkbox" disabled={!on} checked={on && !s.disabledCommands.includes(c)} aria-label={`Befehl /${c}`} onChange={(e) => toggle('disabledCommands', c, e.target.checked)} /> /{c}
                              </label>
                            ))}
                          </div>
                        )}
                      </span>
                      <span className="muted">{on ? '🟢 an' : '⚫ aus'}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="actions">
                <button className="btn primary" disabled={!draft || save.isPending} onClick={() => draft && save.mutate(draft)}>{save.isPending ? 'Speichere …' : 'Speichern'}</button>
              </div>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
