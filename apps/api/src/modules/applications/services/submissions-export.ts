import { renderPdf, type PdfLine } from './pdf.js';

/**
 * Export von Bewerbungen (CSV/JSON/PDF): eine Zeile je Bewerbung mit Stammdaten und je Frage eine Spalte.
 * CSV ist gegen Formel-Einschleusung in Tabellenprogrammen geschützt (Zellen, die mit = + - @ beginnen, erhalten ein ').
 */
export const EXPORT_LIMIT = 5000;

export interface ExportRow {
  id: string;
  submissionNumber: string | null;
  applicationName: string;
  applicantName: string;
  userId: string;
  status: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  publicReason: string | null;
  assigneeUserId: string | null;
  isTest: boolean;
  /** Interne Bewertung: Gesamtwert in Prozent (null = nicht bewertet). */
  rating?: number | null | undefined;
  questions: { id: string; title: string; type: string; options?: { value: string; label: string }[] }[];
  answers: Record<string, unknown>;
}

const SKIP = new Set(['PARAGRAPH', 'INFO', 'SEPARATOR']);
const label = (q: ExportRow['questions'][number], x: unknown): string => {
  const one = (v: unknown) => q.options?.find((o) => o.value === String(v))?.label ?? String(v);
  if (Array.isArray(x)) return x.map(one).join(', ');
  if (typeof x === 'boolean') return x ? 'Ja' : 'Nein';
  return one(x);
};
const iso = (d: Date | null) => (d ? d.toISOString() : '');

/** Spalten für die Fragen: Titel, bei doppelten Titeln mit Frage-ID. Reihenfolge: erstes Auftreten. */
function questionColumns(rows: ExportRow[]): { key: string; title: string }[] {
  const seen = new Map<string, string>();
  for (const r of rows) for (const q of r.questions) if (!SKIP.has(q.type) && !seen.has(q.id)) seen.set(q.id, q.title);
  const counts = new Map<string, number>();
  for (const t of seen.values()) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...seen].map(([key, title]) => ({ key, title: (counts.get(title) ?? 0) > 1 ? `${title} (${key})` : title }));
}

const cell = (v: unknown): string => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toExportCsv(rows: ExportRow[]): string {
  const cols = questionColumns(rows);
  const head = ['ID', 'Bewerbung', 'Bewerber', 'Discord-ID', 'Status', 'Eingereicht', 'Entschieden', 'Begründung', 'Bearbeiter', 'Test', 'Bewertung (%)', ...cols.map((c) => c.title)];
  const lines = rows.map((r) =>
    [
      r.submissionNumber ?? r.id,
      r.applicationName,
      r.applicantName,
      r.userId,
      r.status,
      iso(r.submittedAt),
      iso(r.decidedAt),
      r.publicReason ?? '',
      r.assigneeUserId ?? '',
      r.isTest ? 'ja' : '',
      r.rating ?? '',
      ...cols.map((c) => {
        const q = r.questions.find((x) => x.id === c.key);
        const a = r.answers[c.key];
        return q && a !== undefined && a !== null ? label(q, a) : '';
      }),
    ]
      .map(cell)
      .join(','),
  );
  const BOM = String.fromCharCode(0xfeff); // Excel erkennt so UTF-8
  return `${BOM}${[head.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}

export function toExportJson(rows: ExportRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({
      id: r.submissionNumber ?? r.id,
      application: r.applicationName,
      applicant: { name: r.applicantName, discordId: r.userId },
      status: r.status,
      submittedAt: iso(r.submittedAt) || null,
      decidedAt: iso(r.decidedAt) || null,
      reason: r.publicReason,
      assignee: r.assigneeUserId,
      test: r.isTest,
      rating: r.rating ?? null,
      answers: r.questions
        .filter((q) => !SKIP.has(q.type) && r.answers[q.id] !== undefined && r.answers[q.id] !== null)
        .map((q) => ({ question: q.title, answer: label(q, r.answers[q.id]) })),
    })),
    null,
    2,
  );
}

const de = (d: Date | null) => (d ? d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' }) : '–');

/** PDF: je Bewerbung Kopf (ID, Art, Status), Stammdaten und alle Antworten. */
export function toExportPdf(rows: ExportRow[], meta: { guildName?: string | undefined; statusText?: (status: string) => string } = {}): Buffer {
  const lines: PdfLine[] = [
    { text: `Bewerbungen – Export${meta.guildName ? ` (${meta.guildName})` : ''}`, style: 'title' },
    { text: `Erstellt am ${de(new Date())} · ${rows.length} Bewerbung${rows.length === 1 ? '' : 'en'}`, style: 'small' },
  ];
  for (const r of rows) {
    lines.push({ text: `#${r.submissionNumber ?? r.id} · ${r.applicationName} · ${meta.statusText?.(r.status) ?? r.status}`, style: 'bold', gap: 14 });
    lines.push({ text: `Bewerber: ${r.applicantName} (${r.userId}) · Eingereicht: ${de(r.submittedAt)} · Entschieden: ${de(r.decidedAt)}`, style: 'small' });
    if (r.assigneeUserId || r.rating !== undefined) lines.push({ text: `Bearbeiter: ${r.assigneeUserId ?? '–'}${r.rating !== undefined ? ` · Bewertung: ${r.rating === null ? '–' : `${r.rating} %`}` : ''}`, style: 'small' });
    if (r.publicReason) lines.push({ text: `Begründung: ${r.publicReason}`, style: 'small' });
    for (const q of r.questions) {
      if (SKIP.has(q.type)) continue;
      const a = r.answers[q.id];
      lines.push({ text: q.title, style: 'bold', gap: 4 });
      lines.push({ text: a === undefined || a === null || a === '' ? '–' : label(q, a) });
    }
  }
  return renderPdf(lines, { title: 'Bewerbungen' });
}
