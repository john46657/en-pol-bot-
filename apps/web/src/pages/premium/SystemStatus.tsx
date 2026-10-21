import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, Tabs } from '../../components/ui';
import { age, dt } from './common';

interface Overview {
  checkedAt: string;
  erlc: { id: string; name: string; active: boolean; status: string; statusLabel: string; pollSeconds: number; lastSyncAt: string | null; lastError: string | null; lastErrorAt: string | null; latencyMs: number | null; rateLimit: { blockedUntil: number | null; buckets: { bucket: string; limit: number | null; remaining: number | null; resetAt: number | null }[] } | null; failingSince: string | null; failureCount: number; stale: boolean; staleAfterSeconds: number }[];
  bot: { lastReportAt: string | null; online: boolean; outboxPending: number; outboxOldestPendingAt: string | null; outboxFailed24h: number };
  backups: { last: Run | null; lastSuccess: Run | null; lastVerify: Run | null };
  openIncidents: number;
  config: { alertAfterMinutes: number; alertAfterFailures: number; outboxStaleMinutes: number };
}
interface Run { status: string; startedAt: string; fileName: string | null; error: string | null }
interface Event { id: string; source: string; sourceName: string | null; step: string | null; status: string; message: string; count: number; firstAt: string; lastAt: string; resolvedAt: string | null; alertedAt: string | null; acknowledgedAt: string | null; acknowledgedByName: string | null }
const SOURCE: Record<string, string> = { ERLC: 'ER:LC-API', ERLC_STEP: 'Verarbeitung', BACKUP: 'Backup', OUTBOX: 'Discord-Ausgang' };

