import { useState, type ReactNode } from 'react';
import { Tag } from 'lucide-react';
import { APPLICATION_VARIABLES, DEFAULT_APPLICATION_MESSAGES } from '@enrp/shared';
import { ChannelPicker, RolePicker } from './DiscordPickers';
import { Input, Select, Textarea } from './ui';

type Mode = 'ALL' | 'ANY';
export interface AppSettingsCfg {
  messages: { accepted: string; denied: string; confirmation: string; completion: string };
  roles: { restricted: { ids: string[]; mode: Mode }; required: { ids: string[]; mode: Mode }; accepted: string[]; denied: string[]; acceptedRemove: string[]; deniedRemove: string[]; pending: string[]; removeOnSubmit: string[]; managers: string[] };
  staffThreads: boolean; cooldownMinutes: number; timeLimitMinutes: number; onLeave: 'NONE' | 'DENY' | 'WITHDRAW';
  /** DM: Fragen per Direktnachricht; WEB: Formular im Browser (Link vom Bot). */
  mode: 'DM' | 'WEB';
}
/** Was jede Bewerbung (Polizei und jede Einheit) gemeinsam hat. */
export interface AppCommon { enabled: boolean; channelId?: string; acceptedChannelId?: string; deniedChannelId?: string; pingRoleIds: string[]; settings: AppSettingsCfg }

export const defaultAppSettings = (): AppSettingsCfg => ({
  messages: { ...DEFAULT_APPLICATION_MESSAGES },
  roles: { restricted: { ids: [], mode: 'ANY' }, required: { ids: [], mode: 'ANY' }, accepted: [], denied: [], acceptedRemove: [], deniedRemove: [], pending: [], removeOnSubmit: [], managers: [] },
  staffThreads: false, cooldownMinutes: 0, timeLimitMinutes: 180, onLeave: 'NONE', mode: 'DM',
});
/** Ältere Einträge ohne Einstellungen mit Standardwerten auffüllen. */
export const withDefaults = (s: Partial<AppSettingsCfg> | undefined): AppSettingsCfg => {
  const d = defaultAppSettings();
  return { ...d, ...s, messages: { ...d.messages, ...s?.messages }, roles: { ...d.roles, ...s?.roles } };
};

const Box = ({ title, desc, children }: { title: string; desc: string; children: ReactNode }) => (
  <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
    <div><p className="font-semibold">{title}</p><p className="text-xs text-muted">{desc}</p></div>
    {children}
  </div>
);
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="grid gap-2"><h3 className="text-base font-semibold">{title}</h3><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>
);
export const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
    className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-primary' : 'bg-line'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);
