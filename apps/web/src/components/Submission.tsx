import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, User } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { GuildTag } from '../lib/guilds';
import { fmt, StatusBadge } from './ui';

/** „vor 5 Tagen“ – wie bei Appy neben dem Datum. */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  const unit = (n: number, one: string, many: string) => `vor ${n} ${n === 1 ? one : many}`;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return unit(Math.floor(s / 60), 'Minute', 'Minuten');
  if (s < 86_400) return unit(Math.floor(s / 3600), 'Stunde', 'Stunden');
  if (s < 30 * 86_400) return unit(Math.floor(s / 86_400), 'Tag', 'Tagen');
  if (s < 365 * 86_400) return unit(Math.floor(s / (30 * 86_400)), 'Monat', 'Monaten');
  return unit(Math.floor(s / (365 * 86_400)), 'Jahr', 'Jahren');
}

function Avatar({ src }: { src?: string | null }) {
  if (src) return <img src={src} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />;
  // ohne Profilbild (Person nicht mehr auf dem Server / Webformular): Platzhalter wie bei Appy
  return <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#5865f2]/80 text-white"><User size={22} /></span>;
}

interface HistoryRow { id: string; number: string; status: string; createdAt: string; decisionReason: string | null; unitName?: string }

/** Frühere Bewerbungen derselben Person (EN Polizei + Qualifikationen) – rechts neben den Antworten. */
function History({ discordId, current }: { discordId: string; current: string }) {
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['application-history', discordId],
    queryFn: async () => {
      const [police, quali] = await Promise.all([
        can('applications.view') ? api<HistoryRow[]>('/applications/history', { query: { discordId } }) : Promise.resolve([]),
        can('qualifications.view') ? api<HistoryRow[]>('/qualifications/history', { query: { discordId } }) : Promise.resolve([]),
      ]);
      return [...police.map((r) => ({ ...r, unitName: 'EN Polizei' })), ...quali].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    },
  });
  const rows = (q.data ?? []).filter((r) => r.id !== current);
  return (
    <div className="grid content-start gap-2">
      <p className="font-semibold">Bisherige Bewerbungen</p>
      {q.isLoading ? <p className="text-sm text-muted">Lädt …</p> : !rows.length ? <p className="text-sm text-muted">Keine weiteren Bewerbungen dieser Person.</p> : (
        <ul className="grid gap-2 text-sm">{rows.map((r) => (
          <li key={r.id} className="rounded-md border border-line bg-panel-2/40 p-2">
            <p className="flex flex-wrap items-center gap-2"><strong>{r.unitName}</strong> <StatusBadge status={r.status} /></p>
            <p className="text-xs text-muted">{r.number} · {fmt(r.createdAt)} ({ago(r.createdAt)})</p>
            {r.decisionReason && <p className="mt-1 text-xs text-muted">↳ {r.decisionReason}</p>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

/**
 * Eine Einsendung wie bei Appy: eingeklappt Profilbild, „Name's Bewerbung für 'X'“, Status, Discord-ID und Datum;
 * aufgeklappt die Antworten (links), frühere Bewerbungen (rechts) und darunter die Aktionen.
 */
export function SubmissionCard({ id, name, appName, status, discordId, avatar, guildId, createdAt, answers, details, actions, defaultOpen = false }: {
  name: string; appName: string; status: string; discordId: string | null; avatar?: string | null; guildId?: string | null; createdAt: string;
  answers: { question: string; answer: string }[]; details?: ReactNode; actions?: ReactNode; defaultOpen?: boolean; id: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <article className="rounded-xl border border-line bg-panel">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-panel-2/40">
        <Avatar src={avatar} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 font-semibold">{name}s Bewerbung für „{appName}“ <StatusBadge status={status} /><GuildTag id={guildId} /></span>
          <span className="block text-sm text-muted">{discordId ?? 'Webformular'} · {fmt(createdAt)} ({ago(createdAt)})</span>
        </span>
        <ChevronDown size={18} aria-hidden className={`shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-4 border-t border-line p-4 lg:grid-cols-[2fr_1fr]">
          <div className="grid content-start gap-3">
            <p className="font-semibold">Antworten</p>
            <ol className="grid gap-3 text-sm">{answers.map((x, i) => (
              <li key={i} className="grid gap-1">
                <p className="font-medium">{i + 1}. {x.question}</p>
                <p className="whitespace-pre-wrap rounded-md bg-panel-2/60 p-3">{x.answer || '—'}</p>
              </li>
            ))}</ol>
            {details}
            {actions}
          </div>
          {discordId ? <History discordId={discordId} current={id} /> : <p className="text-sm text-muted">Über das Webformular ohne Discord eingereicht – kein Verlauf.</p>}
        </div>
      )}
    </article>
  );
}
