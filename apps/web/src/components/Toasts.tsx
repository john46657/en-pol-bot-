import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { usePrefs } from '../lib/prefs';
import { onRealtime } from '../lib/realtime';

interface Toast { id: number; title: string; type: string }

/** Neue persönliche Benachrichtigungen als Popup (ausgeblendete Arten und „Popups aus“ werden beachtet). */
export function Toasts() {
  const qc = useQueryClient();
  const { prefs } = usePrefs();
  const [list, setList] = useState<Toast[]>([]);
  const muted = prefs.notifications.muted, enabled = prefs.notifications.toasts !== false;
  useEffect(() => onRealtime('notification.new', (p) => {
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    const n = p as { title?: string; type?: string };
    if (!enabled || !n.title || muted.includes(n.type ?? '')) return;
    const id = Date.now() + Math.random();
    setList((l) => [...l.slice(-3), { id, title: n.title!, type: n.type ?? '' }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 6000);
  }), [qc, enabled, muted.join()]);
  if (!list.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 grid w-80 max-w-[calc(100vw-2rem)] gap-2" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="card flex items-start gap-2 border border-line p-3 text-sm shadow-xl">
          <p className="min-w-0 flex-1">{t.title}</p>
          <button type="button" aria-label="Schließen" className="text-muted hover:text-fg" onClick={() => setList((l) => l.filter((x) => x.id !== t.id))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