/** Dauer als Tage / Stunden / Minuten (gespeichert in Minuten). */
function Duration({ minutes, onChange, label }: { minutes: number; onChange: (m: number) => void; label: string }) {
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  const set = (nd: number, nh: number, nm: number) => onChange(Math.max(0, nd) * 1440 + Math.max(0, nh) * 60 + Math.max(0, nm));
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0));
  return (
    <div className="flex gap-2">
      <label className="grid gap-1 text-xs text-muted">Tage<Input aria-label={`${label} Tage`} type="number" min={0} className="w-20" value={d} onChange={(e) => set(num(e.target.value), h, m)} /></label>
      <label className="grid gap-1 text-xs text-muted">Stunden<Input aria-label={`${label} Stunden`} type="number" min={0} max={23} className="w-20" value={h} onChange={(e) => set(d, num(e.target.value), m)} /></label>
      <label className="grid gap-1 text-xs text-muted">Minuten<Input aria-label={`${label} Minuten`} type="number" min={0} max={59} className="w-20" value={m} onChange={(e) => set(d, h, num(e.target.value))} /></label>
    </div>
  );
}
function Message({ title, desc, value, onChange }: { title: string; desc: string; value: string; onChange: (v: string) => void }) {
  const [vars, setVars] = useState(false);
  return (
    <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold">{title}</p><p className="text-xs text-muted">{desc}</p></div>
        <button type="button" aria-expanded={vars} onClick={() => setVars(!vars)} className="inline-flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Tag size={14} aria-hidden />{vars ? 'Variablen ausblenden' : 'Variablen anzeigen'}</button>
      </div>
      {vars && <ul className="grid gap-0.5 text-xs">{Object.entries(APPLICATION_VARIABLES).map(([k, v]) => <li key={k}><button type="button" className="font-mono text-primary" onClick={() => onChange(`${value}${k}`)}>{k}</button> <span className="text-muted">{v}</span></li>)}</ul>}
      <Textarea aria-label={title} rows={5} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function MatchRoles({ title, desc, rule, onChange, verb, end }: { title: string; desc: string; rule: { ids: string[]; mode: Mode }; onChange: (r: { ids: string[]; mode: Mode }) => void; verb: string; end: string }) {
  return (
    <Box title={`${title}: ${rule.ids.length}`} desc={desc}>
      <div className="rounded-md bg-bg/60 p-2 text-xs">
        <p className="mb-1 font-semibold">Abgleich</p>
        <div className="mb-1 flex gap-1" role="radiogroup" aria-label={`${title} Abgleich`}>
          {(['ALL', 'ANY'] as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={rule.mode === m} onClick={() => onChange({ ...rule, mode: m })} className={`rounded px-2 py-1 ${rule.mode === m ? 'bg-primary text-primary-fg' : 'bg-panel-2'}`}>{m === 'ALL' ? 'Hat alle Rollen' : 'Hat eine der Rollen'}</button>)}
        </div>
        <p className="text-muted">{verb} {rule.mode === 'ALL' ? <b>ALLE</b> : <b>MINDESTENS EINE</b>} der aufgeführten Rollen {end}.</p>
      </div>
      <RolePicker ariaLabel={title} value={rule.ids} onChange={(ids) => onChange({ ...rule, ids })} />
    </Box>
  );
}

/** Einstellungen einer Bewerbung wie bei Appy (Requirements, Embed Customization, Role Config, Other). */
export function ApplicationSettingsEditor({ value, onChange, name, onName, questions, pendingHint }: {
  value: AppCommon; onChange: (p: Partial<AppCommon>) => void; name: string; onName: (v: string) => void; questions?: ReactNode; pendingHint: string;
}) {
  const s = value.settings;
  const set = (p: Partial<AppSettingsCfg>) => onChange({ settings: { ...s, ...p } });
  const roles = (p: Partial<AppSettingsCfg['roles']>) => set({ roles: { ...s.roles, ...p } });
  const msg = (p: Partial<AppSettingsCfg['messages']>) => set({ messages: { ...s.messages, ...p } });
  const R = (key: 'accepted' | 'denied' | 'acceptedRemove' | 'deniedRemove' | 'pending' | 'removeOnSubmit' | 'managers', title: string, desc: string) => (
    <Box title={`${title}: ${s.roles[key].length}`} desc={desc}><RolePicker ariaLabel={title} value={s.roles[key]} onChange={(ids) => roles({ [key]: ids })} /></Box>
  );
  return (
    <div className="grid gap-5">
      <Section title="Voraussetzungen">
        <Box title="Aktiviert" desc="Bewerbung öffnen oder schließen. Geschlossene Bewerbungen nehmen keine Einsendungen an."><Toggle label="Aktiviert" checked={value.enabled} onChange={(v) => onChange({ enabled: v })} /></Box>
        <Box title="Name der Bewerbung" desc="Der Name der Bewerbung ({applicationName})."><Input aria-label="Name der Bewerbung" maxLength={60} value={name} onChange={(e) => onName(e.target.value)} /></Box>
        <Box title="Art der Bewerbung" desc={s.mode === 'WEB' ? 'Der Bot schickt beim Klick auf „Bewerben“ einen persönlichen Link – die Fragen werden im Browser ausgefüllt (gültig für das Zeitlimit).' : 'Wie die Person die Bewerbung ausfüllt.'}>
          <Select aria-label="Art der Bewerbung" value={s.mode} onChange={(e) => set({ mode: e.target.value as AppSettingsCfg['mode'] })}><option value="DM">Direktnachricht</option><option value="WEB">Web (Formular im Browser)</option></Select>
        </Box>
        <Box title="Kanal für offene Einsendungen" desc={pendingHint}><ChannelPicker ariaLabel="Kanal für offene Einsendungen" value={value.channelId} onChange={(id) => onChange({ channelId: id ?? '' })} /></Box>
        <Box title="Kanal für angenommene Einsendungen" desc="Angenommene Bewerbungen werden hier gepostet (am besten nur fürs Team sichtbar)."><ChannelPicker ariaLabel="Kanal für angenommene Einsendungen" value={value.acceptedChannelId} onChange={(id) => onChange({ acceptedChannelId: id ?? '' })} /></Box>
        <Box title="Kanal für abgelehnte Einsendungen" desc="Abgelehnte Bewerbungen werden hier gepostet (am besten nur fürs Team sichtbar)."><ChannelPicker ariaLabel="Kanal für abgelehnte Einsendungen" value={value.deniedChannelId} onChange={(id) => onChange({ deniedChannelId: id ?? '' })} /></Box>
      </Section>
      {questions}
      <section className="grid gap-2">
        <h3 className="text-base font-semibold">Nachrichten anpassen</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Message title="Nachricht bei Annahme" desc="Wird an die Person gesendet, wenn die Bewerbung angenommen wird." value={s.messages.accepted} onChange={(v) => msg({ accepted: v })} />
          <Message title="Nachricht bei Ablehnung" desc="Wird an die Person gesendet, wenn die Bewerbung abgelehnt wird." value={s.messages.denied} onChange={(v) => msg({ denied: v })} />
          <Message title="Bestätigungsnachricht" desc="Die erste Nachricht, die jemand beim Start der Bewerbung erhält." value={s.messages.confirmation} onChange={(v) => msg({ confirmation: v })} />
          <Message title="Abschlussnachricht" desc="Wird gesendet, wenn die Person die Bewerbung abgeschlossen hat." value={s.messages.completion} onChange={(v) => msg({ completion: v })} />
        </div>
      </section>
      <Section title="Rollen">
        <MatchRoles title="Gesperrte Rollen" desc="Personen mit diesen Rollen können sich nicht bewerben." verb="Gesperrt, wenn die Person" end="hat" rule={s.roles.restricted} onChange={(r) => roles({ restricted: r })} />
        <MatchRoles title="Erforderliche Rollen" desc="Diese Rollen werden für die Bewerbung benötigt." verb="Die Person muss" end="haben" rule={s.roles.required} onChange={(r) => roles({ required: r })} />
        {R('accepted', 'Rollen bei Annahme', 'Werden bei Annahme vergeben.')}
        {R('denied', 'Rollen bei Ablehnung', 'Werden bei Ablehnung vergeben.')}
        <Box title={`Ping-Rollen: ${value.pingRoleIds.length}`} desc="Werden erwähnt, wenn eine Bewerbung eingeht."><RolePicker ariaLabel="Ping-Rollen" value={value.pingRoleIds} onChange={(ids) => onChange({ pingRoleIds: ids })} /></Box>
        {R('acceptedRemove', 'Entfernen bei Annahme', 'Werden bei Annahme entfernt.')}
        {R('deniedRemove', 'Entfernen bei Ablehnung', 'Werden bei Ablehnung entfernt.')}
        {R('pending', 'Rollen während der Prüfung', 'Werden vergeben, solange die Bewerbung geprüft wird (nach der Entscheidung entfernt).')}
        {R('removeOnSubmit', 'Entfernen beim Absenden', 'Werden beim Absenden der Bewerbung entfernt.')}
        {R('managers', 'Bewerbungs-Verwalter', 'Nur Personen mit diesen Rollen können im Discord annehmen/ablehnen (leer = alle mit der Berechtigung).')}
      </Section>
      <Section title="Sonstiges">
        <Box title="Team-Threads" desc="Erstellt zu jeder Einsendung einen Thread, damit das Team darüber sprechen kann."><Toggle label="Team-Threads" checked={s.staffThreads} onChange={(v) => set({ staffThreads: v })} /></Box>
        <Box title="Wartezeit" desc="Wie lange jemand warten muss, bevor eine neue Bewerbung möglich ist."><Duration label="Wartezeit" minutes={s.cooldownMinutes} onChange={(m) => set({ cooldownMinutes: m })} /></Box>
        <Box title="Zeitlimit" desc="Wie lange man Zeit hat, die Bewerbung auszufüllen (min. 5 Minuten, max. 7 Tage)."><Duration label="Zeitlimit" minutes={s.timeLimitMinutes} onChange={(m) => set({ timeLimitMinutes: m })} /></Box>
        <Box title="Aktion beim Verlassen" desc="Was mit einer offenen Einsendung passiert, wenn die Person den Discord-Server verlässt (braucht den Server-Members-Intent).">
          <Select aria-label="Aktion beim Verlassen" value={s.onLeave} onChange={(e) => set({ onLeave: e.target.value as AppSettingsCfg['onLeave'] })}>
            <option value="NONE">Nichts tun</option><option value="DENY">Einsendung ablehnen</option><option value="WITHDRAW">Einsendung zurückziehen</option>
          </Select>
        </Box>
      </Section>
    </div>
  );
}
