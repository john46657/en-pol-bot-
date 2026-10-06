import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Modal } from './ui';

/** Eigenes Discord-Konto mit dem Systembenutzer verknüpfen (Einmal-Code, 10 Minuten gültig). */
export function DiscordLink() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<{ code: string; expiresAt: string }>();
  const [err, setErr] = useState<string>();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['discord-link'], queryFn: () => api<{ linked: boolean; discordId: string | null }>('/discord/link'), enabled: open });
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ discord: boolean }>('/auth/providers'), enabled: open });
  const onError = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Failed');
  const create = useMutation({ mutationFn: () => api<{ code: string; expiresAt: string }>('/discord/link-code', { method: 'POST' }), onSuccess: (c) => { setCode(c); setErr(undefined); }, onError });
  const unlink = useMutation({ mutationFn: () => api('/discord/link', { method: 'DELETE' }), onSuccess: () => { setCode(undefined); setErr(undefined); void qc.invalidateQueries({ queryKey: ['discord-link'] }); }, onError });
  return (
    <>
      <Button variant="ghost" aria-label="Link Discord" onClick={() => setOpen(true)}><MessageCircle size={16} /></Button>
      <Modal open={open} title="Discord verknüpfen" onClose={() => { setOpen(false); setCode(undefined); }}>
        <div className="space-y-3 text-sm">
          {err && <p role="alert" className="text-danger">{err}</p>}
          {status.data?.linked ? (
            <>
              <p><Badge tone="success">verknüpft</Badge> Discord-ID <code>{status.data.discordId}</code></p>
              <p className="text-muted">Der Discord-Bot führt Befehle mit deinen Rechten aus. Du kannst die Verknüpfung jederzeit lösen.</p>
              <div className="flex justify-end"><Button variant="danger" disabled={unlink.isPending} onClick={() => unlink.mutate()}>Verknüpfung lösen</Button></div>
            </>
          ) : code ? (
            <>
              <p>Gib im Discord diesen Befehl ein:</p>
              <p className="rounded border border-line bg-bg p-3 font-mono text-lg" data-testid="link-code">/verknuepfen code:{code.code}</p>
              <p className="text-xs text-muted">Gültig bis {new Date(code.expiresAt).toLocaleTimeString()} · einmal verwendbar</p>
            </>
          ) : (
            <>
              <p className="text-muted">Mit einem Einmal-Code verknüpfst du dein Discord-Konto. Danach kannst du Personen, Kennzeichen und Einsätze direkt im Discord abfragen und deinen Dienststatus setzen — immer mit deinen Rechten.</p>
              <div className="flex flex-wrap justify-end gap-2">
                {providers.data?.discord && <a href="/api/v1/auth/discord/link" className="rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4752c4]">Mit Discord verknüpfen</a>}
                <Button variant={providers.data?.discord ? 'secondary' : 'primary'} disabled={create.isPending || status.isLoading} onClick={() => create.mutate()}>Code erzeugen</Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
