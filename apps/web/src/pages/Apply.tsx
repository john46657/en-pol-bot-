import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { normalizeField, type FormField } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { Button, ErrorState, Field, Input, SkeletonRows, Textarea } from '../components/ui';


/** Öffentliche Bewerbung (kein Login). Das Formular kommt aus der Studio-Konfiguration; der Server validiert erneut. */
export function Apply() {
  const form = useQuery({ queryKey: ['apply-form'], queryFn: () => api<FormField[]>('/applications/form') });
  const [done, setDone] = useState<string>();
  const [err, setErr] = useState<string>();
  const submit = useMutation({
    mutationFn: (b: unknown) => api<{ number: string }>('/applications', { body: b }),
    onSuccess: (r) => setDone(r.number),
    onError: (e) => setErr(e instanceof ApiError ? (e.status === 429 ? 'Too many submissions. Try again later.' : e.message) : 'Submission failed.'),
  });
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    // Text: ein Wert; Auswahl/Rollen: alle gewählten Optionen
    const answers = Object.fromEntries((form.data ?? []).map((x) => [x.key, (x.type ?? 'TEXT') === 'TEXT' ? String(f.get(`a_${x.key}`) ?? '') : f.getAll(`a_${x.key}`).map(String)]));
    setErr(undefined);
    submit.mutate({ robloxUsername: String(f.get('robloxUsername')), robloxUserId: String(f.get('robloxUserId') ?? '') || undefined, answers });
  };
  return (
    <div className="mx-auto max-w-xl p-4 py-10">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><Shield className="text-primary" aria-hidden />Police application</div>
      {done ? <div role="status" className="rounded-lg border border-success/40 bg-success/10 p-4">Thank you! Your application <b>{done}</b> was received. Keep this number.</div>
        : form.isLoading ? <SkeletonRows /> : form.error ? <ErrorState error={form.error} onRetry={() => void form.refetch()} /> : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-panel p-5" aria-label="Application form">
            <Field label="Roblox username *">{(id) => <Input id={id} name="robloxUsername" required maxLength={64} />}</Field>
            <Field label="Roblox user ID" hint="Optional, digits only.">{(id) => <Input id={id} name="robloxUserId" inputMode="numeric" pattern="[0-9]*" maxLength={18} />}</Field>
            {form.data?.map((raw) => <Question key={raw.key} f={raw} />)}
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? 'Sending…' : 'Submit application'}</Button>
          </form>
        )}
    </div>
  );
}

/** Eine Frage: Text (Textfeld), Auswahl oder Rollen-Auswahl (Optionen zum Anklicken). */
function Question({ f: raw }: { f: FormField }) {
  const f = normalizeField(raw);
  const label = `${f.label}${f.required ? ' *' : ''}`;
  if (f.type === 'TEXT') return <Field label={label} hint={f.minLength ? `At least ${f.minLength} characters.` : undefined}>{(id) => <Textarea id={id} name={`a_${f.key}`} required={f.required} minLength={f.minLength || undefined} maxLength={f.maxLength} />}</Field>;
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-muted">{label}{f.multiple ? ' (multiple allowed)' : ''}</legend>
      {f.options.map((o) => (
        <label key={o.label} className="flex items-center gap-2 text-sm">
          <input type={f.multiple ? 'checkbox' : 'radio'} name={`a_${f.key}`} value={o.label} required={f.required && !f.multiple} />{o.label}
        </label>
      ))}
    </fieldset>
  );
}
