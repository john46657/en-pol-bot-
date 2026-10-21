import { describe, expect, it } from 'vitest';
import { checkStatusChange, formModal, parseFormDate, parseTicketRef, planFormSteps, slaState, statusPermission, ticketRef, validateForm, type TicketQuestion } from '../src';

const SONSTIGES: TicketQuestion[] = [
  { id: 'subject', label: 'Betreff', type: 'SHORT', required: true, options: [], maxLength: 100 },
  { id: 'topic', label: 'Worum geht es?', type: 'SELECT', required: true, options: ['Allgemeine Frage', 'Technisches Problem', 'Sonstiges'] },
  { id: 'text', label: 'Beschreibung des Anliegens', type: 'LONG', required: true, options: [], minLength: 10, maxLength: 2000 },
  { id: 'area', label: 'Betroffener Bereich', type: 'SELECT', required: false, options: ['Discord-Server', 'Web-Dashboard'] },
  { id: 'more', label: 'Zusätzliche Informationen', type: 'LONG', required: false, options: [], maxLength: 2000 },
  { id: 'file', label: 'Anhang oder Screenshot', type: 'FILE', required: false, options: [] },
];

describe('ticket refs', () => {
  it('formats and parses permanent IDs', () => {
    expect(ticketRef(123)).toBe('EMD-000123');
    expect(ticketRef(5, 'SUP', 4)).toBe('SUP-0005');
    expect(parseTicketRef('EMD-000123')).toBe(123);
    expect(parseTicketRef('#42')).toBe(42);
    expect(parseTicketRef('7')).toBe(7);
    for (const bad of ['EMD-000000', 'EMD-12a', '../1', 'EMD-1;DROP', '']) expect(parseTicketRef(bad)).toBeNull();
  });
});

