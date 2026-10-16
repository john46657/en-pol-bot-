import { EmptyState, fmt } from './ui';

export interface TimelineItem { id: string; action: string; summary: string; createdAt: string; actorName?: string | null }
export function Timeline({ items }: { items: TimelineItem[] | undefined }) {
  if (!items?.length) return <EmptyState text="Noch keine Ereignisse im Verlauf." />;
  return (
    <ol className="relative space-y-3 border-l border-line pl-4">
      {items.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border border-line bg-primary" />
          <p className={`text-sm ${e.action.endsWith('.note') ? 'whitespace-pre-wrap rounded-md border border-line bg-panel-2 px-2 py-1.5' : ''}`}>{e.summary}</p>
          <p className="text-xs text-muted"><time dateTime={e.createdAt}>{fmt(e.createdAt)}</time>{e.actorName ? ` · ${e.actorName}` : ''}{e.action.endsWith('.note') ? ' · Notiz' : ''}</p>
        </li>
      ))}
    </ol>
  );
}
