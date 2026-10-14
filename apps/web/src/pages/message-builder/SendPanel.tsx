import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, FlaskConical, Send, XCircle } from 'lucide-react';
import { hasErrors, mbSummary, missingBotPerms, type MbDocumentData, type MbIssue } from '@enrp/shared';
import { api } from '../../lib/api';
import { errText } from '../../lib/tickets';
import { Badge, Button, Modal, Select, type Tone } from '../../components/ui';
import type { ServerChannel } from './MessageEditor';

export interface SendItem { position: number; summary: string; status: string; messageId: string | null; error: string | null; sentAt: string | null }
export interface SendRecord { id: string; documentName: string; mode: string; channelId: string | null; channelName: string | null; status: string; error: string | null; createdByName: string; createdAt: string; finishedAt: string | null; items: SendItem[]; guildId?: string | null; payloads?: unknown[]; warnings?: MbIssue[] }
export interface Webhook { id: string; name: string; webhookId: string; channelId: string | null; channelName: string | null; readable: boolean }

export const SEND_STATUS: Record<string, [string, Tone]> = {
  QUEUED: ['Wartet auf den Bot', 'warning'], SENDING: ['Wird gesendet', 'info'], SENT: ['Gesendet', 'success'], PARTIAL: ['Teilweise gesendet', 'warning'], FAILED: ['Fehlgeschlagen', 'danger'], TEST: ['Testlauf (nichts gesendet)', 'neutral'],
  PENDING: ['Ausstehend', 'warning'], SKIPPED: ['Nicht gesendet', 'neutral'],
};
export const MODE_LABEL: Record<string, string> = { BOT: 'Bot', WEBHOOK: 'Webhook', TEST: 'Test' };
export const StatusTag = ({ s }: { s: string }) => <Badge tone={SEND_STATUS[s]?.[1] ?? 'neutral'}>{SEND_STATUS[s]?.[0] ?? s}</Badge>;
const FINAL = ['SENT', 'PARTIAL', 'FAILED', 'TEST'];
export const messageLink = (guildId: string | null | undefined, channelId: string | null, messageId: string | null) => (guildId && channelId && messageId ? `https://discord.com/channels/${guildId}/${channelId}/${messageId}` : null);

/** Ergebnis eines Versands mit Status je Nachricht (aktualisiert sich, bis der Bot fertig ist). */
export function SendResult({ id, initial }: { id: string; initial?: SendRecord }) {
  const q = useQuery({ queryKey: ['mb-send', id], queryFn: () => api<SendRecord>(`/message-builder/sends/${id}`), initialData: initial, refetchInterval: (query) => (FINAL.includes(query.state.data?.status ?? '') ? false : 2000) });
  const s = q.data;
  if (!s) return null;
  return (
    <div className="grid gap-2 rounded-md border border-line p-3" role="status" aria-live="polite" aria-label="Versandstatus">
      <div className="flex flex-wrap items-center gap-2 text-sm"><StatusTag s={s.status} /><span className="text-muted">{MODE_LABEL[s.mode]} → {s.channelName ? `#${s.channelName}` : s.channelId ?? '—'}</span></div>
      {s.status === 'QUEUED' && <p className="text-xs text-muted">Der Bot holt Aufträge alle paar Sekunden ab. Läuft er nicht, wird der Auftrag nach 10 Minuten als fehlgeschlagen markiert – es wird dann nichts gesendet.</p>}
      <ol className="grid gap-1 text-xs">
        {s.items.map((i) => {
          const link = messageLink(s.guildId, s.channelId, i.messageId);
          return (
            <li key={i.position} className="flex flex-wrap items-center gap-2">
              {i.status === 'SENT' ? <CheckCircle2 size={14} className="text-success" aria-hidden /> : i.status === 'FAILED' ? <XCircle size={14} className="text-danger" aria-hidden /> : <span className="inline-block w-3.5" />}
              <span>Nachricht {i.position + 1} ({i.summary})</span><StatusTag s={i.status} />
              {link && <a className="text-primary hover:underline" href={link} target="_blank" rel="noreferrer">in Discord öffnen</a>}
              {i.error && <span className="basis-full pl-5 text-danger">{i.error}</span>}
            </li>
          );
        })}
      </ol>
      {s.payloads && (
        <details className="text-xs"><summary className="cursor-pointer text-muted">Discord-Daten anzeigen (so würde gesendet)</summary><pre className="mt-1 max-h-72 overflow-auto rounded bg-bg p-2">{JSON.stringify(s.payloads, null, 2)}</pre></details>
      )}
    </div>
  );
}

