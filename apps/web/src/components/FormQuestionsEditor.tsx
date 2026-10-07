import { RolePicker } from './DiscordPickers';
import { useState } from 'react';
import { ChevronDown, Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { FORM_QUESTION_TYPES, isInputQuestion, MAX_FORM_OPTIONS, MAX_FORM_QUESTIONS, freeFieldKey, type FormField, type FormQuestionType } from '@enrp/shared';
import { Button, Input, Select, Textarea } from './ui';

const move = <T,>(a: T[], from: number, to: number) => { const b = [...a]; const [x] = b.splice(from, 1); b.splice(to, 0, x!); return b; };
const newQuestion = (used: string[]): FormField => ({ key: freeFieldKey(used), label: '', type: 'TEXT', required: true, minLength: 0, maxLength: 1000, options: [], multiple: false });

/**
 * Bewerbungsfragen bearbeiten wie bei Appy: je Frage eine Karte mit Typ (Text / Auswahl / Rollen-Auswahl),
 * Duplizieren, Löschen, Verschieben (Ziehen oder ↑ ↓) und Prüf-Einstellungen.
 */
export function FormQuestionsEditor({ value, onChange, disabled }: { value: FormField[]; onChange: (v: FormField[]) => void; disabled?: boolean }) {
  const [drag, setDrag] = useState<number | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const patch = (i: number, p: Partial<FormField>) => onChange(value.map((q, j) => (j === i ? { ...q, ...p } : q)));
  const keys = value.map((q) => q.key);
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold">Questions: <span className="text-muted">{value.length}/{MAX_FORM_QUESTIONS}</span></p>
      {value.map((q, i) => {
        const type = q.type ?? 'TEXT';
        const show = open[q.key] ?? false;
        return (
          <section key={q.key} aria-label={`Question ${i + 1}`}
            onDragOver={(e) => { if (drag !== null) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) onChange(move(value, drag, i)); setDrag(null); }}
            className={`rounded-lg border bg-panel-2/40 ${drag === i ? 'border-primary opacity-60' : 'border-line'}`}>
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
              <span draggable={!disabled} onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} className="cursor-grab text-muted" title="Drag to reorder" aria-hidden><GripVertical size={18} /></span>
              <h3 className="font-semibold">Question {i + 1}</h3>
              <span className="ml-auto flex flex-wrap items-center gap-1">
                <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} up`} disabled={disabled || i === 0} onClick={() => onChange(move(value, i, i - 1))}>↑</Button>
                <Button size="sm" variant="ghost" aria-label={`Move question ${i + 1} down`} disabled={disabled || i === value.length - 1} onClick={() => onChange(move(value, i, i + 1))}>↓</Button>
                <div className="w-40"><Select aria-label={`Type of question ${i + 1}`} value={type} disabled={disabled} onChange={(e) => {
                  const t = e.target.value as FormQuestionType;
                  patch(i, { type: t, options: isInputQuestion(t) ? [] : (q.options?.length ? q.options : [{ label: '' }, { label: '' }]), multiple: isInputQuestion(t) ? false : q.multiple, ...(t === 'ROBLOX' ? { maxLength: 20, minLength: 0 } : {}) });
                  setOpen({ ...open, [q.key]: !isInputQuestion(t) || show });
                }}>{(Object.keys(FORM_QUESTION_TYPES) as FormQuestionType[]).map((t) => <option key={t} value={t}>{FORM_QUESTION_TYPES[t]}</option>)}</Select></div>
                <Button size="sm" variant="ghost" aria-label={`Duplicate question ${i + 1}`} disabled={disabled || value.length >= MAX_FORM_QUESTIONS} onClick={() => onChange([...value.slice(0, i + 1), { ...q, key: freeFieldKey(keys), options: q.options?.map((o) => ({ ...o })) }, ...value.slice(i + 1)])}><Copy size={16} /></Button>
                <Button size="sm" variant="ghost" aria-label={`Delete question ${i + 1}`} disabled={disabled || value.length <= 1} onClick={() => onChange(value.filter((_, j) => j !== i))} className="text-danger"><Trash2 size={16} /></Button>
              </span>
            </header>
            <div className="grid gap-2 p-3">
              <Textarea aria-label={`Text of question ${i + 1}`} rows={2} maxLength={300} value={q.label} disabled={disabled} placeholder="Your question …" onChange={(e) => patch(i, { label: e.target.value })} />
              <button type="button" aria-expanded={show} onClick={() => setOpen({ ...open, [q.key]: !show })} className="flex flex-wrap items-center gap-x-2 self-start text-left text-sm font-semibold">
                <span className="flex items-center gap-1 whitespace-nowrap">Validation settings <ChevronDown size={16} className={show ? 'rotate-180 transition' : 'transition'} aria-hidden /></span>
                {!show && <span className="text-xs font-normal text-muted">{q.required ? 'required' : 'optional'}{type === 'ROBLOX' ? ' · checked on Roblox' : type === 'TEXT' ? ` · ${q.minLength ? `${q.minLength}–` : 'max. '}${q.maxLength} chars` : ` · ${q.options?.length ?? 0} options${q.multiple ? ' · multiple' : ''}`}</span>}
              </button>
              {show && (
                <div className="grid gap-3 rounded-md border border-line p-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={q.required} disabled={disabled} onChange={(e) => patch(i, { required: e.target.checked })} />Required{!q.required && <span className="text-xs text-muted">(applicants can skip it)</span>}</label>
                  {type === 'TEXT' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs text-muted">Min. length (characters)<Input type="number" min={0} max={5000} value={q.minLength ?? 0} disabled={disabled} onChange={(e) => patch(i, { minLength: Math.max(0, Number(e.target.value) || 0) })} /></label>
                      <label className="grid gap-1 text-xs text-muted">Max. length (characters)<Input type="number" min={1} max={5000} value={q.maxLength} disabled={disabled} onChange={(e) => patch(i, { maxLength: Math.max(1, Number(e.target.value) || 1) })} /></label>
                    </div>
                  )}
                  {type === 'ROBLOX' && <p className="text-xs text-muted">Applicants search their Roblox account (with profile picture) and pick it. The server checks that the account exists and saves name + Roblox ID.</p>}
                  {!isInputQuestion(type) && (
                    <>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!q.multiple} disabled={disabled} onChange={(e) => patch(i, { multiple: e.target.checked })} />Allow multiple selections</label>
                      <div className="grid gap-2">
                        <p className="text-xs text-muted">{type === 'ROLE' ? 'Options – each gives its Discord role when the application is accepted.' : 'Options'}</p>
                        {(q.options ?? []).map((o, j) => (
                          <div key={j} className="flex flex-wrap gap-2">
                            <Input aria-label={`Option ${j + 1}`} className="min-w-0 flex-1" maxLength={100} value={o.label} disabled={disabled} placeholder={type === 'ROLE' ? 'e.g. Hubschrauber' : 'Option'} onChange={(e) => patch(i, { options: q.options!.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                            {type === 'ROLE' && <div className="w-64"><RolePicker ariaLabel={`Role of option ${j + 1}`} disabled={disabled} max={1} value={o.roleId ? [o.roleId] : []} onChange={(ids) => patch(i, { options: q.options!.map((x, k) => (k === j ? { ...x, roleId: ids[0] ?? '' } : x)) })} /></div>}
                            <Button size="sm" variant="ghost" aria-label={`Remove option ${j + 1}`} disabled={disabled} onClick={() => patch(i, { options: q.options!.filter((_, k) => k !== j) })}><Trash2 size={14} /></Button>
                          </div>
                        ))}
                        <div><Button size="sm" variant="secondary" disabled={disabled || (q.options?.length ?? 0) >= MAX_FORM_OPTIONS} onClick={() => patch(i, { options: [...(q.options ?? []), { label: '' }] })}><Plus size={14} />Add option</Button></div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
      <div><Button variant="secondary" disabled={disabled || value.length >= MAX_FORM_QUESTIONS} onClick={() => onChange([...value, newQuestion(keys)])}><Plus size={16} />Add question</Button></div>
    </div>
  );
}
