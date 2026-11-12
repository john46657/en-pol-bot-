import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MapPin } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import type { CadConfig, CadIncidentRow, CadUnitRow } from '../lib/cad';
import { ago, optColor, optLabel } from '../lib/cad';
import { stripEmoji } from './ui';

/*
 * Bausteine aus dem Design-System „Leitstelle & MDT“ für Startseite und Leitstelle:
 * Kennzahl-Kachel, Einsatzkarte, Einheiten-Zeile, Status-Chip. Farben der Status/Prioritäten kommen
 * aus den CAD-Einstellungen; der Text steht immer in Vordergrundfarbe daneben (lesbar in hell und dunkel).
 */

const STAT_TONE = { neutral: 'border-line', alarm: 'border-danger bg-[color-mix(in_srgb,var(--color-danger)_12%,var(--color-panel))]', warn: 'border-warning', ok: 'border-line' } as const;
export type StatTone = keyof typeof STAT_TONE;

/** Kennzahl: Bezeichnung (Großbuchstaben), große Mono-Zahl, kurzer Hinweis; führt zur passenden Seite. */
export function StatTile({ label, value, hint, to, tone = 'neutral' }: { label: string; value: ReactNode; hint?: string; to?: string; tone?: StatTone }) {
  const cls = twMerge('card flex min-w-0 flex-col gap-1 border p-4 text-left', STAT_TONE[tone], to && 'transition hover:border-primary');
  const body = (
    <>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className="font-mono text-[28px] font-semibold leading-[34px] tabular-nums">{value}</span>
      {hint && <span className="truncate text-xs text-muted">{hint}</span>}
    </>
  );
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Status als kleine Farbkachel + Text (Farbe aus der CAD-Konfiguration). */
export function OptTag({ list, value, className }: { list: CadConfig['priorities']; value: string | null | undefined; className?: string }) {
  const c = optColor(list, value) ?? 'var(--color-offline)';
  return (
    <span className={twMerge('inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-xs font-semibold text-fg', className)} style={{ borderColor: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: c }} />{stripEmoji(optLabel(list, value))}
    </span>
  );
}

/** Einheit als kompakter Chip: Farbkachel des Funkstatus + Funkrufname (Mono). */
export function UnitChip({ cfg, callsign, status }: { cfg: CadConfig; callsign: string; status: string }) {
  const c = optColor(cfg.unitStatuses, status) ?? 'var(--color-offline)';
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded border border-line pl-1 pr-2 font-mono text-xs font-medium" title={stripEmoji(optLabel(cfg.unitStatuses, status))}>
      <span aria-hidden className="size-3.5 rounded-[3px]" style={{ background: c }} />{callsign}
      <span className="sr-only"> – {stripEmoji(optLabel(cfg.unitStatuses, status))}</span>
    </span>
  );
}

/** Höchste Priorität (erster Eintrag in den CAD-Einstellungen) bekommt den roten Rand. */
const isTopPriority = (cfg: CadConfig, p: string) => cfg.priorities[0]?.key === p;
const time = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Einsatz in einer Liste: Nummer + Uhrzeit, Priorität, Stichwort, Ort, zugewiesene Einheiten. */
export function IncidentCard({ inc, cfg, to, active, onSelect }: { inc: CadIncidentRow; cfg: CadConfig; to?: string; active?: boolean; onSelect?: () => void }) {
  const units = inc.units.filter((u) => !u.clearedAt);
  const cls = twMerge('grid w-full gap-2 rounded-[10px] border bg-panel px-4 py-3 text-left transition hover:bg-panel-2',
    isTopPriority(cfg, inc.priority) ? 'border-danger' : 'border-line', active && 'border-primary bg-panel-2');
  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] text-muted">{inc.number} · {time(inc.createdAt)}</span>
        <span className="flex shrink-0 gap-1"><OptTag list={cfg.priorities} value={inc.priority} /><OptTag list={cfg.incidentStatuses} value={inc.status} className="max-sm:hidden" /></span>
      </span>
      <span className="text-[15px] font-semibold leading-[22px]">{inc.restrictRoleIds?.length ? '🔒 ' : ''}{inc.keyword ? `${inc.keyword} – ` : ''}{inc.title}</span>
      <span className="flex items-center gap-1 text-muted"><MapPin size={14} aria-hidden className="shrink-0" /><span className="truncate">{inc.location ?? 'ohne Ort'}</span><span className="ml-auto shrink-0 text-xs">{ago(inc.createdAt)}</span></span>
      <span className="flex flex-wrap gap-2">{units.length ? units.map((u) => <UnitChip key={u.unitId} cfg={cfg} callsign={u.unit.callsign} status={u.unit.status} />) : <span className="text-xs text-muted">Keine Einheit zugewiesen</span>}</span>
    </>
  );
  if (onSelect) return <button type="button" onClick={onSelect} aria-pressed={active} className={cls}>{body}</button>;
  return to ? <Link to={to} className={cls}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** Einheit in einer Liste: Funkstatus, Funkrufname, Besatzung, aktueller Einsatz oder Aktion. */
export function UnitRow({ unit, cfg, action }: { unit: CadUnitRow; cfg: CadConfig; action?: ReactNode }) {
  const c = optColor(cfg.unitStatuses, unit.status) ?? 'var(--color-offline)';
  const crew = unit.memberNames.length ? unit.memberNames.join(' · ') : unit.crew.map((m) => m.discordName ?? m.robloxName ?? m.erlcName).filter(Boolean).join(' · ');
  return (
    <li className={twMerge('grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-line px-4 py-2 last:border-b-0 hover:bg-panel-2', !unit.operational && 'opacity-70')}>
      <span className="grid size-6 place-items-center rounded font-mono text-xs font-semibold text-fg" style={{ background: `color-mix(in srgb, ${c} 30%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${c}` }} title={stripEmoji(optLabel(cfg.unitStatuses, unit.status))}>
        {unit.icon ?? cfg.unitTypes.find((t) => t.key === unit.type)?.emoji ?? ''}
      </span>
      <span className="min-w-0">
        <span className="block font-mono text-[13px] font-semibold">{unit.callsign}{unit.name ? <span className="ml-2 font-sans font-normal text-muted">{unit.name}</span> : null}</span>
        <span className="block truncate text-xs text-muted">{stripEmoji(optLabel(cfg.unitStatuses, unit.status))}{crew ? ` · ${crew}` : ''}</span>
      </span>
      {action ?? (unit.current ? <Link to={`/cad/incidents?id=${unit.current.id}`} className="font-mono text-[13px] text-muted hover:text-fg hover:underline">{unit.current.number}</Link> : <span />)}
    </li>
  );
}

/** Abschnitt mit Kopfzeile im Panel-Stil. */
export function Panel({ title, actions, children, className, flush }: { title: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={twMerge('card min-w-0 border border-line', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3"><h2 className="text-[15px] font-semibold leading-[22px]">{title}</h2>{actions}</header>
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}
