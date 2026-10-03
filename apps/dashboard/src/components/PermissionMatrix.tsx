import type { CatalogModule, Effect, Scope } from '../api';

export interface MatrixValue {
  effect: Effect;
  scope: Scope;
}
export type MatrixState = Record<string, MatrixValue>;

/**
 * Berechtigungsmatrix: je Recht „–“ (nicht gesetzt), „Erlaubt“ oder „Gesperrt“. Eine Sperre schlägt jede
 * Erlaubnis. Optional lässt sich der Bereich auf das eigene Team beschränken.
 */
export function PermissionMatrix({
  catalog,
  value,
  onChange,
  allowScope = false,
}: {
  catalog: CatalogModule[];
  value: MatrixState;
  onChange: (next: MatrixState) => void;
  allowScope?: boolean;
}) {
  const set = (key: string, v: MatrixValue | null) => {
    const next = { ...value };
    if (v) next[key] = v;
    else delete next[key];
    onChange(next);
  };
  return (
    <>
      {catalog.map((m) => {
        const manage = `${m.module}.manage`;
        const manageOn = value[manage]?.effect === 'ALLOW';
        return (
          <fieldset key={m.module} className="perm-group">
            <legend>{m.label}</legend>
            <ul className="plain">
              {m.permissions.map((p) => {
                const v = value[p.key];
                const implied = !v && manageOn && p.key !== manage;
                return (
                  <li key={p.key} className="perm-row">
                    <span className="grow">
                      {p.label}{' '}
                      {p.alias && <code title="Name in der Spezifikation">{p.alias}</code>}
                      {implied && <small className="muted"> (durch „Alles“ erlaubt)</small>}
                    </span>
                    <span className="seg" role="group" aria-label={p.label}>
                      <button
                        type="button"
                        className={!v ? 'on' : ''}
                        onClick={() => set(p.key, null)}
                      >
                        –
                      </button>
                      <button
                        type="button"
                        className={v?.effect === 'ALLOW' ? 'on allow' : ''}
                        onClick={() => set(p.key, { effect: 'ALLOW', scope: v?.scope ?? 'SERVER' })}
                      >
                        Erlaubt
                      </button>
                      <button
                        type="button"
                        className={v?.effect === 'DENY' ? 'on deny' : ''}
                        onClick={() => set(p.key, { effect: 'DENY', scope: v?.scope ?? 'SERVER' })}
                      >
                        Gesperrt
                      </button>
                    </span>
                    {allowScope && v && (
                      <select
                        aria-label="Bereich"
                        value={v.scope}
                        onChange={(e) => set(p.key, { ...v, scope: e.target.value as Scope })}
                      >
                        <option value="SERVER">überall</option>
                        <option value="TEAM">nur eigenes Team</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        );
      })}
    </>
  );
}

export const toMatrix = (entries: { key: string; effect: Effect; scope: Scope }[]): MatrixState =>
  Object.fromEntries(entries.map((e) => [e.key, { effect: e.effect, scope: e.scope }]));

export const fromMatrix = (m: MatrixState) =>
  Object.entries(m).map(([key, v]) => ({ key, effect: v.effect, scope: v.scope, scopeRef: '' }));
