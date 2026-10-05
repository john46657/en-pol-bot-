/**
 * Minimaler PDF-Schreiber (PDF 1.4, A4, Helvetica/Helvetica-Bold, WinAnsi) für Exporte – ohne Fremdbibliothek.
 * Text wird umbrochen und auf Seiten verteilt; Zeichen außerhalb von WinAnsi (z. B. Emojis) werden durch „?“ ersetzt.
 */
export interface PdfLine {
  text: string;
  /** title = groß und fett, bold = fett, normal = Standard, small = klein und grau */
  style?: 'title' | 'bold' | 'normal' | 'small';
  /** Zusätzlicher Abstand davor (Punkte). */
  gap?: number;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 50;
const SIZE = { title: 15, bold: 10, normal: 10, small: 8 } as const;

// Unicode → WinAnsi (cp1252) für die Zeichen jenseits von Latin-1, die in deutschen Texten vorkommen
const CP1252: Record<number, number> = { 0x20ac: 0x80, 0x201a: 0x82, 0x201e: 0x84, 0x2026: 0x85, 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95 };
function toWinAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0x09) out.push(0x20);
    else if (c >= 0x20 && c < 0x7f) out.push(c);
    else if (c >= 0xa0 && c <= 0xff) out.push(c);
    else if (CP1252[c] !== undefined) out.push(CP1252[c]);
    else if (c === 0xfe0f || c === 0x200d) continue; // Emoji-Varianten/Verbinder still entfernen
    else out.push(0x3f); // ?
  }
  return out;
}
/** PDF-String-Literal (Bytes in WinAnsi, Klammern/Backslash maskiert). */
function literal(s: string): string {
  return `(${toWinAnsi(s)
    .map((b) => (b === 0x28 || b === 0x29 || b === 0x5c ? `\\${String.fromCharCode(b)}` : b < 0x20 || b > 0x7e ? `\\${b.toString(8).padStart(3, '0')}` : String.fromCharCode(b)))
    .join('')})`;
}

/** Grobe Breite (Helvetica ≈ 0,5 em je Zeichen, fett etwas breiter) – genügt für den Zeilenumbruch. */
function wrap(text: string, size: number, bold: boolean): string[] {
  const max = Math.max(10, Math.floor((PAGE_W - 2 * MARGIN) / (size * (bold ? 0.56 : 0.51))));
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (word.length > max) {
        if (line) out.push(line);
        for (let i = 0; i < word.length; i += max) out.push(word.slice(i, i + max));
        line = '';
        continue;
      }
      if ((line ? `${line} ${word}` : word).length > max) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    out.push(line);
  }
  return out;
}

export function renderPdf(lines: PdfLine[], meta: { title: string }): Buffer {
  const pages: string[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => {
    if (ops.length) pages.push(ops.join('\n'));
    ops = [];
    y = PAGE_H - MARGIN;
  };
  for (const l of lines) {
    const style = l.style ?? 'normal';
    const size = SIZE[style];
    const bold = style === 'title' || style === 'bold';
    const lead = size * 1.35;
    y -= l.gap ?? 0;
    for (const part of wrap(l.text, size, bold)) {
      if (y - lead < MARGIN) newPage();
      y -= lead;
      const gray = style === 'small' ? '0.4 g ' : '0 g ';
      ops.push(`BT ${gray}/${bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN} ${y.toFixed(1)} Td ${literal(part)} Tj ET`);
    }
  }
  newPage();
  if (pages.length === 0) pages.push('');

  // Objekte: 1 Katalog, 2 Seitenbaum, 3/4 Schriften, 5 Info, dann je Seite Inhalt + Seite
  const objs: string[] = [];
  const pageIds: number[] = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = `<< /Title ${literal(meta.title)} /Producer (NEXUS) >>`;
  let id = 6;
  for (const [i, content] of pages.entries()) {
    const footer = `BT 0.4 g /F1 8 Tf ${MARGIN} 30 Td ${literal(`${meta.title} – Seite ${i + 1} von ${pages.length}`)} Tj ET`;
    const stream = `${content}\n${footer}`;
    objs[id] = `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`;
    objs[id + 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${id} 0 R >>`;
    pageIds.push(id + 1);
    id += 2;
  }
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = Buffer.byteLength(out, 'latin1');
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objs.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