/** Administration → Systemstatus: API-Überwachung, Synchronisierung, Discord-Bot, Backups und Störungsprotokoll. */
export function SystemStatusPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState('Offen');
  const o = useQuery({ queryKey: ['integrations'], queryFn: () => api<Overview>('/integrations/overview'), refetchInterval: 30_000 });
  const ev = useQuery({ queryKey: ['integration-events', tab], queryFn: () => api<Event[]>('/integrations/events', { query: { status: tab === 'Offen' ? 'OPEN' : tab === 'Behoben' ? 'RESOLVED' : undefined } }), refetchInterval: 30_000 });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['integrations'] }); void qc.invalidateQueries({ queryKey: ['integration-events'] }); };
  const ack = useMutation({ mutationFn: (id: string) => api(`/integrations/events/${id}/acknowledge`, { method: 'POST' }), onSuccess: refresh });
  const retry = useMutation({ mutationFn: (id: string) => api<{ ok: boolean; status: string; message: string | null }>(`/integrations/erlc/${id}/retry`, { method: 'POST' }), onSuccess: refresh });
  const save = useMutation({ mutationFn: (c: Overview['config']) => api('/integrations/config', { method: 'PUT', body: c }), onSuccess: refresh });
  const d = o.data;
  const manage = can('integrations.manage');
  return (
    <>
      <PageHeader title="🩺 Systemstatus" subtitle="ER:LC-Anbindung, Synchronisierung, Discord-Bot und Backups – mit Störungsprotokoll. Zugangsdaten werden hier nie angezeigt."
        actions={<Button variant="secondary" onClick={refresh}><RefreshCw size={14} />Aktualisieren</Button>} />
      {o.isLoading ? <SkeletonRows /> : o.error ? <ErrorState error={o.error} /> : d && (
        <div className="grid gap-4">
          <p className="text-xs text-muted">Geprüft {dt(d.checkedAt)} · {d.openIncidents} offene Störung(en)</p>
          <Card title="ER:LC-API">
            {!d.erlc.length ? <EmptyState text="Kein ER:LC-Server eingerichtet." hint="Die Leitstelle arbeitet vollständig mit den internen CAD-Daten." /> : (
              <ul className="divide-y divide-line text-sm">{d.erlc.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{s.name} <Badge>{s.statusLabel}</Badge>{s.stale && <Badge tone="warning">Daten veraltet</Badge>}{s.failureCount > 0 && <Badge tone="danger">{s.failureCount} Fehlversuche</Badge>}</p>
                    <p className="text-xs text-muted">Letzte erfolgreiche Synchronisierung: {dt(s.lastSyncAt)} ({age(s.lastSyncAt)}) · Intervall {s.pollSeconds} s · veraltet nach {s.staleAfterSeconds} s{s.latencyMs !== null && ` · ${s.latencyMs} ms`}</p>
                    {s.failingSince && <p className="text-xs text-danger">Fehler seit {dt(s.failingSince)}: {s.lastError}</p>}
                    {s.rateLimit?.blockedUntil && <p className="text-xs text-warning">Rate-Limit: keine Anfragen bis {dt(new Date(s.rateLimit.blockedUntil).toISOString())}</p>}
                    {s.rateLimit?.buckets.map((b) => <p key={b.bucket} className="text-[11px] text-muted">Kontingent {b.bucket}: {b.remaining ?? '?'} / {b.limit ?? '?'}{b.resetAt ? ` · zurückgesetzt ${dt(new Date(b.resetAt).toISOString())}` : ''}</p>)}
                  </div>
                  {manage && <Button size="sm" variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(s.id)}>Wiederverbinden</Button>}
                </li>
              ))}</ul>
            )}
            {retry.data && <p role="status" className="mt-1 text-xs">{retry.data.ok ? '✓ Verbunden' : `✗ ${retry.data.message ?? retry.data.status}`}</p>}
            {retry.error && <p role="alert" className="text-xs text-danger">{errText(retry.error)}</p>}
            <p className="mt-2 text-[11px] text-muted">Wiederholungen laufen automatisch mit wachsender Wartezeit (bis 5 Min.) und halten Rate-Limits (Retry-After) ein. API-Schlüssel ändern: CAD → Einstellungen → ER:LC (Recht „ER:LC verwalten“).</p>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Discord-Bot">
              <p className="text-sm">{d.bot.online ? <Badge tone="success">meldet sich</Badge> : <Badge tone="danger">keine Meldung</Badge>} letzte Meldung {age(d.bot.lastReportAt)}</p>
              <p className="text-xs text-muted">Wartende Nachrichten: {d.bot.outboxPending}{d.bot.outboxOldestPendingAt && ` (älteste ${age(d.bot.outboxOldestPendingAt)})`} · verworfen (24 h): {d.bot.outboxFailed24h}</p>
            </Card>
            <Card title="Backups">
              <p className="text-sm">Letzte Sicherung: {d.backups.last ? <>{dt(d.backups.last.startedAt)} <Badge tone={d.backups.last.status === 'SUCCESS' ? 'success' : d.backups.last.status === 'FAILED' ? 'danger' : 'info'}>{d.backups.last.status === 'SUCCESS' ? 'erfolgreich' : d.backups.last.status === 'FAILED' ? 'fehlgeschlagen' : 'läuft'}</Badge></> : 'keine'}</p>
              <p className="text-sm">Letzter Wiederherstellungstest: {d.backups.lastVerify ? <>{dt(d.backups.lastVerify.startedAt)} <Badge tone={d.backups.lastVerify.status === 'SUCCESS' ? 'success' : 'danger'}>{d.backups.lastVerify.status === 'SUCCESS' ? 'bestanden' : 'fehlgeschlagen'}</Badge></> : <Badge tone="warning">noch nie getestet</Badge>}</p>
              {can('backups.view') && <Link className="text-xs underline" to="/admin/backups">Zu den Backups</Link>}
            </Card>
          </div>
          {manage && (
            <Card title="Alarmierung">
              <form className="flex flex-wrap items-end gap-3 text-sm" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save.mutate({ alertAfterMinutes: Number(f.get('m')), alertAfterFailures: Number(f.get('n')), outboxStaleMinutes: Number(f.get('o')) }); }}>
                <label className="grid gap-1">Alarm nach Minuten<Input name="m" type="number" min={1} max={1440} defaultValue={d.config.alertAfterMinutes} className="w-24" /></label>
                <label className="grid gap-1">… oder nach Fehlversuchen<Input name="n" type="number" min={1} max={1000} defaultValue={d.config.alertAfterFailures} className="w-24" /></label>
                <label className="grid gap-1">Discord hängt nach Minuten<Input name="o" type="number" min={1} max={1440} defaultValue={d.config.outboxStaleMinutes} className="w-24" /></label>
                <Button disabled={save.isPending}>Speichern</Button>
              </form>
              <p className="mt-1 text-[11px] text-muted">Benachrichtigt werden alle mit dem Recht „Systemstatus ansehen“, zusätzlich der Logging-Kanal „Einstellungen & System“, falls eingerichtet. Fehlgeschlagene Backups werden sofort gemeldet.</p>
            </Card>
          )}
          <Card title="Störungsprotokoll">
            <Tabs tabs={['Offen', 'Behoben', 'Alle']} active={tab} onChange={setTab} />
            {ev.isLoading ? <SkeletonRows /> : !ev.data?.length ? <EmptyState text="Keine Einträge." /> : (
              <ul className="mt-2 divide-y divide-line text-sm">{ev.data.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p><Badge>{SOURCE[e.source] ?? e.source}</Badge> <b>{e.sourceName ?? ''}{e.step ? ` · ${e.step}` : ''}</b> {e.status === 'OPEN' ? <Badge tone="danger">offen</Badge> : <Badge tone="success">behoben {dt(e.resolvedAt)}</Badge>}{e.alertedAt && <Badge tone="warning">alarmiert</Badge>}</p>
                    <p>{e.message}</p>
                    <p className="text-[11px] text-muted">{e.count}× · erstmals {dt(e.firstAt)} · zuletzt {dt(e.lastAt)}{e.acknowledgedAt && ` · quittiert von ${e.acknowledgedByName} ${dt(e.acknowledgedAt)}`}</p>
                  </div>
                  {manage && e.status === 'OPEN' && !e.acknowledgedAt && <Button size="sm" variant="ghost" onClick={() => ack.mutate(e.id)}>Quittieren</Button>}
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
