import { useState, type ReactNode } from 'react';
import { Tag } from 'lucide-react';
import { APPLICATION_VARIABLES, DEFAULT_APPLICATION_MESSAGES } from '@enrp/shared';
import { ChannelPicker, RolePicker } from './DiscordPickers';
import { Input, Select, Textarea } from './ui';

type Mode = 'ALL' | 'ANY';
export interface AppSettingsCfg {
  messages: { accepted: string; denied: string; confirmation: string; completion: string };
  roles: { restricted: { ids: string[]; mode: Mode }; required: { ids: string[]; mode: Mode }; accepted: string[]; denied: string[]; acceptedRemove: string[]; deniedRemove: string[]; pending: string[]; removeOnSubmit: string[]; managers: string[] };
  staffThreads: boolean; cooldownMinutes: number; timeLimitMinutes: number;
}
/** Was jede Bewerbung (Polizei und jede Einheit) gemeinsam hat. */
export interface AppCommon { enabled: boolean; channelId?: string; acceptedChannelId?: string; deniedChannelId?: string; pingRoleIds: string[]; settings: AppSettingsCfg }

export const defaultAppSettings = (): AppSettingsCfg => ({
  messages: { ...DEFAULT_APPLICATION_MESSAGES },
  roles: { restricted: { ids: [], mode: 'ANY' }, required: { ids: [], mode: 'ANY' }, accepted: [], denied: [], acceptedRemove: [], deniedRemove: [], pending: [], removeOnSubmit: [], managers: [] },
  staffThreads: false, cooldownMinutes: 0, timeLimitMinutes: 180,
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
      <label className="grid gap-1 text-xs text-muted">Days<Input aria-label={`${label} days`} type="number" min={0} className="w-20" value={d} onChange={(e) => set(num(e.target.value), h, m)} /></label>
      <label className="grid gap-1 text-xs text-muted">Hours<Input aria-label={`${label} hours`} type="number" min={0} max={23} className="w-20" value={h} onChange={(e) => set(d, num(e.target.value), m)} /></label>
      <label className="grid gap-1 text-xs text-muted">Minutes<Input aria-label={`${label} minutes`} type="number" min={0} max={59} className="w-20" value={m} onChange={(e) => set(d, h, num(e.target.value))} /></label>
    </div>
  );
}
function Message({ title, desc, value, onChange }: { title: string; desc: string; value: string; onChange: (v: string) => void }) {
  const [vars, setVars] = useState(false);
  return (
    <div className="grid content-start gap-2 rounded-lg border border-line bg-panel-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><p className="font-semibold">{title}</p><p className="text-xs text-muted">{desc}</p></div>
        <button type="button" aria-expanded={vars} onClick={() => setVars(!vars)} className="inline-flex items-center gap-1 rounded bg-success/10 px-2 py-1 text-xs font-semibold text-success"><Tag size={14} aria-hidden />{vars ? 'Hide variables' : 'Show variables'}</button>
      </div>
      {vars && <ul className="grid gap-0.5 text-xs">{Object.entries(APPLICATION_VARIABLES).map(([k, v]) => <li key={k}><button type="button" className="font-mono text-primary" onClick={() => onChange(`${value}${k}`)}>{k}</button> <span className="text-muted">{v}</span></li>)}</ul>}
      <Textarea aria-label={title} rows={5} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
function MatchRoles({ title, desc, rule, onChange, verb }: { title: string; desc: string; rule: { ids: string[]; mode: Mode }; onChange: (r: { ids: string[]; mode: Mode }) => void; verb: string }) {
  return (
    <Box title={`${title}: ${rule.ids.length}`} desc={desc}>
      <div className="rounded-md bg-bg/60 p-2 text-xs">
        <p className="mb-1 font-semibold">Match mode</p>
        <div className="mb-1 flex gap-1" role="radiogroup" aria-label={`${title} match mode`}>
          {(['ALL', 'ANY'] as Mode[]).map((m) => <button key={m} type="button" role="radio" aria-checked={rule.mode === m} onClick={() => onChange({ ...rule, mode: m })} className={`rounded px-2 py-1 ${rule.mode === m ? 'bg-primary text-primary-fg' : 'bg-panel-2'}`}>{m === 'ALL' ? 'Has all roles' : 'Has any role'}</button>)}
        </div>
        <p className="text-muted">{verb} {rule.mode === 'ALL' ? <b>ALL</b> : <b>ANY</b>} of the listed roles.</p>
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
      <Section title="Requirements">
        <Box title="Enabled" desc="Open or close the application. Closed applications receive no submissions."><Toggle label="Enabled" checked={value.enabled} onChange={(v) => onChange({ enabled: v })} /></Box>
        <Box title="Application name" desc="The name of the application ({applicationName})."><Input aria-label="Application name" maxLength={60} value={name} onChange={(e) => onName(e.target.value)} /></Box>
        <Box title="Application type" desc="How the applicant fills out the application."><Select aria-label="Application type" value="DM" disabled><option value="DM">Direct Message</option></Select></Box>
        <Box title="Pending Submission Channel" desc={pendingHint}><ChannelPicker ariaLabel="Pending submission channel" value={value.channelId} onChange={(id) => onChange({ channelId: id ?? '' })} /></Box>
        <Box title="Accepted Submission Channel" desc="Accepted applications are posted here (staff only recommended)."><ChannelPicker ariaLabel="Accepted submission channel" value={value.acceptedChannelId} onChange={(id) => onChange({ acceptedChannelId: id ?? '' })} /></Box>
        <Box title="Denied Submission Channel" desc="Denied applications are posted here (staff only recommended)."><ChannelPicker ariaLabel="Denied submission channel" value={value.deniedChannelId} onChange={(id) => onChange({ deniedChannelId: id ?? '' })} /></Box>
      </Section>
      {questions}
      <section className="grid gap-2">
        <h3 className="text-base font-semibold">Embed Customization</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <Message title="Accepted Message" desc="Sent to the applicant when the application is accepted." value={s.messages.accepted} onChange={(v) => msg({ accepted: v })} />
          <Message title="Denied Message" desc="Sent to the applicant when the application is denied." value={s.messages.denied} onChange={(v) => msg({ denied: v })} />
          <Message title="Confirmation Message" desc="The first message someone receives when starting the application." value={s.messages.confirmation} onChange={(v) => msg({ confirmation: v })} />
          <Message title="Completion Message" desc="Sent when the applicant has completed the application." value={s.messages.completion} onChange={(v) => msg({ completion: v })} />
        </div>
      </section>
      <Section title="Role Config">
        <MatchRoles title="Restricted Roles" desc="Users with these roles cannot apply." verb="User is restricted if they have" rule={s.roles.restricted} onChange={(r) => roles({ restricted: r })} />
        <MatchRoles title="Required Roles" desc="Users need these roles to apply." verb="User is required to have" rule={s.roles.required} onChange={(r) => roles({ required: r })} />
        {R('accepted', 'Accepted Roles', 'Given to the applicant when accepted.')}
        {R('denied', 'Denied Roles', 'Given to the applicant when denied.')}
        <Box title={`Ping Roles: ${value.pingRoleIds.length}`} desc="Mentioned when an application is submitted."><RolePicker ariaLabel="Ping Roles" value={value.pingRoleIds} onChange={(ids) => onChange({ pingRoleIds: ids })} /></Box>
        {R('acceptedRemove', 'Accepted Removal Roles', 'Removed from the applicant when accepted.')}
        {R('deniedRemove', 'Denied Removal Roles', 'Removed from the applicant when denied.')}
        {R('pending', 'Pending Roles', 'Given while the application is pending review (removed after the decision).')}
        {R('removeOnSubmit', 'Remove roles on submit', 'Removed from the applicant when they submit.')}
        {R('managers', 'Application Manager Roles', 'Only people with these roles can accept/deny in Discord (empty = everyone with the permission).')}
      </Section>
      <Section title="Other">
        <Box title="Staff Threads" desc="Creates a thread for each submission so the team can discuss it."><Toggle label="Staff Threads" checked={s.staffThreads} onChange={(v) => set({ staffThreads: v })} /></Box>
        <Box title="Application cooldown" desc="How long a user must wait before submitting a new application."><Duration label="Cooldown" minutes={s.cooldownMinutes} onChange={(m) => set({ cooldownMinutes: m })} /></Box>
        <Box title="Time Limit" desc="How long users have to complete the application (min. 5 minutes, max. 7 days)."><Duration label="Time limit" minutes={s.timeLimitMinutes} onChange={(m) => set({ timeLimitMinutes: m })} /></Box>
      </Section>
    </div>
  );
}
