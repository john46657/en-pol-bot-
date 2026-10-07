import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Inbox, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { formatDate } from '../lib/prefs';

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ');

export function Button({ variant = 'primary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' }) {
  const v = { primary: 'bg-primary text-primary-fg hover:brightness-110', secondary: 'bg-panel-2 text-fg border border-line hover:bg-line/50', danger: 'bg-danger text-white hover:brightness-110', ghost: 'text-muted hover:text-fg hover:bg-panel-2' }[variant];
  return <button type="button" {...p} className={cx('inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm', v, className)} />;
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card min-w-0 border border-line', className)}>
      {(title || actions) && <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5"><h2 className="min-w-0 text-sm font-semibold">{title}</h2>{actions}</header>}
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

const TONES = { neutral: 'bg-panel-2 text-muted border-line', info: 'bg-info/15 text-info border-info/30', success: 'bg-success/15 text-success border-success/30', warning: 'bg-warning/15 text-warning border-warning/30', danger: 'bg-danger/15 text-danger border-danger/30', primary: 'bg-primary/15 text-primary border-primary/30' } as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'neutral', children, icon }: { tone?: Tone; children: ReactNode; icon?: string }) {
  return <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide', TONES[tone])}>{icon && <span aria-hidden>{icon}</span>}{children}</span>;
}

/** Status wird immer als Text (nicht nur als Farbe) ausgegeben. */
const STATUS_TONE: Record<string, Tone> = {
  NEW: 'info', ACKNOWLEDGED: 'info', ASSIGNED: 'primary', EN_ROUTE: 'warning', ON_SCENE: 'warning', PROCESSING: 'warning', CLEARING: 'primary', CLOSED: 'neutral', CANCELLED: 'neutral',
  DRAFT: 'neutral', SUBMITTED: 'info', UNDER_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', ARCHIVED: 'neutral',
  ISSUED: 'info', PAID: 'success', VOID: 'danger', ACTIVE: 'success', CLEARED: 'neutral', EXPIRED: 'neutral', OPEN: 'info', SUSPENDED: 'warning',
  RECEIVED: 'info', SCREENING: 'info', INVESTIGATION: 'warning', REVIEW: 'warning', RESOLVED: 'success',
  AVAILABLE: 'success', BUSY: 'warning', UNAVAILABLE: 'danger', OFF_DUTY: 'neutral', ON_DUTY: 'success', BREAK: 'warning',
  COLLECTED: 'info', STORED: 'neutral', TRANSFERRED: 'warning', REVIEWED: 'primary', RELEASED: 'success',
  INTERVIEW: 'warning', PENDING_DECISION: 'warning', ACCEPTED: 'success', WITHDRAWN: 'neutral', PENDING: 'warning', CONFIRMED: 'success',
  ONLINE: 'success', OFFLINE: 'danger', UNKNOWN: 'neutral', ERROR: 'danger',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status.replace(/_/g, ' ')}</Badge>;
const PRIO: Record<string, [Tone, string]> = { LOW: ['neutral', '▽'], MEDIUM: ['info', '◇'], HIGH: ['warning', '△'], URGENT: ['danger', '▲'], CRITICAL: ['danger', '⬣'] };
export const PriorityBadge = ({ priority }: { priority: string }) => <Badge tone={PRIO[priority]?.[0] ?? 'neutral'} icon={PRIO[priority]?.[1]}>{priority}</Badge>;

export const Field = ({ label, error, children, hint }: { label: string; error?: string; children: (id: string) => ReactNode; hint?: string }) => {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">{label}</label>
      {children(id)}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
};
const inputCls = 'w-full rounded-md border border-line bg-bg px-3 py-2 text-sm placeholder:text-muted/60 focus:border-primary';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} {...p} className={cx(inputCls, className)} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={4} {...p} className={cx(inputCls, className)} />);
Textarea.displayName = 'Textarea';
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} {...p} className={cx(inputCls, className)} />);
Select.displayName = 'Select';

export function Modal({ open, title, onClose, children, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose ist oft eine neue Funktion pro Render – nicht als Abhängigkeit, sonst springt der Fokus bei jedem Tastendruck zurück
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // erstes Eingabefeld fokussieren (nicht den Schließen-Button)
    (ref.current?.querySelector<HTMLElement>('header ~ div :is(input,select,textarea,button)') ?? ref.current?.querySelector<HTMLElement>('button'))?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab' && ref.current) { // Fokus-Falle
        const f = [...ref.current.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-2 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('max-h-[92dvh] w-full overflow-auto rounded-lg border border-line bg-panel shadow-xl', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <header className="flex items-center justify-between border-b border-line px-4 py-3"><h2 className="font-semibold">{title}</h2><Button variant="ghost" size="sm" aria-label="Close" onClick={onClose}><X size={16} /></Button></header>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, onConfirm, onClose, busy }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">{message}</p>
      <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{cancelLabel}</Button><Button variant={danger ? 'danger' : 'primary'} disabled={busy} onClick={onConfirm}>{confirmLabel}</Button></div>
    </Modal>
  );
}

export const Skeleton = ({ className = 'h-4 w-full' }: { className?: string }) => <div aria-hidden className={cx('skeleton', className)} />;
export const SkeletonRows = ({ rows = 5 }: { rows?: number }) => <div role="status" aria-label="Loading" className="space-y-2">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;

export function EmptyState({ text, hint, action }: { text: string; hint?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 py-10 text-center text-muted"><Inbox size={28} aria-hidden /><p className="text-sm text-fg">{text}</p>{hint && <p className="text-xs">{hint}</p>}{action}</div>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : undefined;
  if (e?.status === 403) return <Forbidden />;
  return (
    <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
      <AlertTriangle className="text-danger" aria-hidden />
      <p className="text-sm">{e?.message ?? 'Something went wrong.'}</p>
      {e?.requestId && <p className="text-xs text-muted">Request ID: <code>{e.requestId}</code></p>}
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Forbidden() {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <p className="text-5xl font-bold text-muted">403</p>
      <h1 className="mt-2 text-lg font-semibold">Forbidden</h1>
      <p className="mt-1 text-sm text-muted">You do not have permission to view this page. Ask an administrator if you believe this is a mistake.</p>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t} role="tab" aria-selected={t === active} onClick={() => onChange(t)} className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm', t === active ? 'border-primary text-fg' : 'border-transparent text-muted hover:text-fg')}>{t}</button>
      ))}
    </div>
  );
}

export const PageHeader = ({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) => (
  <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-xl font-semibold">{title}</h1>{subtitle && <p className="text-sm text-muted">{subtitle}</p>}</div><div className="flex gap-2">{actions}</div></div>
);

/** Datum/Uhrzeit im persönlichen Format und in der persönlichen Zeitzone (Einstellungen → Persönlich). */
export const fmt = (iso?: string | null) => (iso ? formatDate(iso) : '—');
