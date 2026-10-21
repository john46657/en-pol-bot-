import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUALITY_TARGET_LABEL, type QualityConfig, type QualityTarget } from '@enrp/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { errText } from '../../lib/tickets';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Modal, PageHeader, Select, SkeletonRows } from '../../components/ui';
import { Toggle } from '../../components/ApplicationSettings';
import { dt, Stat } from './common';

interface Finding { code: string; level: 'ERROR' | 'WARNING'; field: string; message: string; hint: string }
interface Excepted extends Finding { exception: { id: string; reason: string; createdAt: string; createdByName: string } }
export interface QualityResult { target: QualityTarget; id: string; number: string | null; title: string; checkedAt: string; errors: Finding[]; warnings: Finding[]; excepted: Excepted[]; ok: boolean }
interface Overview { checkedAt: string; config: QualityConfig; summary: Record<QualityTarget, { checked: number; withErrors: number; withWarnings: number }>; items: QualityResult[] }

const FIELD: Record<string, string> = { title: 'Titel', body: 'Berichtstext', incidentId: 'Einsatznummer', status: 'Status', personId: 'Person', vehicleId: 'Fahrzeug', reason: 'Grund', description: 'Beschreibung', expiresAt: 'Ablaufdatum', location: 'Ort', type: 'Einsatzart', closedAt: 'Abschlusszeit', units: 'Einheiten', reports: 'Berichte', number: 'Einsatznummer' };
const hrefOf = (r: { target: QualityTarget; id: string }) => (r.target === 'REPORT' ? `/reports/${r.id}` : r.target === 'WANTED' ? `/wanted/${r.id}` : `/cad/incidents?id=${r.id}`);

/** Befunde eines Datensatzes: Fehler und Warnungen getrennt, betroffenes Feld markiert, Korrekturhinweis, dokumentierte Ausnahmen. */
export function Findings({ r, onChanged }: { r: QualityResult; onChanged?: () => void }) {
  const { can } = useAuth();
  const [ex, setEx] = useState<Finding | null>(null);
  const [reason, setReason] = useState('');
  const add = useMutation({ mutationFn: () => api('/quality/exceptions', { body: { targetType: r.target, targetId: r.id, code: ex!.code, reason: reason.trim() } }), onSuccess: () => { setEx(null); setReason(''); onChanged?.(); } });
  const row = (f: Finding, tone: 'danger' | 'warning') => (
    <li key={f.code} className={`rounded border px-2 py-1 text-sm ${tone === 'danger' ? 'border-danger/40 bg-danger/5' : 'border-warning/40 bg-warning/5'}`}>
      <span className="mr-1">{tone === 'danger' ? '✗' : '⚠'}</span><Badge tone={tone}>{FIELD[f.field] ?? f.field}</Badge> {f.message}
      <p className="text-xs text-muted">→ {f.hint}</p>
      {can('quality.exception') && <button type="button" className="text-xs underline" onClick={() => setEx(f)}>Begründete Ausnahme dokumentieren</button>}
    </li>
  );
  return (
    <div className="grid gap-1">
      {r.errors.length > 0 && <><p className="text-xs font-medium text-danger">Fehler ({r.errors.length})</p><ul className="grid gap-1">{r.errors.map((f) => row(f, 'danger'))}</ul></>}
      {r.warnings.length > 0 && <><p className="text-xs font-medium text-warning">Warnungen ({r.warnings.length})</p><ul className="grid gap-1">{r.warnings.map((f) => row(f, 'warning'))}</ul></>}
      {r.excepted.length > 0 && <ul className="grid gap-0.5 text-xs text-muted">{r.excepted.map((f) => <li key={f.code}>✓ Ausnahme zu „{f.message}“: {f.exception.reason} ({f.exception.createdByName}, {dt(f.exception.createdAt)})</li>)}</ul>}
      {!r.errors.length && !r.warnings.length && <p className="text-sm text-success">✓ Keine offenen Befunde.</p>}
      <Modal open={!!ex} title="Begründete Ausnahme" onClose={() => setEx(null)}>
        <form className="grid gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
          <p>{ex?.message}</p>
          <p className="text-xs text-muted">Der Datensatz wird nicht verändert. Die Ausnahme wird mit deinem Namen und der Begründung protokolliert.</p>
          <Input aria-label="Begründung" placeholder="Begründung (mind. 10 Zeichen)" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          {add.error && <p role="alert" className="text-danger">{errText(add.error)}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEx(null)}>Abbrechen</Button><Button disabled={reason.trim().length < 10 || add.isPending}>Speichern</Button></div>
        </form>
      </Modal>
    </div>
  );
}

/** Qualitätsprüfung eines einzelnen Datensatzes (z. B. auf der Berichtsseite). */
export function QualityPanel({ target, id }: { target: QualityTarget; id: string }) {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['quality', target, id], queryFn: () => api<QualityResult>(`/quality/check/${target}/${id}`), enabled: can('quality.view') });
  if (!can('quality.view') || !q.data) return null;
  return <Card title={`🔎 Qualitätsprüfung${q.data.ok ? '' : ' – Korrektur nötig'}`}><Findings r={q.data} onChanged={() => void q.refetch()} /><p className="mt-1 text-[11px] text-muted">Geprüft {dt(q.data.checkedAt)}</p></Card>;
}

