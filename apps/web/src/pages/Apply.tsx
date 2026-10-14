import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { isInputQuestion, normalizeField, ROBLOX_NAME, type FormField } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { Button, ErrorState, Field, Input, SkeletonRows, Textarea } from '../components/ui';
import { useDebounced } from '../components/DataTable';


/** Öffentliche Bewerbung (kein Login). Das Formular kommt aus der Studio-Konfiguration; der Server validiert erneut. */
export function Apply() {
  const form = useQuery({ queryKey: ['apply-form'], queryFn: () => api<FormField[]>('/applications/form') });
  const tc = useQuery({ queryKey: ['teamchance-public'], queryFn: () => api<{ isOpen: boolean; reason: string | null; title: string; description: string; closesAt: string | null; remaining: number | null; restrictApplications: boolean }>('/teamchance/public'), retry: false });
  const [done, setDone] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useMutation({
    mutationFn: (b: unknown) => api<{ number: string }>('/applications', { body: b }),
    onSuccess: (r) => setDone(r.number),
    onError: (e) => setErr(e instanceof ApiError ? (e.status === 429 ? 'Zu viele Einsendungen. Versuch es später erneut.' : e.message) : 'Absenden fehlgeschlagen.'),
  });
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Text: ein Wert; Auswahl/Rollen: alle gewählten Optionen
    const answers = Object.fromEntries((form.data ?? []).map((x) => [x.key, isInputQuestion(x.type) ? String(f.get(`a_${x.key}`) ?? '') : f.getAll(`a_${x.key}`).map(String)]));
    setErr(undefined);
    // Eigene Frage „Roblox User“ ersetzt die festen Roblox-Felder (der Server setzt Name + ID aus der geprüften Antwort)
    const rbField = form.data?.find((x) => x.type === 'ROBLOX');
    const robloxUsername = rbField ? String(answers[rbField.key] || '—') : String(f.get('robloxUsername'));
    submit.mutate({ robloxUsername, robloxUserId: rbField ? undefined : String(f.get('robloxUserId') ?? '') || undefined, answers });
  };
  return (
    <div className="mx-auto max-w-xl p-4 py-10">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><Shield className="text-primary" aria-hidden />Polizei-Bewerbung</div>
      {tc.data && (tc.data.isOpen || tc.data.restrictApplications) && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${tc.data.isOpen ? 'border-success/40 bg-success/10' : 'border-danger/40 bg-danger/10'}`}>
          <p className="font-semibold">{tc.data.isOpen ? `📣 ${tc.data.title} – jetzt offen` : `🔒 ${tc.data.title} – derzeit geschlossen`}</p>
          {tc.data.isOpen && tc.data.description && <p className="mt-1 whitespace-pre-wrap">{tc.data.description}</p>}
          {tc.data.isOpen && tc.data.closesAt && <p className="mt-1 text-muted">Bewerbungsschluss: {new Date(tc.data.closesAt).toLocaleString()}</p>}
          {!tc.data.isOpen && <p className="mt-1">Bewerbungen sind nur während einer Team-Chance möglich.</p>}
        </div>
      )}
      {done ? <div role="status" className="rounded-lg border border-success/40 bg-success/10 p-4">Danke! Deine Bewerbung <b>{done}</b> ist eingegangen. Bewahre diese Nummer gut auf.</div>
        : form.isLoading ? <SkeletonRows /> : form.error ? <ErrorState error={form.error} onRetry={() => void form.refetch()} /> : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-panel p-5" aria-label="Bewerbungsformular">
            {!form.data?.some((x) => x.type === 'ROBLOX') && <>
              <Field label="Roblox-Benutzername *">{(id) => <Input id={id} name="robloxUsername" required maxLength={64} />}</Field>
              <Field label="Roblox-Benutzer-ID" hint="Optional, nur Ziffern.">{(id) => <Input id={id} name="robloxUserId" inputMode="numeric" pattern="[0-9]*" maxLength={18} />}</Field>
            </>}
            {form.data?.map((raw) => <Question key={raw.key} f={raw} />)}
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? 'Wird gesendet…' : 'Bewerbung absenden'}</Button>
          </form>
        )}
    </div>
  );
}

/** Eine Frage: Text (Textfeld), Auswahl oder Rollen-Auswahl (Optionen zum Anklicken). */
export function Question({ f: raw }: { f: FormField }) {
  const f = normalizeField(raw);
  const label = `${f.label}${f.required ? ' *' : ''}`;
  if (f.type === 'ROBLOX') return <Field label={label} hint="Such dein Roblox-Konto und wähle es aus.">{(id) => <RobloxPicker id={id} name={`a_${f.key}`} required={f.required} />}</Field>;
  if (f.type === 'TEXT') return <Field label={label} hint={f.minLength ? `Mindestens ${f.minLength} Zeichen.` : undefined}>{(id) => <Textarea id={id} name={`a_${f.key}`} required={f.required} minLength={f.minLength || undefined} maxLength={f.maxLength} />}</Field>;
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-muted">{label}{f.multiple ? ' (Mehrfachauswahl möglich)' : ''}</legend>
      {f.options.map((o) => (
        <label key={o.label} className="flex items-center gap-2 text-sm">
          <input type={f.multiple ? 'checkbox' : 'radio'} name={`a_${f.key}`} value={o.label} required={f.required && !f.multiple} />{o.label}
        </label>
      ))}
    </fieldset>
  );
}

interface RobloxHit { id: string; name: string; displayName: string; avatarUrl: string | null }
/** Frage „Roblox User“: Name eintippen → Konto mit Profilbild auswählen (wie bei Appy). Der Server prüft erneut. */
function RobloxPicker({ id, name, required }: { id: string; name: string; required: boolean }) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<RobloxHit | null>(null);
  const q = useDebounced(text.trim().replace(/^@/, ''), 400);
  const valid = ROBLOX_NAME.test(q);
  const hit = useQuery({ queryKey: ['apply-roblox', q.toLowerCase()], queryFn: () => api<{ profile: RobloxHit | null }>('/applications/roblox', { query: { q } }), enabled: valid && !picked, staleTime: 300_000, retry: false });
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  // Roblox nicht erreichbar → eingetippten Namen nehmen (der Server prüft beim Absenden)
  const fallback = hit.isError && valid ? q : '';
  // Ohne Auswahl ist das Feld (bei Pflicht) ungültig – der Browser verhindert das Absenden
  useEffect(() => { input?.setCustomValidity(text && !picked && !fallback ? 'Bitte dein Roblox-Konto aus der Liste auswählen.' : ''); }, [input, text, picked, fallback]);
  const p = hit.data?.profile;
  return (
    <div className="relative">
      <div className="relative">
        <Input ref={setInput} id={id} required={required} autoComplete="off" maxLength={21} placeholder="Roblox-Benutzername" value={text}
          className={picked ? 'border-success pr-12' : ''}
          onChange={(e) => { setText(e.target.value); setPicked(null); }} />
        {picked?.avatarUrl && <img src={picked.avatarUrl} alt="" className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded" />}
      </div>
      <input type="hidden" name={name} value={picked?.name ?? fallback} />
      {!picked && valid && (
        <div role="listbox" aria-label="Roblox-Konten" className="absolute z-10 mt-1 w-full rounded-lg border border-line bg-panel shadow-lg">
          {hit.isFetching ? <p className="px-3 py-2 text-sm text-muted">Roblox wird durchsucht…</p>
            : p ? <button type="button" role="option" aria-selected={false} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel-2" onClick={() => { setPicked(p); setText(p.name); }}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-10 w-10 rounded" /> : <span className="h-10 w-10 rounded bg-panel-2" />}
                <span><span className="block font-medium">{p.name}</span>{p.displayName !== p.name && <span className="text-xs text-muted">{p.displayName}</span>}</span>
              </button>
            : hit.isError ? <p className="px-3 py-2 text-sm text-muted">Roblox ist gerade nicht erreichbar – versuch es gleich noch einmal.</p>
            : <p className="px-3 py-2 text-sm text-danger">Kein Roblox-Konto mit diesem Namen.</p>}
        </div>
      )}
    </div>
  );
}
