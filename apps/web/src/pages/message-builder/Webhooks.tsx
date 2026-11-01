import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Pencil, PlugZap, Trash2, XCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { errText } from '../../lib/tickets';
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, fmt, Input, Modal, SkeletonRows } from '../../components/ui';
import type { Webhook } from './SendPanel';

/**
 * Webhook-Verwaltung: hinzufügen, Name und Standard-Absenderprofil bearbeiten, Namen in Discord ändern, Verbindung testen,
 * entfernen. Die Webhook-URL (enthält das Token) wird nur beim Hinzufügen eingegeben – sie wird verschlüsselt gespeichert und
 * nie wieder angezeigt.
 */
export function WebhooksTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['mb-webhooks'], queryFn: () => api<Webhook[]>('/message-builder/webhooks') });
  const done = () => void qc.invalidateQueries({ queryKey: ['mb-webhooks'] });
  const [form, setForm] = useState({ name: '', url: '', username: '', avatarUrl: '' });
  const [del, setDel] = useState<Webhook | null>(null);
  const [edit, setEdit] = useState<Webhook | null>(null);
  const [tested, setTested] = useState<Record<string, { ok: boolean; error: string | null }>>({});
  const add = useMutation({ mutationFn: () => api('/message-builder/webhooks', { method: 'POST', body: { name: form.name, url: form.url, username: form.username || null, avatarUrl: form.avatarUrl || null } }), onSuccess: () => { setForm({ name: '', url: '', username: '', avatarUrl: '' }); done(); } });
  const remove = useMutation({ mutationFn: (id: string) => api(`/message-builder/webhooks/${id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); done(); } });
  const test = useMutation({ mutationFn: (id: string) => api<{ ok: boolean; error: string | null }>(`/message-builder/webhooks/${id}/test`, { method: 'POST' }), onSuccess: (r, id) => { setTested((t) => ({ ...t, [id]: r })); done(); } });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card title="Webhooks">
        <p className="mb-3 text-xs text-muted">Standard ist immer der Bot. Ein Webhook wird nur benutzt, wenn er beim Senden als Nachrichtenprofil gewählt wird. Über Webhooks sind nur Link-Buttons möglich (keine Bot-Aktionen).</p>
        {q.isLoading ? <SkeletonRows rows={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : !q.data?.length ? <EmptyState text="Keine Webhooks eingerichtet." hint="Rechts einen Webhook hinzufügen (Discord: Kanal bearbeiten → Integrationen → Webhooks)." /> : (
          <ul className="grid gap-2">
            {q.data.map((w) => {
              const t = tested[w.id];
              const ok = t ? t.ok : w.lastCheckOk;
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-2">
                  {w.avatarUrl || w.discordAvatarUrl ? <img src={w.avatarUrl || w.discordAvatarUrl!} alt="" referrerPolicy="no-referrer" className="h-10 w-10 rounded-full object-cover" /> : <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full bg-[#5865f2] text-xs font-bold text-white">WH</span>}
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-medium">{w.name}</p>
                    <p className="text-xs text-muted">
                      Zielkanal: {w.channelName ? `${w.channelType === 'forum' ? 'Forum ' : '#'}${w.channelName}` : w.channelId ?? 'unbekannt'} · Absender: {w.username || w.discordName || '(Name aus Discord)'}{w.discordName ? ` · Discord-Name: ${w.discordName}` : ''}
                    </p>
                    <p className="flex items-center gap-1 text-xs">
                      {ok === true ? <><CheckCircle2 size={13} className="text-success" aria-hidden /><span className="text-success">Verbindung ok</span></> : ok === false ? <><XCircle size={13} className="text-danger" aria-hidden /><span className="text-danger">{t?.error ?? w.lastCheckError ?? 'Verbindung fehlgeschlagen'}</span></> : <span className="text-muted">Noch nicht getestet</span>}
                      {w.lastCheckAt && <span className="text-muted">· zuletzt geprüft {fmt(w.lastCheckAt)}</span>}
                      {!w.readable && <span className="text-danger">· URL nicht mehr lesbar (Schlüssel geändert) – neu anlegen</span>}
                    </p>
                  </div>
                  <span className="flex gap-1">
                    <Button size="sm" variant="secondary" disabled={test.isPending} onClick={() => test.mutate(w.id)}><PlugZap size={14} />{test.isPending && test.variables === w.id ? 'Teste …' : 'Testen'}</Button>
                    <Button size="sm" variant="ghost" aria-label={`Webhook ${w.name} bearbeiten`} onClick={() => setEdit(w)}><Pencil size={14} /></Button>
                    <Button size="sm" variant="ghost" aria-label={`Webhook ${w.name} entfernen`} className="hover:text-danger" onClick={() => setDel(w)}><Trash2 size={14} /></Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {test.isError && <p role="alert" className="mt-2 text-xs text-danger">{errText(test.error)}</p>}
      </Card>

      <Card title="Webhook hinzufügen">
        <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <label className="grid gap-1 text-xs text-muted">Name im Dashboard<Input aria-label="Webhook-Name" placeholder="z. B. Leitstelle" maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">Webhook-URL (geheim)<Input aria-label="Webhook-URL" type="password" autoComplete="off" placeholder="https://discord.com/api/webhooks/…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">Absendername (optional)<Input aria-label="Absendername" maxLength={80} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label className="grid gap-1 text-xs text-muted">Profilbild-URL (optional)<Input aria-label="Profilbild-URL" type="url" placeholder="https://…" value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} /></label>
          <Button type="submit" disabled={!form.name.trim() || !form.url.trim() || add.isPending}>{add.isPending ? 'Prüfe bei Discord …' : 'Hinzufügen'}</Button>
          {add.isError && <p role="alert" className="text-xs text-danger">{errText(add.error)}</p>}
          <p className="text-[11px] text-muted">Die URL wird bei Discord geprüft (muss zu diesem Server gehören), verschlüsselt gespeichert und nie wieder angezeigt – auch nicht in Logs oder API-Antworten.</p>
        </form>
      </Card>

      <EditWebhook w={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); done(); }} />
      <ConfirmDialog open={!!del} danger title="Webhook entfernen?" message={`„${del?.name}“ wird entfernt und die gespeicherte URL gelöscht. Der Webhook selbst bleibt in Discord bestehen; damit gesendete Nachrichten lassen sich danach nicht mehr bearbeiten.`} confirmLabel="Entfernen" busy={remove.isPending} onClose={() => setDel(null)} onConfirm={() => del && remove.mutate(del.id)} />
    </div>
  );
}

function EditWebhook({ w, onClose, onDone }: { w: Webhook | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', username: '', avatarUrl: '', discordName: '' });
  const [loaded, setLoaded] = useState<string | null>(null);
  if (w && loaded !== w.id) { setLoaded(w.id); setF({ name: w.name, username: w.username ?? '', avatarUrl: w.avatarUrl ?? '', discordName: w.discordName ?? '' }); }
  const save = useMutation({
    mutationFn: () => api(`/message-builder/webhooks/${w!.id}`, { method: 'PUT', body: { name: f.name, username: f.username || null, avatarUrl: f.avatarUrl || null, discordName: f.discordName && f.discordName !== w!.discordName ? f.discordName : null } }),
    onSuccess: () => { setLoaded(null); onDone(); },
  });
  return (
    <Modal open={!!w} title="Webhook bearbeiten" onClose={() => { setLoaded(null); onClose(); }}>
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <label className="grid gap-1 text-xs text-muted">Name im Dashboard<Input aria-label="Name im Dashboard" maxLength={60} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-1 text-xs text-muted">Standard-Absendername (je Nachricht überschreibbar)<Input aria-label="Standard-Absendername" maxLength={80} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></label>
        <label className="grid gap-1 text-xs text-muted">Standard-Profilbild (URL)<Input aria-label="Standard-Profilbild" type="url" value={f.avatarUrl} onChange={(e) => setF({ ...f, avatarUrl: e.target.value })} /></label>
        <label className="grid gap-1 text-xs text-muted">Name des Webhooks in Discord (wird bei Discord geändert)<Input aria-label="Name in Discord" maxLength={80} value={f.discordName} onChange={(e) => setF({ ...f, discordName: e.target.value })} /></label>
        <p className="text-[11px] text-muted">Kanal und Profilbild des Webhooks selbst lassen sich nur in Discord ändern. Das Standard-Profilbild hier wird bei jeder Nachricht mitgeschickt.</p>
        {save.isError && <p role="alert" className="text-xs text-danger">{errText(save.error)}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Abbrechen</Button><Button type="submit" disabled={!f.name.trim() || save.isPending}>Speichern</Button></div>
      </form>
    </Modal>
  );
}
