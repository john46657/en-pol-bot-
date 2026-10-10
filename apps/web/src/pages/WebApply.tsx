import { useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { isInputQuestion, type FormField } from '@enrp/shared';
import { api, ApiError } from '../lib/api';
import { Button, ErrorState, Field, Input, SkeletonRows } from '../components/ui';
import { Question } from './Apply';

interface WebForm { title: string; name: string; discordName: string; expiresAt: string; questions: FormField[]; robloxField: boolean }

/** Bewerbungsart „Web“: Formular zu einem persönlichen Link aus dem Discord-Bot (kein Konto nötig). */
export function WebApply() {
  const { token = '' } = useParams();
  const form = useQuery({ queryKey: ['web-apply', token], queryFn: () => api<WebForm>(`/web-apply/${encodeURIComponent(token)}`), retry: false });
  const [done, setDone] = useState<{ number: string; message: string }>();
  const [err, setErr] = useState<string>();
  const submit = useMutation({
    mutationFn: (b: unknown) => api<{ number: string; message: string }>(`/web-apply/${encodeURIComponent(token)}`, { body: b }),
    onSuccess: setDone,
    onError: (e) => setErr(e instanceof ApiError ? (e.status === 429 ? 'Zu viele Versuche. Versuch es später erneut.' : e.message) : 'Absenden fehlgeschlagen.'),
  });
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const answers = Object.fromEntries((form.data?.questions ?? []).map((x) => [x.key, isInputQuestion(x.type) ? String(f.get(`a_${x.key}`) ?? '') : f.getAll(`a_${x.key}`).map(String)]));
    setErr(undefined);
    submit.mutate({ answers, ...(form.data?.robloxField ? { robloxUsername: String(f.get('robloxUsername') ?? '') } : {}) });
  };
  const d = form.data;
  return (
    <div className="mx-auto max-w-xl p-4 py-10">
      <div className="mb-4 flex items-center gap-2 text-lg font-semibold"><Shield className="text-primary" aria-hidden />{d?.title ?? 'Bewerbung'}</div>
      {done ? (
        <div role="status" className="whitespace-pre-wrap rounded-lg border border-success/40 bg-success/10 p-4">{done.message.replace(/\*\*/g, '')}</div>
      ) : form.isLoading ? <SkeletonRows /> : form.error instanceof ApiError && form.error.status < 500 ? (
        <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-4">{form.error.status === 400 ? 'Dieser Bewerbungslink ist ungültig.' : form.error.message} Starte die Bewerbung im Discord über das Bewerbungs-Panel neu.</div>
      ) : form.error || !d ? <ErrorState error={form.error} onRetry={() => void form.refetch()} /> : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-panel p-5" aria-label="Bewerbungsformular">
          <p className="text-sm text-muted">Angemeldet über Discord als <b className="text-fg">{d.discordName}</b> · Link gültig bis {new Date(d.expiresAt).toLocaleString('de-DE')}</p>
          {d.robloxField && <Field label="Roblox-Benutzername *">{(id) => <Input id={id} name="robloxUsername" required maxLength={64} />}</Field>}
          {d.questions.map((q) => <Question key={q.key} f={q} />)}
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" disabled={submit.isPending} className="w-full">{submit.isPending ? 'Wird gesendet…' : 'Bewerbung absenden'}</Button>
        </form>
      )}
    </div>
  );
}
