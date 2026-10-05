import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type ApplicationRow, type DiscordRole, type RankRow, type TeamRow } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
}
interface Req {
  cooldown?: Duration;
  denyCooldown?: Duration;
  timeLimit?: Duration;
  requiredRoleIds?: string[];
  restrictedRoleIds?: string[];
  minAccountAgeDays?: number;
  minGuildMembershipDays?: number;
  requirePreviousApproval?: string[];
  forbidPreviousApproval?: string[];
  maxSubmissionsPerUser?: number;
  maxOpenSubmissions?: number;
  requiredRankIds?: string[];
  requiredTeamIds?: string[];
  minDutyHours?: number;
  dutyWindowDays?: number;
  failMessage?: string;
}

const DAY_PRESETS = [1, 3, 7, 14, 30];
const HOUR_PRESETS = [1, 6, 24, 48, 72];
/** Wartezeit-Auswahl: kein / feste Tage (bzw. Stunden) / individuell (Tage + Stunden). */
function DurationField({ label, value, onChange, unit }: { label: string; value: Duration | undefined; onChange: (d: Duration | undefined) => void; unit: 'days' | 'hours' }) {
  const presets = unit === 'days' ? DAY_PRESETS : HOUR_PRESETS;
  const total = (value?.days ?? 0) * 24 + (value?.hours ?? 0);
  const [custom, setCustom] = useState(false);
  const preset = custom && value ? 'custom' : !value ? 'none' : unit === 'days' && !value.hours && !value.minutes && presets.includes(value.days ?? 0) ? String(value.days) : unit === 'hours' && !value.minutes && presets.includes(total) ? String(total) : 'custom';
  const fromHours = (h: number): Duration | undefined => (h <= 0 ? undefined : { ...(Math.floor(h / 24) ? { days: Math.floor(h / 24) } : {}), ...(h % 24 ? { hours: h % 24 } : {}) });
  return (
    <div className="fld">
      <span>{label}</span>
      <div className="actions">
        <select
          aria-label={label}
          value={preset}
          onChange={(e) => {
            const v = e.target.value;
            setCustom(v === 'custom');
            if (v === 'none') onChange(undefined);
            else if (v === 'custom') onChange(value ?? (unit === 'days' ? { days: 1 } : { hours: 1 }));
            else onChange(unit === 'days' ? { days: Number(v) } : fromHours(Number(v)));
          }}
        >
          <option value="none">{unit === 'days' ? 'Keine Wartezeit' : 'Unbegrenzt'}</option>
          {presets.map((p) => (
            <option key={p} value={p}>{p} {unit === 'days' ? (p === 1 ? 'Tag' : 'Tage') : p === 1 ? 'Stunde' : 'Stunden'}</option>
          ))}
          <option value="custom">Individuell …</option>
        </select>
        {preset === 'custom' && (
          <>
            <label>Tage <input aria-label={`${label}: Tage`} type="number" min={0} max={365} value={value?.days ?? 0} onChange={(e) => onChange({ ...value, days: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: '5em' }} /></label>
            <label>Stunden <input aria-label={`${label}: Stunden`} type="number" min={0} max={23} value={value?.hours ?? 0} onChange={(e) => onChange({ ...value, hours: Math.min(23, Math.max(0, Number(e.target.value) || 0)) })} style={{ width: '4em' }} /></label>
          </>
        )}
      </div>
    </div>
  );
}

/** Mehrfachauswahl als aufklappbare Liste mit Kästchen. */
function PickList({ label, items, value, onChange }: { label: string; items: { id: string; name: string }[]; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const sel = new Set(value ?? []);
  return (
    <details className="fld">
      <summary>{label}: {sel.size ? items.filter((i) => sel.has(i.id)).map((i) => i.name).join(', ') : 'keine'}</summary>
      {items.length === 0 ? <p className="muted">Keine Einträge vorhanden.</p> : (
        <ul className="plain">
          {items.map((i) => (
            <li key={i.id}>
              <label><input type="checkbox" checked={sel.has(i.id)} onChange={(e) => onChange(e.target.checked ? [...sel, i.id] : [...sel].filter((x) => x !== i.id))} /> {i.name}</label>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

const num = (v: string): number | undefined => (v.trim() === '' ? undefined : Number(v));
const clean = (r: Req): Req =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0) && !(typeof v === 'number' && (Number.isNaN(v) || v <= 0)))) as Req;

/** Voraussetzungen einer Bewerbungsart (Team-Chance): Wartezeiten, Bewerbungsdauer, Rollen, Mitgliedsdauer, frühere Annahmen, Höchstzahlen, Personalakte, Mindestaktivität. */
export function RequirementsSettings({ guildId, applicationId }: { guildId: string; applicationId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const g = `/guilds/${guildId}`;
  const base = `${g}/applications/${applicationId}`;
  const app = useQuery({ queryKey: ['application-config', applicationId], queryFn: () => api<{ config: { requirements?: Req } | null }>(base) });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`${g}/discord/roles`), retry: false });
  const apps = useQuery({ queryKey: ['applications', guildId], queryFn: () => api<{ items: ApplicationRow[] }>(`${g}/applications`), retry: false });
  const ranks = useQuery({ queryKey: ['ranks', guildId], queryFn: () => api<RankRow[]>(`${g}/personnel-structure/ranks`), retry: false });
  const teams = useQuery({ queryKey: ['teams', guildId], queryFn: () => api<TeamRow[]>(`${g}/personnel-structure/teams`), retry: false });
  const [draft, setDraft] = useState<Req | null>(null);
  const r: Req = draft ?? app.data?.config?.requirements ?? {};
  const set = (p: Partial<Req>) => setDraft({ ...r, ...p });
  const save = useMutation({
    mutationFn: () => api(base, { method: 'PATCH', body: { config: { requirements: { enabled: true, ...clean(r) } } } }),
    onSuccess: () => {
      toast.success('Voraussetzungen gespeichert.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['application-config', applicationId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!app.data) return null;
  const roleItems = (roles.data ?? []).filter((x) => x.id !== guildId).map((x) => ({ id: x.id, name: `@${x.name}` }));
  const appItems = (apps.data?.items ?? []).filter((a) => a.id !== applicationId).map((a) => ({ id: a.id, name: a.name }));
  return (
    <div className="card comp">
      <h3>Voraussetzungen</h3>
      <p className="muted">Wird beim Start der Bewerbung im Discord geprüft. Fehlt etwas, sieht der Bewerber den Hinweis unten und darunter jeden fehlenden Punkt.</p>
      <h4>Zeiten</h4>
      <DurationField label="Wartezeit zwischen zwei Bewerbungen" unit="days" value={r.cooldown} onChange={(d) => set({ cooldown: d })} />
      <DurationField label="Wartezeit nach einer Ablehnung" unit="days" value={r.denyCooldown} onChange={(d) => set({ denyCooldown: d })} />
      <DurationField label="Bewerbungsdauer (danach läuft eine angefangene Bewerbung ab)" unit="hours" value={r.timeLimit} onChange={(d) => set({ timeLimit: d })} />
      <h4>Mitglied</h4>
      <div className="two">
        <label className="fld"><span>Discord-Konto mindestens … Tage alt</span><input type="number" min={0} max={36500} value={r.minAccountAgeDays ?? ''} onChange={(e) => set({ minAccountAgeDays: num(e.target.value) })} /></label>
        <label className="fld"><span>Mindestens … Tage auf dem Server</span><input type="number" min={0} max={36500} value={r.minGuildMembershipDays ?? ''} onChange={(e) => set({ minGuildMembershipDays: num(e.target.value) })} /></label>
      </div>
      <PickList label="Erforderliche Rollen (alle)" items={roleItems} value={r.requiredRoleIds} onChange={(v) => set({ requiredRoleIds: v })} />
      <PickList label="Ausgeschlossene Rollen" items={roleItems} value={r.restrictedRoleIds} onChange={(v) => set({ restrictedRoleIds: v })} />
      <h4>Frühere Bewerbungen</h4>
      <PickList label="Vorher angenommen sein bei" items={appItems} value={r.requirePreviousApproval} onChange={(v) => set({ requirePreviousApproval: v })} />
      <PickList label="Nicht möglich nach Annahme bei" items={appItems} value={r.forbidPreviousApproval} onChange={(v) => set({ forbidPreviousApproval: v })} />
      <div className="two">
        <label className="fld"><span>Höchstens … Bewerbungen je Person</span><input type="number" min={1} max={100} value={r.maxSubmissionsPerUser ?? ''} onChange={(e) => set({ maxSubmissionsPerUser: num(e.target.value) })} /></label>
        <label className="fld"><span>Plätze: höchstens … offene Bewerbungen gleichzeitig</span><input type="number" min={1} max={1000} value={r.maxOpenSubmissions ?? ''} onChange={(e) => set({ maxOpenSubmissions: num(e.target.value) })} /></label>
      </div>
      <h4>Personalakte und Aktivität</h4>
      <PickList label="Dienstgrad (einer davon)" items={(ranks.data ?? []).map((x) => ({ id: x.id, name: x.name }))} value={r.requiredRankIds} onChange={(v) => set({ requiredRankIds: v })} />
      <PickList label="Team (eines davon)" items={(teams.data ?? []).map((x) => ({ id: x.id, name: x.name }))} value={r.requiredTeamIds} onChange={(v) => set({ requiredTeamIds: v })} />
      <div className="two">
        <label className="fld"><span>Mindestaktivität: Dienststunden</span><input type="number" min={0} max={1000} step={0.5} value={r.minDutyHours ?? ''} onChange={(e) => set({ minDutyHours: num(e.target.value) })} /></label>
        <label className="fld"><span>… in den letzten Tagen</span><input type="number" min={1} max={365} placeholder="30" value={r.dutyWindowDays ?? ''} onChange={(e) => set({ dutyWindowDays: num(e.target.value) })} /></label>
      </div>
      <label className="fld"><span>Hinweis, wenn Voraussetzungen fehlen</span><input maxLength={500} placeholder="❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Bewerbung." value={r.failMessage ?? ''} onChange={(e) => set({ failMessage: e.target.value })} /></label>
      <div className="actions">
        <button className="btn primary" disabled={!draft || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichere …' : 'Voraussetzungen speichern'}</button>
      </div>
    </div>
  );
}
