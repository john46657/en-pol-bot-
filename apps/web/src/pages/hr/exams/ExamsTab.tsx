import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Copy, Download, FileUp, Pencil, Play, Plus, Search, Send, Sparkles } from 'lucide-react';
import { EXAM_EXPORT_FORMAT, examSchema } from '@enrp/shared';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { errText } from '../../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, Field, fmt, Input, Modal, Select, SkeletonRows, Textarea } from '../../../components/ui';
import { ChannelPicker, RolePicker } from '../../../components/DiscordPickers';
import { download, fileSafe, Meter, plural, STATE_INFO, StatTile, useExams, type ExamDetail, type ExamListItem, type ExamState } from './common';
import { EXAM_TEMPLATE } from './template';

type Filter = 'all' | 'open' | 'passed' | 'blocked' | 'drafts' | 'grading';
const OPEN: ExamState[] = ['AVAILABLE', 'IN_PROGRESS'];
const BLOCKED: ExamState[] = ['WAITING', 'NO_ATTEMPTS', 'LOCKED', 'NOT_YET', 'CLOSED', 'NO_QUESTIONS', 'NO_PROFILE', 'PENDING'];

/** Prüfungen: Übersicht für Teilnehmer und Verwaltung. */
export function ExamsTab() {
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useExams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [err, setErr] = useState<string>();
  const [send, setSend] = useState<ExamListItem>();
  const file = useRef<HTMLInputElement>(null);
  const duplicate = useMutation({
    mutationFn: (id: string) => api<{ id: string }>(`/hr/exams/${id}/duplicate`, { method: 'POST' }),
    onSuccess: (e) => { void qc.invalidateQueries({ queryKey: ['hr-exams'] }); nav(`/trainings/exams/${e.id}/edit`); },
    onError: (e) => setErr(errText(e)),
  });
  const exportExam = useMutation({
    mutationFn: (id: string) => api<ExamDetail>(`/hr/exams/${id}`),
    onSuccess: (e) => {
      const exam = Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'createdAt', 'updatedAt', 'attemptCount', 'serverId'].includes(k)));
      // Verweise (Prüfer, Rollen, Ausbildung) gelten nur auf diesem Server
      download(`pruefung-${fileSafe(e.title)}.json`, JSON.stringify({ format: EXAM_EXPORT_FORMAT, version: 1, exam: { ...exam, examinerIds: [], audienceRoleIds: [], trainingId: null, requiredExamId: null } }, null, 2));
    },
    onError: (e) => setErr(errText(e)),
  });
  const importFile = async (f: File) => {
    setErr(undefined);
    try {
      const raw = JSON.parse(await f.text()) as { format?: string; exam?: unknown };
      const parsed = examSchema.safeParse(raw.format === EXAM_EXPORT_FORMAT ? raw.exam : raw);
      if (!parsed.success) { setErr(`Die Datei enthält keine gültige Prüfung (${parsed.error.issues[0]?.path.join('.') || 'Format'}: ${parsed.error.issues[0]?.message}).`); return; }
      nav('/trainings/exams/new', { state: { draft: { ...parsed.data, examinerIds: [], audienceRoleIds: [], trainingId: null, requiredExamId: null, active: false } } });
    } catch { setErr('Die Datei ist kein gültiges JSON.'); }
  };

  const all = useMemo(() => q.data ?? [], [q.data]);
  const categories = useMemo(() => [...new Set(all.map((e) => e.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'de')), [all]);
  if (q.isLoading) return <SkeletonRows />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const staff = all.filter((e) => e.stats);
  const pending = staff.reduce((n, e) => n + (e.stats?.pending ?? 0), 0);
  const match = (e: ExamListItem) => {
    if (category && e.category !== category) return false;
    const s = search.trim().toLowerCase();
    if (s && ![e.title, e.description ?? '', e.category ?? ''].some((x) => x.toLowerCase().includes(s))) return false;
    if (filter === 'open') return e.active && OPEN.includes(e.me.state);
    if (filter === 'passed') return e.me.state === 'PASSED';
    if (filter === 'blocked') return e.active && BLOCKED.includes(e.me.state);
    if (filter === 'drafts') return !e.active;
    if (filter === 'grading') return (e.stats?.pending ?? 0) > 0;
    return true;
  };
  const list = all.filter(match);
  const groups = new Map<string, ExamListItem[]>();
  for (const e of list) groups.set(e.category ?? '', [...(groups.get(e.category ?? '') ?? []), e]);
  const ordered = [...groups.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, 'de')));
  const filters: [Filter, string, number][] = [
    ['all', 'Alle', all.length],
    ['open', 'Offen', all.filter((e) => e.active && OPEN.includes(e.me.state)).length],
    ['passed', 'Bestanden', all.filter((e) => e.me.state === 'PASSED').length],
    ['blocked', 'Gesperrt / Wartezeit', all.filter((e) => e.active && BLOCKED.includes(e.me.state)).length],
    ...(staff.length ? [['grading', 'Zu bewerten', staff.filter((e) => (e.stats?.pending ?? 0) > 0).length] as [Filter, string, number]] : []),
    ...(all.some((e) => !e.active) ? [['drafts', 'Entwürfe', all.filter((e) => !e.active).length] as [Filter, string, number]] : []),
  ];

  return (
    <div className="grid gap-4">
      {all.length > 0 && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {staff.length ? (
          <>
            <StatTile label="Prüfungen" value={all.filter((e) => e.active).length} hint={`${plural(all.length - all.filter((e) => e.active).length, 'Entwurf', 'Entwürfe')}`} />
            <StatTile label="Zu bewerten" value={pending} tone={pending ? 'warning' : undefined} hint={pending ? <Link className="text-primary hover:underline" to="/trainings?tab=Bewertung">Zur Bewertung →</Link> : 'alles erledigt'} />
            <StatTile label="Teilnehmer" value={staff.reduce((n, e) => n + (e.stats?.participants ?? 0), 0)} hint={`${plural(staff.reduce((n, e) => n + (e.stats?.attempts ?? 0), 0), 'Versuch', 'Versuche')}`} />
            <StatTile label="Bestehensquote" value={avg(staff.map((e) => e.stats?.passRate ?? null)) ?? '—'} hint="Durchschnitt aller bewerteten Versuche" tone="primary" />
          </>
        ) : (
          <>
            <StatTile label="Offen" value={all.filter((e) => OPEN.includes(e.me.state)).length} tone="primary" hint="jetzt ablegbar" />
            <StatTile label="Bestanden" value={all.filter((e) => e.me.state === 'PASSED').length} tone="success" hint={`von ${all.length}`} />
            <StatTile label="In Bewertung" value={all.filter((e) => e.me.state === 'PENDING').length} hint="wartet auf Prüfer" />
            <StatTile label="Bestes Ergebnis" value={best(all)} hint="über alle Prüfungen" />
          </>
        )}
      </div>}

      <Card title={`Prüfungen (${list.length}${list.length !== all.length ? ` von ${all.length}` : ''})`} actions={
        <div className="flex flex-wrap gap-2">
          {can('exam.create') && (
            <>
              <input ref={file} type="file" accept="application/json,.json" className="hidden" aria-label="Prüfung aus Datei importieren" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
              <Button size="sm" variant="secondary" onClick={() => file.current?.click()}><FileUp size={14} />Importieren</Button>
              <Button size="sm" onClick={() => nav('/trainings/exams/new')}><Plus size={14} />Neue Prüfung</Button>
            </>
          )}
        </div>
      }>
        {all.length > 0 && (
          <div className="mb-4 grid gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1">
                <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                <Input aria-label="Prüfungen durchsuchen" className="pl-8" placeholder="Suchen …" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {categories.length > 0 && (
                <Select aria-label="Kategorie" className="w-auto min-w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Alle Kategorien</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </div>
            <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
              {filters.map(([f, label, n]) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? 'border-primary bg-primary/15 text-fg' : 'border-line text-muted hover:text-fg'}`}>
                  {label} <span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {err && <p role="alert" className="mb-3 text-sm text-danger">{err}</p>}
        {!all.length ? (
          <EmptyState
            text="Noch keine Prüfungen"
            hint={can('exam.create') ? 'Lege eine Prüfung an, importiere eine Datei oder starte mit einer Vorlage (Single/Multiple Choice, Reihenfolge, Zuordnung, Lückentext …).' : 'Sobald eine Prüfung für dich freigegeben ist, erscheint sie hier.'}
            action={can('exam.create') && (
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => nav('/trainings/exams/new')}><Plus size={14} />Neue Prüfung</Button>
                <Button size="sm" variant="secondary" onClick={() => nav('/trainings/exams/new', { state: { draft: EXAM_TEMPLATE } })}><Sparkles size={14} />Mit Vorlage starten</Button>
              </div>
            )}
          />
        ) : !list.length ? <EmptyState text="Keine Prüfung passt zum Filter" action={<Button size="sm" variant="secondary" onClick={() => { setFilter('all'); setSearch(''); setCategory(''); }}>Filter zurücksetzen</Button>} /> : (
          <div className="grid gap-5">
            {ordered.map(([cat, items]) => (
              <section key={cat || '-'} aria-label={cat || 'Ohne Kategorie'}>
                {(ordered.length > 1 || cat) && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{cat || 'Ohne Kategorie'} <span className="font-normal">· {items.length}</span></h3>}
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((e) => <ExamCard key={e.id} e={e} onDuplicate={can('exam.create') ? () => duplicate.mutate(e.id) : undefined} onExport={e.canEdit ? () => exportExam.mutate(e.id) : undefined} onSend={e.canEdit ? () => setSend(e) : undefined} busy={duplicate.isPending || exportExam.isPending} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      {send && <SendToDiscord exam={send} onClose={() => setSend(undefined)} />}
    </div>
  );
}

/** Prüfung in einen Discord-Kanal schicken – mit Button, der direkt zur Prüfung im Dashboard führt. */
function SendToDiscord({ exam, onClose }: { exam: ExamListItem; onClose: () => void }) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [pingRoleIds, setPing] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const post = useMutation({ mutationFn: () => api(`/hr/exams/${exam.id}/discord`, { body: { channelId, pingRoleIds, ...(message.trim() ? { message: message.trim() } : {}) } }) });
  return (
    <Modal open title={`„${exam.title}“ in Discord senden`} onClose={onClose}>
      <div className="grid gap-3">
        {!exam.active && <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 p-2 text-sm text-warning">Die Prüfung ist noch ein Entwurf. Aktiviere sie zuerst (Bearbeiten → aktiv), sonst kann sie über den Link niemand starten.</p>}
        <p className="text-sm text-muted">Der Bot postet die Eckdaten (Fragen, Zeit, Bestehensgrenze, Versuche) mit dem Button „Zur Prüfung im Dashboard“ – ein Klick öffnet die Prüfung direkt.</p>
        <div className="grid gap-1"><span className="text-xs font-medium text-muted">Discord-Kanal</span><ChannelPicker ariaLabel="Discord-Kanal" value={channelId} onChange={setChannelId} /></div>
        <div className="grid gap-1"><span className="text-xs font-medium text-muted">Rollen pingen (optional)</span><RolePicker ariaLabel="Rollen pingen" value={pingRoleIds} max={10} onChange={setPing} /></div>
        <Field label="Zusätzlicher Text (optional)">{(id) => <Textarea id={id} rows={3} maxLength={1500} value={message} placeholder="z. B. Bitte bis Freitag ablegen." onChange={(e) => setMessage(e.target.value)} />}</Field>
        {post.error && <p role="alert" className="text-sm text-danger">{errText(post.error)}</p>}
        {post.isSuccess && <p role="status" className="text-sm text-success">✅ Wird in Discord gepostet.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{post.isSuccess ? 'Schließen' : 'Abbrechen'}</Button>
          {!post.isSuccess && <Button disabled={!channelId || !exam.active || post.isPending} onClick={() => post.mutate()}><Send size={14} />Senden</Button>}
        </div>
      </div>
    </Modal>
  );
}

const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x !== null); return v.length ? `${Math.round(v.reduce((n, x) => n + x, 0) / v.length)} %` : null; };
const best = (all: ExamListItem[]) => { const v = all.map((e) => e.me.bestPercent).filter((x): x is number => x !== null); return v.length ? `${Math.max(...v)} %` : '—'; };

function ExamCard({ e, onDuplicate, onExport, onSend, busy }: { e: ExamListItem; onDuplicate?: () => void; onExport?: () => void; onSend?: () => void; busy: boolean }) {
  const nav = useNavigate();
  const st = e.active ? STATE_INFO[e.me.state] : STATE_INFO.INACTIVE;
  const canTake = e.active && OPEN.includes(e.me.state);
  const s = e.stats;
  return (
    <li className={`flex flex-col gap-3 rounded-lg border bg-panel-2/60 p-4 transition hover:border-primary/40 ${e.me.state === 'PASSED' ? 'border-success/30' : 'border-line'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/trainings/exams/${e.id}`} className="font-semibold hover:text-primary hover:underline">{e.title}</Link>
          {e.trainingName && <p className="text-xs text-muted">🎓 {e.trainingName}</p>}
        </div>
        <Badge tone={st.tone} icon={st.emoji}>{st.label}</Badge>
      </div>
      {e.description && <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted">{e.description}</p>}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>❓ {e.questionsPerAttempt < e.questionTotal ? `${e.questionsPerAttempt} von ${e.questionTotal} Fragen` : plural(e.questionTotal, 'Frage', 'Fragen')}</span>
        <span>⏱️ {e.timeLimitMin ? `${e.timeLimitMin} Min.` : 'ohne Zeitlimit'}</span>
        <span>🎯 ab {e.passPercent} %</span>
        <span>🔁 {e.me.attemptsUsed}/{e.maxAttempts} Versuche</span>
        {e.availableUntil && <span>📅 bis {fmt(e.availableUntil)}</span>}
      </div>
      {e.me.bestPercent !== null && (
        <div className="grid gap-1">
          <div className="flex justify-between text-xs"><span className="text-muted">Bestes Ergebnis</span><span className="font-medium tabular-nums">{e.me.bestPercent} %</span></div>
          <Meter value={e.me.bestPercent} pass={e.passPercent} label={`Bestes Ergebnis ${e.me.bestPercent} Prozent`} />
        </div>
      )}
      {e.active && e.me.reason && !canTake && e.me.state !== 'PASSED' && <p className="text-xs text-muted">{e.me.reason}</p>}
      {s && (
        <div className="grid grid-cols-3 gap-2 rounded-md border border-line bg-panel px-3 py-2 text-center text-xs">
          <div><div className="text-base font-semibold tabular-nums">{s.participants}</div><div className="text-muted">Teilnehmer</div></div>
          <div><div className="text-base font-semibold tabular-nums">{s.passRate === null ? '—' : `${s.passRate} %`}</div><div className="text-muted">bestanden</div></div>
          <div><div className={`text-base font-semibold tabular-nums ${s.pending ? 'text-warning' : ''}`}>{s.pending}</div><div className="text-muted">zu bewerten</div></div>
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {canTake && <Button size="sm" onClick={() => nav(`/trainings/exams/${e.id}`)}><Play size={14} />{e.me.state === 'IN_PROGRESS' ? 'Fortsetzen' : 'Starten'}</Button>}
        {!canTake && <Button size="sm" variant="secondary" onClick={() => nav(`/trainings/exams/${e.id}`)}>Details</Button>}
        {e.canGrade && <Button size="sm" variant="secondary" onClick={() => nav(`/trainings/exams/${e.id}/results`)}><BarChart3 size={14} />Ergebnisse</Button>}
        <span className="ml-auto flex gap-0.5">
          {e.canEdit && <Button size="sm" variant="ghost" aria-label={`${e.title} bearbeiten`} title="Bearbeiten" onClick={() => nav(`/trainings/exams/${e.id}/edit`)}><Pencil size={14} /></Button>}
          {onDuplicate && e.canEdit && <Button size="sm" variant="ghost" aria-label={`${e.title} duplizieren`} title="Duplizieren" disabled={busy} onClick={onDuplicate}><Copy size={14} /></Button>}
          {onSend && <Button size="sm" variant="ghost" aria-label={`${e.title} in Discord senden`} title="In Discord senden" onClick={onSend}><Send size={14} /></Button>}
          {onExport && <Button size="sm" variant="ghost" aria-label={`${e.title} exportieren`} title="Als Datei exportieren" disabled={busy} onClick={onExport}><Download size={14} /></Button>}
        </span>
      </div>
    </li>
  );
}
