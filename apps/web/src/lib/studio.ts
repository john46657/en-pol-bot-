import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { FieldDef } from '../components/FormModal';

export interface CustomFieldDef { key: string; label: string; type: 'text' | 'number' | 'select' | 'date'; required: boolean; options?: string[] }
export interface StudioConfig { org: { name: string }; theme: { accent: string; customAccents?: { name: string; hex: string }[] }; customFields: { persons: CustomFieldDef[]; vehicles: CustomFieldDef[] } }

export const ACCENTS: Record<string, string> = {
  blue: '#3b82f6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', cyan: '#06b6d4', violet: '#8b5cf6',
  orange: '#f97316', pink: '#ec4899', indigo: '#6366f1', teal: '#14b8a6', lime: '#84cc16', sky: '#0ea5e9', rose: '#f43f5e', emerald: '#10b981', gold: '#eab308', slate: '#64748b',
};
/** Akzentfarbe aus dem Studio: Vorgabe-Name oder eigene Farbe (#rrggbb). */
export const accentHex = (v: string | undefined) => (v && ACCENTS[v]) || (v && /^#[0-9a-f]{6}$/i.test(v) ? v : ACCENTS.blue!);

export const useStudio = () => useQuery({ queryKey: ['studio-config'], queryFn: () => api<StudioConfig>('/studio/config'), staleTime: 60_000 });

/** Custom Fields als Formularfelder (Präfix `cf_`, damit sie nicht mit Standardfeldern kollidieren). */
export const customFormFields = (defs: CustomFieldDef[] | undefined): FieldDef[] =>
  (defs ?? []).map((d) => ({ name: `cf_${d.key}`, label: d.label, type: d.type, required: d.required, options: d.options }));

/** Trennt `cf_*`-Werte vom Rest und hängt sie als `custom` an. */
export function withCustom(values: Record<string, unknown>, build?: (v: Record<string, unknown>) => unknown) {
  const base: Record<string, unknown> = {}; const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (k.startsWith('cf_')) custom[k.slice(3)] = v;
    else base[k] = v;
  }
  const body = (build ? build(base) : base) as Record<string, unknown>;
  return Object.keys(custom).length ? { ...body, custom } : body;
}
