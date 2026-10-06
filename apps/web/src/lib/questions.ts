/** Feld des Bewerbungsformulars (Polizei-Bewerbung, `/apply`, Discord). */
export interface FormField { key: string; label: string; required: boolean; maxLength: number }

const OPTIONAL = /\s*\(optional\)\s*$/i;

/** Formular → Textfeld: eine Frage pro Zeile, optionale mit „(optional)“ am Ende. */
export const formToText = (form: FormField[]) => form.map((f) => `${f.label}${f.required ? '' : ' (optional)'}`).join('\n');

/**
 * Textfeld → Formular. Unveränderte Fragen behalten Schlüssel und Länge (damit alte Antworten zugeordnet bleiben);
 * neue Fragen bekommen einen freien Schlüssel `frage1`, `frage2` … und max. 1000 Zeichen.
 */
export function textToForm(text: string, previous: FormField[]): FormField[] {
  const used = new Set<string>();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const out = lines.map((line) => {
    const required = !OPTIONAL.test(line);
    const label = line.replace(OPTIONAL, '').trim();
    const old = previous.find((f) => f.label === label && !used.has(f.key));
    if (old) used.add(old.key);
    return { label, required, old };
  });
  let n = 0;
  const freeKey = () => { let k: string; do k = `frage${++n}`; while (used.has(k) || previous.some((f) => f.key === k)); used.add(k); return k; };
  return out.map(({ label, required, old }) => ({ key: old?.key ?? freeKey(), label, required, maxLength: old?.maxLength ?? 1000 }));
}
