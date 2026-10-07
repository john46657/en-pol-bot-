import { useState } from 'react';
import { Button, Field, Modal, Textarea } from './ui';

type Status = 'ACCEPTED' | 'REJECTED';
/** Annehmen / Ablehnen – auch „mit Grund“ (der Grund geht per Discord-DM an die Person), wie die Buttons im Discord. */
export function DecisionButtons({ busy, onDecide }: { busy: boolean; onDecide: (status: Status, reason?: string) => void }) {
  const [ask, setAsk] = useState<Status | null>(null);
  const [reason, setReason] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="bg-success text-white" disabled={busy} onClick={() => onDecide('ACCEPTED')}>Annehmen</Button>
      <Button size="sm" variant="danger" disabled={busy} onClick={() => onDecide('REJECTED')}>Ablehnen</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setReason(''); setAsk('ACCEPTED'); }}>Annehmen mit Grund</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setReason(''); setAsk('REJECTED'); }}>Ablehnen mit Grund</Button>
      <Modal open={!!ask} title={ask === 'ACCEPTED' ? 'Annehmen mit Grund' : 'Ablehnen mit Grund'} onClose={() => setAsk(null)}>
        <div className="grid gap-3">
          <Field label="Grund (geht per Discord-DM an die Person)">{(id) => <Textarea id={id} rows={4} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAsk(null)}>Abbrechen</Button>
            <Button variant={ask === 'REJECTED' ? 'danger' : 'primary'} disabled={busy || reason.trim().length < 3} onClick={() => { onDecide(ask!, reason.trim()); setAsk(null); }}>Bestätigen</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
