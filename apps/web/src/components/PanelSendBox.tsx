import { useState } from 'react';
import { Send } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { useGuilds } from '../lib/guilds';
import { errText } from '../lib/tickets';
import { ChannelPicker } from './DiscordPickers';
import { Button } from './ui';

/**
 * Kanal wählen und ein Bewerbungs-/Qualifikations-Panel direkt aus dem Dashboard senden, aktualisieren oder neu senden.
 * `onSend` speichert vorher die aktuellen Einstellungen und reiht das Panel ein.
 */
export function PanelSendBox({ label, channelId, onChannel, posted, onSend, onSent, hint }: {
  label: string; channelId: string; onChannel: (id: string) => void; posted?: { channelId: string; messageId: string } | null;
  onSend: (mode: 'update' | 'new') => Promise<unknown>; onSent?: () => void; hint: string;
}) {
  const guilds = useGuilds();
  const name = (id: string) => { for (const g of guilds.data ?? []) { const c = g.channels.find((x) => x.id === id); if (c) return `#${c.name}`; } return id; };
  const [msg, setMsg] = useState<{ ok: boolean; text: string }>();
  const send = useMutation({
    mutationFn: onSend,
    onSuccess: (_d, mode) => { setMsg({ ok: true, text: mode === 'update' ? 'Panel wird aktualisiert – in wenigen Sekunden in Discord.' : 'Panel wird gesendet – in wenigen Sekunden in Discord.' }); if (onSent) setTimeout(onSent, 4000); },
    onError: (e) => setMsg({ ok: false, text: errText(e) }),
  });
  return (
    <div className="mt-3 grid gap-2 border-t border-line pt-3">
      <span className="text-sm font-medium">Kanal für das Panel</span>
      <div className="max-w-md"><ChannelPicker ariaLabel={label} value={channelId} onChange={(id) => { onChannel(id ?? ''); setMsg(undefined); }} /></div>
      <p className="text-sm text-muted">{posted ? <>Steht in <b>{name(posted.channelId)}</b>.</> : 'Noch nicht aus dem Dashboard gesendet.'}</p>
      <div className="flex flex-wrap gap-2">
        {posted && posted.channelId === channelId
          ? <><Button disabled={send.isPending} onClick={() => send.mutate('update')}><Send size={14} className="mr-1" />Panel aktualisieren</Button><Button variant="secondary" disabled={send.isPending} onClick={() => send.mutate('new')}>Neu senden</Button></>
          : <Button disabled={send.isPending || !channelId} onClick={() => send.mutate('new')}><Send size={14} className="mr-1" />{channelId ? `In ${name(channelId)} senden` : 'Erst Kanal wählen'}</Button>}
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? 'text-success' : 'text-danger'}`}>{msg.text}</p>}
      <p className="text-xs text-muted">{hint} Der Bot braucht im Kanal „Nachrichten senden“ und „Links einbetten“.</p>
    </div>
  );
}