export function QualityPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [target, setTarget] = useState<QualityTarget | ''>('');
  const [onlyErrors, setOnlyErrors] = useState(false);
  const q = useQuery({ queryKey: ['quality-overview'], queryFn: () => api<Overview>('/quality/overview') });
  const save = useMutation({ mutationFn: (c: QualityConfig) => api<QualityConfig>('/quality/config', { method: 'PUT', body: c }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['quality-overview'] }) });
  const o = q.data;
  const items = (o?.items ?? []).filter((x) => (!target || x.target === target) && (!onlyErrors || x.errors.length));
  return (
    <>
      <PageHeader title="🔎 Qualitätsprüfer" subtitle="Prüft Berichte, Fahndungen und Einsätze auf fehlende Pflichtangaben, Einsatznummern, widersprüchliche Zeiten und ungültige Verknüpfungen. Er ändert nie Inhalte." />
      {q.isLoading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : o && (
        <div className="grid gap-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['REPORT', 'WANTED', 'INCIDENT'] as const).map((t) => <Stat key={t} label={`${QUALITY_TARGET_LABEL[t]}e geprüft: ${o.summary[t].checked}`} value={o.summary[t].withErrors} tone={o.summary[t].withErrors ? 'danger' : 'success'} hint={`mit Fehlern · ${o.summary[t].withWarnings} nur mit Warnungen`} />)}
          </div>
          {can('quality.manage') && (
            <Card title="Einstellungen">
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <label className="flex items-center gap-2"><Toggle label="Vor dem Einreichen prüfen" checked={o.config.enforceReportSubmit} onChange={(v) => save.mutate({ ...o.config, enforceReportSubmit: v })} />Berichte erst ohne Fehler einreichbar</label>
                <label className="flex items-center gap-2"><Toggle label="Vor dem Abschluss prüfen" checked={o.config.enforceIncidentClose} onChange={(v) => save.mutate({ ...o.config, enforceIncidentClose: v })} />Einsätze erst ohne Fehler abschließbar (Abbrechen bleibt möglich)</label>
                <label className="flex items-center gap-2">Bericht zum abgeschlossenen Einsatz
                  <Select aria-label="Bericht zum Einsatz" className="w-auto" value={o.config.incidentReportRequired} onChange={(e) => save.mutate({ ...o.config, incidentReportRequired: e.target.value as QualityConfig['incidentReportRequired'] })}><option value="OFF">nicht prüfen</option><option value="WARNING">Warnung</option><option value="ERROR">Fehler</option></Select></label>
                <label className="flex items-center gap-2">Mindestlänge Berichtstext<Input aria-label="Mindestlänge Berichtstext" type="number" className="w-24" min={0} max={5000} defaultValue={o.config.reportMinLength} onBlur={(e) => save.mutate({ ...o.config, reportMinLength: Number(e.target.value) || 0 })} /></label>
                <label className="flex items-center gap-2">Mindestlänge Fahndungsbeschreibung<Input aria-label="Mindestlänge Fahndungsbeschreibung" type="number" className="w-24" min={0} max={2000} defaultValue={o.config.wantedMinDescription} onBlur={(e) => save.mutate({ ...o.config, wantedMinDescription: Number(e.target.value) || 0 })} /></label>
                <label className="flex items-center gap-2">Entwurf liegt nach (Std.)<Input aria-label="Entwurf liegt nach Stunden" type="number" className="w-24" min={0} defaultValue={o.config.staleDraftHours} onBlur={(e) => save.mutate({ ...o.config, staleDraftHours: Number(e.target.value) || 0 })} /></label>
              </div>
              {save.error && <p role="alert" className="mt-1 text-sm text-danger">{errText(save.error)}</p>}
            </Card>
          )}
          <Card title={`Befunde (${items.length})`} actions={<span className="flex items-center gap-2 text-xs">
            <Select aria-label="Art" className="w-auto py-1" value={target} onChange={(e) => setTarget(e.target.value as QualityTarget | '')}><option value="">alle</option><option value="REPORT">Berichte</option><option value="WANTED">Fahndungen</option><option value="INCIDENT">Einsätze</option></Select>
            <label className="flex items-center gap-1"><input type="checkbox" checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />nur Fehler</label>
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>Neu prüfen</Button></span>}>
            {!items.length ? <EmptyState text="Keine Befunde." /> : <ul className="grid gap-3">{items.map((r) => (
              <li key={`${r.target}-${r.id}`} className="grid gap-1 rounded-lg border border-line p-2">
                <p className="text-sm"><Badge>{QUALITY_TARGET_LABEL[r.target]}</Badge> <Link className="font-medium underline" to={hrefOf(r)}>{r.number ?? '—'}</Link> · {r.title}</p>
                <Findings r={r} onChanged={() => void q.refetch()} />
              </li>
            ))}</ul>}
            <p className="mt-2 text-[11px] text-muted">Geprüft {dt(o.checkedAt)}</p>
          </Card>
        </div>
      )}
    </>
  );
}
