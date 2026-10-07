/**
 * Studio-Workflows: „Wenn <Ereignis> (und Bedingungen) → Aktionen“.
 * Ereignisse sind Einträge im Audit-Protokoll (`action`), Bedingungen prüfen Felder des neuen Stands (`after`).
 */
export interface WorkflowTrigger { key: string; label: string; fields: string[] }

/** Vorschläge im Editor. Eigene Ereignisse (jede Audit-Aktion, auch mit `*` am Ende) sind erlaubt. */
export const WORKFLOW_TRIGGERS: WorkflowTrigger[] = [
  { key: 'incident.create', label: 'Einsatz angelegt (MDT)', fields: ['number', 'title', 'priority', 'location', 'status'] },
  { key: 'cad.incident.create', label: 'CAD-Einsatz angelegt', fields: ['number', 'title', 'priority', 'type', 'location', 'keyword'] },
  { key: 'incident.status', label: 'Einsatzstatus geändert', fields: ['number', 'status', 'priority'] },
  { key: 'report.create', label: 'Bericht angelegt', fields: ['title', 'type', 'status'] },
  { key: 'report.submitted', label: 'Bericht eingereicht', fields: ['title', 'type', 'status'] },
  { key: 'report.approved', label: 'Bericht genehmigt', fields: ['title', 'type'] },
  { key: 'report.rejected', label: 'Bericht abgelehnt', fields: ['title', 'type'] },
  { key: 'complaint.create', label: 'Beschwerde eingegangen', fields: ['title', 'status'] },
  { key: 'wanted.create', label: 'Fahndung angelegt', fields: ['subject', 'priority', 'kind', 'status'] },
  { key: 'investigation.create', label: 'Ermittlung eröffnet', fields: ['title', 'status'] },
  { key: 'evidence.create', label: 'Beweismittel erfasst', fields: ['description', 'status'] },
  { key: 'person.create', label: 'Personenakte angelegt', fields: ['robloxUsername', 'status'] },
  { key: 'ticket.create', label: 'Strafzettel ausgestellt', fields: ['number', 'status'] },
  { key: 'application.submit', label: 'Bewerbung eingegangen', fields: ['status'] },
  { key: 'leave.request', label: 'Abmeldung beantragt', fields: ['reason', 'status'] },
  { key: 'leave.approve', label: 'Abmeldung angenommen', fields: ['reason'] },
  { key: 'leave.deny', label: 'Abmeldung abgelehnt', fields: ['reason'] },
  { key: 'personnel.promote', label: 'Beförderung', fields: ['rank', 'callsign'] },
  { key: 'danger.set', label: 'Gefahrenstatus geändert', fields: ['level'] },
  { key: 'lock.takeover', label: 'Bearbeitung übernommen', fields: [] },
  { key: 'auth.2fa.reset', label: 'Zwei-Faktor zurückgesetzt', fields: [] },
];

export const WORKFLOW_OPS = ['eq', 'neq', 'contains', 'in', 'exists', 'not_exists'] as const;
export type WorkflowOp = (typeof WORKFLOW_OPS)[number];
export const WORKFLOW_OP_LABELS: Record<WorkflowOp, string> = { eq: 'ist', neq: 'ist nicht', contains: 'enthält', in: 'ist eins von (Komma)', exists: 'ist gesetzt', not_exists: 'ist leer' };

export interface WorkflowCondition { field: string; op: WorkflowOp; value?: string }
export type WorkflowAction =
  | { type: 'notify_permission'; permission: string; title: string; body?: string }
  | { type: 'notify_role'; roleId: string; title: string; body?: string }
  | { type: 'discord'; channelIds: string[]; pingRoleIds?: string[]; title: string; text?: string; color?: string };

export const WORKFLOW_ACTION_LABELS: Record<WorkflowAction['type'], string> = {
  notify_permission: '🔔 Benachrichtigung an alle mit Recht …',
  notify_role: '🔔 Benachrichtigung an Rolle …',
  discord: '💬 Discord-Meldung in Kanal …',
};

/** Ereignis-Muster: genau oder mit `*` am Ende (z. B. `report.*`). */
export const triggerMatches = (pattern: string, action: string) => (pattern.endsWith('*') ? action.startsWith(pattern.slice(0, -1)) : pattern === action);

/** Feld lesen, auch verschachtelt (`unit.callsign`). */
export function fieldValue(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split('.')) { if (cur === null || typeof cur !== 'object') return undefined; cur = (cur as Record<string, unknown>)[k]; }
  return cur;
}

export function conditionMatches(after: unknown, c: WorkflowCondition): boolean {
  const v = fieldValue(after, c.field);
  const s = v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const want = (c.value ?? '').trim();
  switch (c.op) {
    case 'eq': return s.toLowerCase() === want.toLowerCase();
    case 'neq': return s.toLowerCase() !== want.toLowerCase();
    case 'contains': return s.toLowerCase().includes(want.toLowerCase());
    case 'in': return want.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(s.toLowerCase());
    case 'exists': return s !== '';
    case 'not_exists': return s === '';
  }
}

/** `{{feld}}` / `{{after.feld}}` / `{{action}}` / `{{actor}}` / `{{entityId}}` ersetzen. Werte werden gekürzt; Discord-Erwähnungen entschärft der Bot. */
export function renderTemplate(tpl: string, ctx: { action: string; entityType?: string | null; entityId?: string | null; actor?: string | null; after?: unknown }) {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const base: Record<string, unknown> = { action: ctx.action, entityType: ctx.entityType ?? '', entityId: ctx.entityId ?? '', actor: ctx.actor ?? 'System' };
    const v = key in base ? base[key] : fieldValue(ctx.after, key.startsWith('after.') ? key.slice(6) : key);
    const s = v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.slice(0, 300);
  });
}
