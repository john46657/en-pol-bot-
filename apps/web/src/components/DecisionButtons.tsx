import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { errText } from '../lib/tickets';
import { Button, Field, fmt, Modal, StatusBadge, Textarea } from './ui';

type Status = 'ACCEPTED' | 'REJECTED';
const GREEN = 'bg-[#248046] text-white hover:bg-[#1a6334]', RED = 'bg-[#da373c] text-white hover:bg-[#a12828]', BLURPLE = 'bg-[#5865f2] text-white hover:bg-[#4752c4]';

/** Annehmen / Ablehnen – auch „mit Grund“ (der Grund geht per Discord-DM an die Person), wie die Buttons im Discord. */
export function DecisionButtons({ busy, onDecide }: { busy: boolean; onDecide: (status: Status, reason?: string) => void }) {
  const [ask, setAsk] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  return (
    <>
      <Button size="sm" className={GREEN} disabled={busy} onClick={() => onDecide('ACCEPTED')}>Annehmen</Button>
      <Button size="sm" className={RED} disabled={busy} onClick={() => onDecide('REJECTED')}>Ablehnen</Button>
      <Button size="sm" className={GREEN} disabled={busy} onClick={() => { setReason(''); setAsk('ACCEPTED'); }}>Annehmen mit Grund</Button>
      <Button size="sm" className={RED} disabled={busy} onClick={() => { setReason(''); setAsk('REJECTED'); }}>Ablehnen mit Grund</Button>
      <Modal open={!!ask} title={ask === 'ACCEPTED' ? 'Annehmen mit Grund' : 'Ablehnen mit Grund'} onClose={() => setAsk(null)}>
        <div className="grid gap-3">
          <Field label="Grund (geht per Discord-DM an die Person)">{(id) => <Textarea id={id} rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAsk(null)}>Abbrechen</Button>
            <Button variant={ask === 'REJECTED' ? 'danger' : 'primary'} disabled={busy || reason.trim().length < 3} onClick={() => { onDecide(ask!, reason.trim()); setAsk(null); }}>Bestätigen</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

interface HistoryRow { id: string; number: string; status: string; createdAt: string; decisionReason: string | null; unitName?: string }

/** Frühere Bewerbungen (EN Polizei + Qualifikationen) einer Discord-ID – wie der Button „Verlauf“ in Discord. */
function HistoryModal({ discordId, name, onClose }: { discordId: string; name: string; onClose: () => void }) {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['application-history', discordId],
    queryFn: async () => {
      const [police, quali] = await Promise.all([
        can('applications.view') ? api<HistoryRow[]>('/applications/history', { query: { discordId } }) : Promise.resolve([]),
        can('qualifications.view') ? api<HistoryRow[]>('/qualifications/history', { query: { discordId } }) : Promise.resolve([]),
      ]);
      return [...police.map((r) => ({ ...r, unitName: 'EN Polizei' })), ...quali].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
  });
  return (
    <Modal open title={`🗂️ Bewerbungs-Verlauf · ${name}`} onClose={onClose}>
      {q.isLoading ? <p className="text-sm text-muted">Lädt …</p> : q.error ? <p role="alert" className="text-sm text-danger">{errText(q.error)}</p> : !q.data?.length ? <p className="text-sm text-muted">Keine Bewerbungen.</p> : (
        <ul className="grid gap-2 text-sm">{q.data.map((r) => (
          <li key={r.id} className="rounded-md border border-line p-2">
            <p className="flex flex-wrap items-center gap-2"><strong>{r.number}</strong> · {r.unitName} <StatusBadge status={r.status} /> <span className="text-xs text-muted">{fmt(r.createdAt)}</span></p>
            {r.decisionReason && <p className="mt-1 text-xs text-muted">↳ {r.decisionReason}</p>}
          </li>
        ))}</ul>
      )}
    </Modal>
  );
}

/**
 * Alle Buttons einer Bewerbung wie unter der Discord-Nachricht: Annehmen, Ablehnen, mit Grund, Verlauf,
 * 🎫 Ticket mit Bewerber öffnen und Details. `ticketPath`: API-Pfad zum Öffnen des Tickets.
 */
export function ApplicationActions({ open, canDecide, busy, onDecide, discordId, name, ticketPath, detailsTo }: {
  open: boolean; canDecide: boolean; busy: boolean; onDecide: (status: Status, reason?: string) => void;
  discordId: string | null; name: string; ticketPath: string; detailsTo?: string;
}) {
  const [history, setHistory] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const ticket = useMutation({
    mutationFn: () => api<{ queued: boolean; linked: boolean }>(ticketPath, { method: 'POST' }),
    onSuccess: (r) => setMsg({ ok: true, text: `Ticket wird angelegt – der Bot öffnet gleich einen privaten Kanal mit ${name}${r.linked ? ' und dir' : ' (dein Konto ist nicht mit Discord verknüpft – du wirst nicht hinzugefügt, die Team-Rolle schon)'}.` }),
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        {open && canDecide && <DecisionButtons busy={busy} onDecide={onDecide} />}
        {discordId && <Button size="sm" className={BLURPLE} onClick={() => setHistory(true)}>Verlauf</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {discordId && <Button size="sm" variant="secondary" disabled={ticket.isPending} onClick={() => { setMsg(undefined); ticket.mutate(); }}>🎫 Ticket mit Bewerber öffnen</Button>}
        {detailsTo && <Link to={detailsTo}><Button size="sm" variant="secondary">Details & Prüfschritte <ExternalLink size={14} aria-hidden className="ml-1 inline" /></Button></Link>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-xs ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      {history && discordId && <HistoryModal discordId={discordId} name={name} onClose={() => setHistory(false)} />}
    </div>
  );
}
