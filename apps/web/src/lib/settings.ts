import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { hasPending, onSaved, pendingBody, queueSave } from './autosave';
import { useServer } from './guilds';

interface S { settings: Record<string, unknown>; allowedKeys: string[]; serverScoped?: string[] }

/**
 * Zentrale Einstellungen mit automatischem Speichern. Ist oben links ein Server gewählt, werden Einstellungen, die je
 * Server getrennt sein können (Teams/Büros/Dienstgrade, Name, Farbe …), für genau diesen Server gespeichert (`key@server`).
 */
export function useSettings() {
  const qc = useQueryClient();
  const [server] = useServer();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<S>('/admin/settings') });
  useEffect(() => onSaved('setting:', () => { if (!hasPending('setting:')) void qc.invalidateQueries({ queryKey: ['settings'] }); }), [qc]);
  const scoped = (key: string) => (server && (q.data?.serverScoped ?? []).includes(key) ? `${key}@${server}` : key);
  const get = <T,>(key: string): T | undefined => {
    const k = scoped(key);
    const pending = pendingBody<{ value: T }>(`setting:${k}`);
    if (pending) return pending.value;
    return (q.data?.settings[k] ?? q.data?.settings[key]) as T | undefined;
  };
  const put = (key: string, value: unknown, label?: string, delay?: number) => {
    const k = scoped(key);
    qc.setQueryData<S>(['settings'], (d) => (d ? { ...d, settings: { ...d.settings, [k]: value } } : d));
    queueSave(`setting:${k}`, { method: 'PUT', path: `/admin/settings/${encodeURIComponent(k)}`, body: { value }, label: label ?? key }, delay);
  };
  return { q, get, put, isServerValue: (key: string) => scoped(key) !== key };
}
