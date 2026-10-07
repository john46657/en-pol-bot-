import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { Badge, Button, Modal } from './ui';

/** Eigenes Discord-Konto mit dem Systembenutzer verknüpfen (über die Discord-Anmeldung). */
export function DiscordLink() {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string>();
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['discord-link'], queryFn: () => api<{ linked: boolean; discordId: string | null }>('/discord/link'), enabled: open });
  const providers = useQuery({ queryKey: ['auth-providers'], queryFn: () => api<{ discord: boolean }>('/auth/providers'), enabled: open });
  const onError = (e: unknown) => setErr(e instanceof ApiError ? e.message : 'Fehlgeschlagen');
  const unlink = useMutation({ mutationFn: () => api('/discord/link', { method: 'DELETE' }), onSuccess: () => { setErr(undefined); void qc.invalidateQueries({ queryKey: ['discord-link'] }); }, onError });
  return (
    <>
      <Button variant="ghost" aria-label="Discord verknüpfen" onClick={() => setOpen(true)}><MessageCircle size={16} /></Button>
      <Modal open={open} title="Discord verknüpfen" onClose={() => setOpen(false)}>
        <div className="space-y-3 text-sm">
          {err && <p role="alert" className="text-danger">{err}</p>}
          {status.data?.linked ? (
            <>
              <p><Badge tone="success">verknüpft</Badge> Discord-ID <code>{status.data.discordId}</code></p>
              <p className="text-muted">Der Discord-Bot führt Befehle mit deinen Rechten aus. Du kannst die Verknüpfung jederzeit lösen.</p>
              <div className="flex justify-end"><Button variant="danger" disabled={unlink.isPending} onClick={() => unlink.mutate()}>Verknüpfung lösen</Button></div>
            </>
          ) : (
            <>
              <p className="text-muted">Verknüpfe dein Discord-Konto, dann kannst du Personen, Kennzeichen und Einsätze direkt im Discord abfragen und deinen Dienststatus setzen — immer mit deinen Rechten.</p>
              {providers.data?.discord ? (
                <div className="flex justify-end"><a href="/api/v1/auth/discord/link" className="rounded-md bg-[#5865F2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#4752c4]">Mit Discord verknüpfen</a></div>
              ) : !providers.isLoading && <p className="rounded border border-warning/40 bg-warning/10 p-2 text-xs text-warning">Die Discord-Anmeldung ist noch nicht eingerichtet. Ein Admin muss dafür die Discord-App (Client-ID und Secret) hinterlegen.</p>}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
