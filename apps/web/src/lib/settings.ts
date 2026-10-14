import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { hasPending, onSaved, pendingBody, queueSave } from './autosave';

interface S { settings: Record<string, unknown>; allowedKeys: string[] }

/** Zentrale Einstellungen mit automatischem Speichern. */
export function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<S>('/admin/settings') });
  useEffect(() => onSaved('setting:', () => { if (!hasPending('setting:')) void qc.invalidateQueries({ queryKey: ['settings'] }); }), [qc]);
  const get = <T,>(key: string): T | undefined => {
    const pending = pendingBody<{ value: T }>(`setting:${key}`);
    if (pending) return pending.value;
    return q.data?.settings[key] as T | undefined;
  };
  const put = (key: string, value: unknown, label?: string, delay?: number) => {
    qc.setQueryData<S>(['settings'], (d) => (d ? { ...d, settings: { ...d.settings, [key]: value } } : d));
    queueSave(`setting:${key}`, { method: 'PUT', path: `/admin/settings/${encodeURIComponent(key)}`, body: { value }, label: label ?? key }, delay);
  };
  return { q, get, put };
}
