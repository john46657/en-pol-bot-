import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

let socket: Socket | undefined;
const rooms = new Map<string, number>();

function ensure(): Socket {
  socket ??= io({ path: '/ws', withCredentials: true, transports: ['websocket'], autoConnect: true });
  socket.on('connect', () => { for (const r of rooms.keys()) socket!.emit('subscribe', { room: r }); });
  return socket;
}

/** Abonniert einen Raum (Server autorisiert) und invalidiert bei Events die zugehörigen Queries. */
export function useRealtime(room: string, events: string[], queryKeys: string[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const s = ensure();
    rooms.set(room, (rooms.get(room) ?? 0) + 1);
    if (s.connected) s.emit('subscribe', { room });
    const handler = () => queryKeys.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
    events.forEach((e) => s.on(e, handler));
    return () => {
      events.forEach((e) => s.off(e, handler));
      const n = (rooms.get(room) ?? 1) - 1;
      if (n <= 0) { rooms.delete(room); s.emit('unsubscribe', { room }); } else rooms.set(room, n);
    };
  }, [room]);
}

export function disconnectRealtime() { socket?.disconnect(); socket = undefined; rooms.clear(); }

/** Ereignisse an alle bzw. an den eigenen Benutzer (ohne Raum), z. B. „Rechte geändert“. */
export function useRealtimeEvent(event: string, handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const s = ensure();
    s.on(event, handler);
    return () => { s.off(event, handler); };
  }, [event, enabled]);
}

/** Ereignis mit Inhalt abonnieren (außerhalb von React-Query), z. B. neue Benachrichtigung → Popup. */
export function onRealtime(event: string, handler: (payload: unknown) => void) {
  const s = ensure();
  s.on(event, handler);
  return () => { s.off(event, handler); };
}
