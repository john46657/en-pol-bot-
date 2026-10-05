import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type DiscordChannel, type DiscordRole } from '../api';
import { errorText } from './QueryState';
import { useToast } from '../toast';

interface Embed {
  title?: string;
  description?: string;
  color?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
  footer?: string;
}
interface Rule {
  dm?: boolean;
  dmEmbed?: Embed;
  channelId?: string;
  channelEmbed?: Embed;
  mentionApplicant?: boolean;
  mentionRoleIds?: string[];
  buttons?: { label: string; url: string }[];
}
const EVENTS: [string, string][] = [
  ['started', 'Neue Bewerbung (gestartet)'],
  ['submitted', 'Bewerbung eingereicht'],
  ['accepted', 'Bewerbung angenommen'],
  ['denied', 'Bewerbung abgelehnt'],
  ['cancelled', 'Bewerbung abgebrochen'],
  ['expired', 'Bewerbung abgelaufen'],
  ['on_hold', 'Bewerbung zurückgestellt'],
  ['assigned', 'Bewerbung übernommen'],
];
/** Ereignisse mit Standard-DM an den Bewerber. */
const HAS_DEFAULT_DM = new Set(['accepted', 'denied', 'expired']);

/** Leere Werte entfernen (= Standard), damit die Konfiguration schlank bleibt. */
function clean(r: Rule): Rule | undefined {
  const e = (x?: Embed) => {
    if (!x) return undefined;
    const o = Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === 'string' && v.trim())) as Embed;
    return Object.keys(o).length ? o : undefined;
  };
  const out: Rule = {
    ...(r.dm === false ? { dm: false } : {}),
    ...(e(r.dmEmbed) && r.dm !== false ? { dmEmbed: e(r.dmEmbed) } : {}),
    ...(r.channelId ? { channelId: r.channelId, ...(e(r.channelEmbed) ? { channelEmbed: e(r.channelEmbed) } : {}), ...(r.mentionApplicant ? { mentionApplicant: true } : {}), ...(r.mentionRoleIds?.length ? { mentionRoleIds: r.mentionRoleIds } : {}) } : {}),
    ...((r.buttons ?? []).filter((b) => b.label.trim() && b.url.trim()).length ? { buttons: (r.buttons ?? []).filter((b) => b.label.trim() && b.url.trim()) } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}

function EmbedFields({ prefix, value, onChange, full }: { prefix: string; value: Embed | undefined; onChange: (e: Embed) => void; full?: boolean }) {
  const v = value ?? {};
  const f = (k: keyof Embed, label: string, max: number, ph = '') => (
    <label className="fld"><span>{label}</span><input aria-label={`${prefix}: ${label}`} maxLength={max} placeholder={ph} value={v[k] ?? ''} onChange={(e) => onChange({ ...v, [k]: e.target.value })} /></label>
  );
  return (
    <>
      {f('title', 'Titel', 256)}
      <label className="fld"><span>Beschreibung (Platzhalter: {'{user}'}, {'{applicationName}'}, {'{reviewer}'}, {'{reason}'}, {'{wartezeit}'})</span><textarea aria-label={`${prefix}: Beschreibung`} maxLength={4000} rows={3} value={v.description ?? ''} onChange={(e) => onChange({ ...v, description: e.target.value })} /></label>
      <label className="fld"><span>Farbe</span><input aria-label={`${prefix}: Farbe`} type="color" value={v.color ?? '#5865f2'} onChange={(e) => onChange({ ...v, color: e.target.value })} /></label>
      {full && (
        <>
          {f('thumbnailUrl', 'Vorschaubild (https-Adresse)', 500, 'https://…')}
          {f('imageUrl', 'Bild (https-Adresse)', 500, 'https://…')}
          {f('footer', 'Fußzeile', 2048)}
        </>
      )}
    </>
  );
}

/** Benachrichtigungen je Ereignis (Team-Chance): DM an/aus mit eigenem Embed, Kanal mit Erwähnungen und Link-Knöpfen. */
export function NotificationSettings({ guildId, applicationId }: { guildId: string; applicationId: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const g = `/guilds/${guildId}`;
  const base = `${g}/applications/${applicationId}`;
  const app = useQuery({ queryKey: ['application-config', applicationId], queryFn: () => api<{ config: { notifications?: Record<string, Rule> } | null }>(base) });
  const channels = useQuery({ queryKey: ['channels', g], queryFn: () => api<DiscordChannel[]>(`${g}/discord/channels`), retry: false });
  const roles = useQuery({ queryKey: ['roles', guildId], queryFn: () => api<DiscordRole[]>(`${g}/discord/roles`), retry: false });
  const [draft, setDraft] = useState<Record<string, Rule> | null>(null);
  const rules = draft ?? app.data?.config?.notifications ?? {};
  const set = (ev: string, patch: Partial<Rule>) => setDraft({ ...rules, [ev]: { ...(rules[ev] ?? {}), ...patch } });
  const save = useMutation({
    mutationFn: () => {
      const out: Record<string, Rule> = {};
      for (const [ev, r] of Object.entries(rules)) {
        const c = clean(r);
        if (c) out[ev] = c;
      }
      return api(base, { method: 'PATCH', body: { config: { notifications: out } } });
    },
    onSuccess: () => {
      toast.success('Benachrichtigungen gespeichert.');
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['application-config', applicationId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  if (!app.data) return null;
  const textChannels = (channels.data ?? []).filter((c) => c.kind === 'text');
  return (
    <div className="card comp">
      <h3>Benachrichtigungen</h3>
      <p className="muted">Je Ereignis: Direktnachricht an den Bewerber (Standard, eigenes Embed oder keine) und eine Nachricht in einen Kanal. Nicht eingestellte Ereignisse verhalten sich wie bisher.</p>
      {EVENTS.map(([ev, label]) => {
        const r = rules[ev] ?? {};
        const dmMode = r.dm === false ? 'off' : r.dmEmbed && (r.dmEmbed.title || r.dmEmbed.description) ? 'embed' : r.dmEmbed ? 'embed' : 'default';
        return (
          <details key={ev} className="fld">
            <summary>{label}{r.channelId ? ' · Kanal' : ''}{r.dm === false ? ' · keine DM' : r.dmEmbed ? ' · eigene DM' : ''}</summary>
            <label className="fld">
              <span>Direktnachricht an den Bewerber</span>
              <select aria-label={`${label}: Direktnachricht`} value={dmMode} onChange={(e) => (e.target.value === 'off' ? set(ev, { dm: false, dmEmbed: undefined }) : e.target.value === 'embed' ? set(ev, { dm: true, dmEmbed: r.dmEmbed ?? { title: label } }) : set(ev, { dm: undefined, dmEmbed: undefined }))}>
                <option value="default">{HAS_DEFAULT_DM.has(ev) ? 'Standard-Nachricht' : 'Keine (Standard)'}</option>
                <option value="embed">Eigenes Embed</option>
                <option value="off">Keine Direktnachricht</option>
              </select>
            </label>
            {dmMode === 'embed' && <EmbedFields prefix={`${label} DM`} value={r.dmEmbed} onChange={(e) => set(ev, { dmEmbed: e })} />}
            <label className="fld">
              <span>Nachricht in Kanal</span>
              <select aria-label={`${label}: Kanal`} value={r.channelId ?? ''} onChange={(e) => set(ev, { channelId: e.target.value || undefined })}>
                <option value="">– keine –</option>
                {textChannels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </label>
            {r.channelId && (
              <>
                <label className="fld"><span><input type="checkbox" checked={!!r.mentionApplicant} onChange={(e) => set(ev, { mentionApplicant: e.target.checked })} /> Bewerber erwähnen</span></label>
                <details className="fld">
                  <summary>Rollen erwähnen: {(r.mentionRoleIds ?? []).length || 'keine'}</summary>
                  <ul className="plain">
                    {(roles.data ?? []).filter((x) => x.id !== guildId).map((x) => (
                      <li key={x.id}><label><input type="checkbox" checked={(r.mentionRoleIds ?? []).includes(x.id)} onChange={(e) => set(ev, { mentionRoleIds: e.target.checked ? [...(r.mentionRoleIds ?? []), x.id].slice(0, 10) : (r.mentionRoleIds ?? []).filter((y) => y !== x.id) })} /> @{x.name}</label></li>
                    ))}
                  </ul>
                </details>
                <EmbedFields prefix={`${label} Kanal`} value={r.channelEmbed} onChange={(e) => set(ev, { channelEmbed: e })} full />
              </>
            )}
            <div className="fld">
              <span>Link-Knöpfe (höchstens 5, nur https)</span>
              {(r.buttons ?? []).map((b, i) => (
                <div key={i} className="actions">
                  <input className="inline-input" aria-label={`${label}: Knopf ${i + 1} Beschriftung`} placeholder="Beschriftung" maxLength={80} value={b.label} onChange={(e) => set(ev, { buttons: (r.buttons ?? []).map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                  <input className="inline-input" aria-label={`${label}: Knopf ${i + 1} Adresse`} placeholder="https://…" maxLength={500} value={b.url} onChange={(e) => set(ev, { buttons: (r.buttons ?? []).map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <button className="btn" onClick={() => set(ev, { buttons: (r.buttons ?? []).filter((_, j) => j !== i) })}>Entfernen</button>
                </div>
              ))}
              {(r.buttons ?? []).length < 5 && <button className="btn" onClick={() => set(ev, { buttons: [...(r.buttons ?? []), { label: '', url: '' }] })}>+ Knopf</button>}
            </div>
          </details>
        );
      })}
      <div className="actions">
        <button className="btn primary" disabled={!draft || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Speichere …' : 'Benachrichtigungen speichern'}</button>
      </div>
    </div>
  );
}
