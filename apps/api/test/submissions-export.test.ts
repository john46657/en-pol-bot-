import { describe, expect, it } from 'vitest';
import {
  toExportPdf,
  toExportCsv,
  toExportJson,
  type ExportRow,
} from '../src/modules/applications/services/submissions-export.js';

const q = [
  { id: 'name', title: 'Wie heißt du?', type: 'TEXT' },
  {
    id: 'abt',
    title: 'Abteilung',
    type: 'SINGLE_SELECT',
    options: [{ value: 'streife', label: 'Streifendienst' }],
  },
  { id: 'info', title: 'Hinweis', type: 'INFO' },
  {
    id: 'multi',
    title: 'Ausbildungen',
    type: 'MULTI_SELECT',
    options: [
      { value: 'funk', label: 'Funk' },
      { value: 'eh', label: 'Erste Hilfe' },
    ],
  },
];
const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  id: 'x1',
  submissionNumber: 'POL-00152',
  applicationName: 'Polizei',
  applicantName: 'Max "Maxi" Muster',
  userId: '123456789012',
  status: 'ACCEPTED',
  submittedAt: new Date('2026-10-05T10:00:00Z'),
  decidedAt: new Date('2026-10-06T10:00:00Z'),
  publicReason: 'Willkommen, Team',
  assigneeUserId: '999999999999',
  isTest: false,
  questions: q,
  answers: { name: 'Max Mustermann', abt: 'streife', multi: ['funk', 'eh'], info: 'ignoriert' },
  ...over,
});

describe('Bewerbungs-Export (Spezifikation 23)', () => {
  it('CSV: Kopfzeile, eine Spalte je Frage (ohne Hinweisfelder), Optionen als Beschriftung, Maskierung, BOM', () => {
    const csv = toExportCsv([row()]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [head, line] = csv.slice(1).split('\r\n');
    expect(head).toBe(
      'ID,Bewerbung,Bewerber,Discord-ID,Status,Eingereicht,Entschieden,Begründung,Bearbeiter,Test,Bewertung (%),Wie heißt du?,Abteilung,Ausbildungen',
    );
    expect(line).toContain('POL-00152');
    expect(line).toContain('"Max ""Maxi"" Muster"'); // Anführungszeichen verdoppelt
    expect(line).toContain('"Willkommen, Team"'); // Komma maskiert
    expect(line).toContain('Streifendienst');
    expect(line).toContain('"Funk, Erste Hilfe"');
    expect(line).not.toContain('ignoriert');
  });
  it('schützt vor Formel-Einschleusung', () => {
    const csv = toExportCsv([
      row({
        answers: { name: '=HYPERLINK("http://böse")', abt: '+cmd' },
        applicantName: '@evil',
        publicReason: '-1+1',
      }),
    ]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@evil");
    expect(csv).toContain("'-1+1");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
  it('gleiche Titel verschiedener Versionen werden unterscheidbar; fehlende Antworten bleiben leer', () => {
    const a = row({ questions: [{ id: 'a', title: 'Alter', type: 'NUMBER' }], answers: { a: 19 } });
    const b = row({ questions: [{ id: 'b', title: 'Alter', type: 'NUMBER' }], answers: {} });
    const [head, l1, l2] = toExportCsv([a, b]).slice(1).split('\r\n');
    expect(head).toContain('Alter (a),Alter (b)');
    expect(l1!.endsWith(',19,')).toBe(true);
    expect(l2!.endsWith(',,')).toBe(true);
  });
  it('JSON: strukturiert, Antworten mit Fragetext, ohne Hinweisfelder', () => {
    const j = JSON.parse(toExportJson([row()]));
    expect(j[0]).toMatchObject({
      id: 'POL-00152',
      application: 'Polizei',
      applicant: { discordId: '123456789012' },
      status: 'ACCEPTED',
      assignee: '999999999999',
      test: false,
    });
    expect(j[0].answers).toEqual([
      { question: 'Wie heißt du?', answer: 'Max Mustermann' },
      { question: 'Abteilung', answer: 'Streifendienst' },
      { question: 'Ausbildungen', answer: 'Funk, Erste Hilfe' },
    ]);
  });
});

describe('PDF-Export (Team-Chance Punkt 20)', () => {
  const pdfText = (b: Buffer) => b.toString('latin1');
  it('gültiger Aufbau: Kopf, Objekte, Querverweistabelle mit korrekten Positionen, Ende', async () => {
    const { renderPdf } = await import('../src/modules/applications/services/pdf.js');
    const b = renderPdf([{ text: 'Titel', style: 'title' }, { text: 'Hallo (Welt) \\ äöüß €' }], { title: 'Test' });
    const t = pdfText(b);
    expect(t.startsWith('%PDF-1.4')).toBe(true);
    expect(t.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(t)![1]);
    expect(t.slice(start, start + 4)).toBe('xref');
    const offsets = [...t.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => expect(t.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(t).toContain('(Hallo \\(Welt\\) \\\\ \\344\\366\\374\\337 \\200) Tj'); // Klammern/Backslash maskiert, Umlaute und € in WinAnsi
  });
  it('lange Exporte gehen auf mehrere Seiten; Emojis werden ersetzt; Seitenzahl im Fuß', async () => {
    const many = Array.from({ length: 40 }, (_, i) => row({ id: `id-${i}`, submissionNumber: `POL-${String(i).padStart(5, '0')}` }));
    const t = pdfText(toExportPdf(many, { guildName: 'Testserver 🚓', statusText: () => 'Angenommen' }));
    const pages = Number(/\/Count (\d+)/.exec(t)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(t).toContain(`Seite ${pages} von ${pages}`);
    expect(t).toContain('Testserver ?');
    expect(t).toContain('#POL-00039');
    expect(t).toContain('Angenommen');
    expect(t).toContain('Streifendienst'); // Antworten mit Beschriftung
    expect(t).not.toContain('ignoriert'); // Hinweisfelder nicht
  });
  it('Bewertung in CSV, JSON und PDF', () => {
    const r = row({ rating: 75 });
    expect(toExportCsv([r]).split('\r\n')[1]).toContain(',75,');
    expect(JSON.parse(toExportJson([r]))[0].rating).toBe(75);
    expect(pdfText(toExportPdf([r]))).toContain('Bewertung: 75 %');
  });
});