/** Versand: Bot (Standard), Testmodus oder ausdrücklich gewählter Webhook. Mit Bestätigung. */
export function SendPanel({ data, name, documentId, channelId, onChannel, channels, issues, can, webhooks, mode, onMode }: {
  data: MbDocumentData; name: string; documentId: string | null; channelId: string | null; onChannel: (id: string | null) => void; channels: ServerChannel[];
  issues: MbIssue[]; can: (p: string) => boolean; webhooks: Webhook[]; mode: 'bot' | 'test' | 'webhook'; onMode: (m: 'bot' | 'test' | 'webhook') => void;
}) {
  const [webhookId, setWebhookId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [last, setLast] = useState<SendRecord | null>(null);
  const ch = channels.find((c) => c.id === channelId);
  const miss = ch?.bot && mode !== 'webhook' ? missingBotPerms(ch.bot, data) : [];
  const errors = issues.filter((i) => i.level === 'error'), warnings = issues.filter((i) => i.level === 'warning');
  const hook = webhooks.find((w) => w.id === webhookId);
  const blocked = hasErrors(issues) || (mode === 'webhook' ? !hook : !ch || !ch.allowed || miss.length > 0);
  const send = useMutation({
    mutationFn: () => api<SendRecord>('/message-builder/send', { method: 'POST', body: { documentId, name, data, mode, channelId: mode === 'webhook' ? null : channelId, webhookId: mode === 'webhook' ? webhookId : null, confirm: true } }),
    onSuccess: (r) => { setLast(r); setConfirm(false); },
  });
  const canSend = can('messagebuilder.send'), canTest = can('messagebuilder.create'), canHook = canSend && can('messagebuilder.webhooks');
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Versandweg">
        {([['bot', 'Über den Bot', 'Standard', canSend], ['test', 'Testmodus', 'nichts wird gesendet', canTest], ['webhook', 'Webhook', 'optional', canHook]] as const).map(([k, label, hint, ok]) => (
          <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${mode === k ? 'border-primary bg-primary/10' : 'border-line'} ${ok ? '' : 'cursor-not-allowed opacity-50'}`}>
            <input type="radio" name="mb-mode" className="mt-1" checked={mode === k} disabled={!ok} onChange={() => onMode(k)} />
            <span><span className="block font-medium">{label}</span><span className="text-xs text-muted">{ok ? hint : 'Recht fehlt'}</span></span>
          </label>
        ))}
      </div>
      {mode === 'webhook' ? (
        <div className="grid gap-1">
          <Select aria-label="Webhook" value={webhookId} onChange={(e) => setWebhookId(e.target.value)}>
            <option value="">— Webhook wählen —</option>
            {webhooks.map((w) => <option key={w.id} value={w.id} disabled={!w.readable}>{w.name}{w.channelName ? ` (#${w.channelName})` : ''}{w.readable ? '' : ' – nicht lesbar'}</option>)}
          </Select>
          <p className="text-xs text-warning">Achtung: Diese Nachrichten kommen NICHT vom Bot, sondern vom gewählten Webhook (eigener Name/Bild, nur Link-Buttons).</p>
          {!webhooks.length && <p className="text-xs text-muted">Noch keine Webhooks eingerichtet (Reiter „Einstellungen“).</p>}
        </div>
      ) : (
        <div className="grid gap-1">
          <Select aria-label="Discord-Kanal" value={channelId ?? ''} onChange={(e) => onChannel(e.target.value || null)}>
            <option value="">— Kanal wählen —</option>
            {channels.map((c) => <option key={c.id} value={c.id} disabled={!c.allowed || (c.bot ? !c.bot.view || !c.bot.send : false)}>#{c.name}{c.category ? ` (${c.category})` : ''}{!c.allowed ? ' – nicht freigegeben' : c.bot && (!c.bot.view || !c.bot.send) ? ' – Bot darf hier nicht senden' : ''}</option>)}
          </Select>
          {!channels.length && <p className="text-xs text-warning">Keine Kanäle bekannt – läuft der Bot, und ist der Discord-Server eingerichtet?</p>}
          {ch && !ch.bot && <p className="text-xs text-muted">Die Rechte des Bots in diesem Kanal sind noch nicht gemeldet; sie werden beim Senden geprüft.</p>}
          {miss.length > 0 && <p role="alert" className="text-xs text-danger">Dem Bot fehlen in #{ch!.name}: {miss.join(', ')}.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={blocked || send.isPending} onClick={() => { send.reset(); setConfirm(true); }}>{mode === 'test' ? <FlaskConical size={16} /> : <Send size={16} />}{mode === 'test' ? 'Testlauf starten …' : `${data.messages.length} Nachricht${data.messages.length === 1 ? '' : 'en'} senden …`}</Button>
        {errors.length > 0 && <span className="text-xs text-danger">{errors.length} Fehler – erst beheben</span>}
        {!errors.length && warnings.length > 0 && <span className="text-xs text-warning">{warnings.length} Hinweis{warnings.length > 1 ? 'e' : ''}</span>}
      </div>
      {last && <SendResult key={last.id} id={last.id} initial={last} />}
      <Modal open={confirm} title={mode === 'test' ? 'Testlauf bestätigen' : 'Versand bestätigen'} onClose={() => setConfirm(false)}>
        <div className="grid gap-3 text-sm">
          <p>{mode === 'test' ? 'Alles wird wie beim echten Versand geprüft, aber es wird NICHTS an Discord gesendet.' : <>Diese Nachrichten werden jetzt {mode === 'webhook' ? <>über den Webhook <b>{hook?.name}</b></> : <>vom Bot in <b>#{ch?.name}</b></>} gesendet. Gesendete Nachrichten lassen sich hier nicht zurückholen.</>}</p>
          <ol className="list-decimal pl-5 text-xs text-muted">{data.messages.map((m) => <li key={m.id}>{mbSummary(m)}</li>)}</ol>
          {warnings.length > 0 && <ul className="grid gap-0.5 text-xs text-warning">{warnings.map((w, i) => <li key={i}>⚠ {w.where}: {w.message}</li>)}</ul>}
          {send.isError && <p role="alert" className="text-xs text-danger">{errText(send.error)}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Abbrechen</Button>
            <Button disabled={send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sende …' : mode === 'test' ? 'Testlauf starten' : 'Jetzt senden'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