describe('form validation (same code for Discord and dashboard preview)', () => {
  it('accepts a valid form and keeps labels with the answers', () => {
    const r = validateForm(SONSTIGES, { subject: 'Login geht nicht', topic: 'Technisches Problem', text: 'Seit heute kann ich mich nicht anmelden.', area: [] });
    expect(r.ok).toBe(true);
    expect(r.answers.map((a) => [a.questionId, a.label, a.value])).toEqual([
      ['subject', 'Betreff', 'Login geht nicht'], ['topic', 'Worum geht es?', 'Technisches Problem'], ['text', 'Beschreibung des Anliegens', 'Seit heute kann ich mich nicht anmelden.'],
      ['area', 'Betroffener Bereich', '—'], ['more', 'Zusätzliche Informationen', '—'], ['file', 'Anhang oder Screenshot', '—'],
    ]);
  });
  it('rejects missing required fields, length violations and manipulated choices', () => {
    const r = validateForm(SONSTIGES, { subject: 'x'.repeat(101), topic: 'Hackerangriff', text: 'zu kurz', injected: 'ignored' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['subject', 'text', 'topic']);
    expect(r.errors.text).toContain('mindestens 10');
    expect(validateForm(SONSTIGES, {}).errors.subject).toContain('Pflichtfeld');
  });
  it('validates numbers, dates, checkboxes, multi-choice and files', () => {
    const f: TicketQuestion[] = [
      { id: 'n', label: 'Anzahl', type: 'NUMBER', required: true, options: [], min: 1, max: 10 },
      { id: 'd', label: 'Datum', type: 'DATE', required: true, options: [] },
      { id: 'c', label: 'Regeln gelesen', type: 'CHECKBOX', required: true, options: [] },
      { id: 'm', label: 'Bereiche', type: 'MULTI', required: false, options: ['A', 'B'] },
      { id: 'f', label: 'Screenshot', type: 'FILE', required: true, options: [], max: 1 },
    ];
    const png = { name: 'a.png', size: 1000, contentType: 'image/png', url: 'https://cdn.discordapp.com/a.png' };
    const ok = validateForm(f, { n: '3,5', d: '2026-10-21', c: ['Ja'], m: ['A', 'B'] }, { f: [png] });
    expect(ok.ok).toBe(true);
    expect(ok.answers.map((a) => a.value)).toEqual(['3,5', '21.10.2026', 'Ja', 'A, B', 'a.png']);
    const bad = validateForm(f, { n: '11', d: '31.02.2026', c: false, m: ['C'] }, { f: [{ ...png, contentType: 'application/x-msdownload', name: 'x.exe' }] });
    expect(Object.keys(bad.errors).sort()).toEqual(['c', 'd', 'f', 'm', 'n']);
    expect(validateForm(f, {}, { f: [{ ...png, size: 20 * 1024 * 1024 }] }).errors.f).toContain('zu groß');
    expect(parseFormDate('1.2.2026')).toBe('01.02.2026');
  });
  it('skips disabled fields and validates single steps', () => {
    const f = SONSTIGES.map((q) => (q.id === 'more' ? { ...q, enabled: false } : q));
    expect(planFormSteps(f)).toEqual([['subject', 'topic', 'text', 'area', 'file']]);
    expect(planFormSteps(SONSTIGES)).toEqual([['subject', 'topic', 'text', 'area', 'more'], ['file']]);
    expect(validateForm(SONSTIGES, { subject: 'Hallo' }, {}, { only: ['subject'] }).ok).toBe(true);
  });
  it('builds Discord modal specs within the limits', () => {
    const m = formModal('tk:formsub:x:0', 'Sonstiges – Schritt 1/2', SONSTIGES, { topic: 'Sonstiges', subject: 'Alt' });
    expect(m.fields).toHaveLength(5);
    expect(m.fields[0]).toMatchObject({ kind: 'text', maxLength: 100, value: 'Alt', required: true });
    expect(m.fields[1]).toMatchObject({ kind: 'select', minValues: 1, maxValues: 1 });
    expect(m.fields[1]!.options!.find((o) => o.value === 'Sonstiges')!.default).toBe(true);
    expect(m.fields[3]).toMatchObject({ kind: 'select', minValues: 0 });
    expect(formModal('x', 'y', [SONSTIGES[5]!]).fields[0]).toMatchObject({ kind: 'file', minValues: 0, maxValues: 1 });
  });
});

describe('status lifecycle', () => {
  const open = { kind: 'OPEN' }, closed = { kind: 'CLOSED' }, archived = { kind: 'ARCHIVED' };
  it('allows only valid transitions per path', () => {
    expect(checkStatusChange(open, open, 'status')).toBeNull();
    expect(checkStatusChange(open, closed, 'status')).toContain('Schließen');
    expect(checkStatusChange(open, archived, 'status')).toContain('geschlossene');
    expect(checkStatusChange(closed, archived, 'status')).toBeNull();
    expect(checkStatusChange(closed, open, 'status')).toContain('Wieder öffnen');
    expect(checkStatusChange(archived, closed, 'status')).not.toBeNull();
    expect(checkStatusChange(open, archived, 'archive')).toContain('geschlossene');
    expect(checkStatusChange(closed, archived, 'archive')).toBeNull();
    expect(checkStatusChange(archived, open, 'reopen')).toBeNull();
    expect(checkStatusChange(open, open, 'reopen')).toContain('bereits offen');
    expect(statusPermission(archived)).toBe('ticket.archive');
    expect(statusPermission(open)).toBe('ticket.change_status');
  });
});

describe('SLA', () => {
  const base = { createdAt: new Date('2026-10-21T10:00:00Z'), firstResponseAt: null, closedAt: null, waitingSince: null, waitingSeconds: 0 };
  it('has no deadlines without configured targets', () => {
    const s = slaState({ ...base, firstResponseMinutes: null, resolutionMinutes: null }, new Date('2030-01-01'));
    expect(s.firstDueAt).toBeNull(); expect(s.firstOverdue).toBe(false); expect(s.resolveOverdue).toBe(false);
  });
  it('detects overdue first response and pauses resolution while waiting for the user', () => {
    const now = new Date('2026-10-21T12:30:00Z');
    const s = slaState({ ...base, firstResponseMinutes: 60, resolutionMinutes: 120 }, now);
    expect(s.firstOverdue).toBe(true); expect(s.resolveOverdue).toBe(true);
    expect(slaState({ ...base, firstResponseMinutes: 60, resolutionMinutes: 120, waitingSince: new Date('2026-10-21T11:00:00Z') }, now).resolveOverdue).toBe(false);
    const after = slaState({ ...base, firstResponseAt: new Date(), firstResponseMinutes: 60, resolutionMinutes: 120, waitingSeconds: 3600 }, now);
    expect(after.firstOverdue).toBe(false);
    expect(after.resolveDueAt!.toISOString()).toBe('2026-10-21T13:00:00.000Z');
    expect(after.resolveOverdue).toBe(false);
  });
});
