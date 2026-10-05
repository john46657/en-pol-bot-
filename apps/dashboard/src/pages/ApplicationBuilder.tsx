import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  api,
  QUESTION_TYPE_LABEL,
  type BuilderQuestion,
  type QuestionOption,
  type QuestionsResponse,
} from '../api';
import { errorText, QueryState } from '../components/QueryState';
import { ReviewSettings } from '../components/ReviewSettings';
import { RatingSettings } from '../components/RatingSettings';
import { StatusSettings } from '../components/StatusSettings';
import { RequirementsSettings } from '../components/RequirementsSettings';
import { useToast } from '../toast';

const SELECTS = ['SINGLE_SELECT', 'MULTI_SELECT'];
const DISPLAY = ['PARAGRAPH', 'INFO'];
const uid = () => Math.random().toString(36).slice(2, 8).padEnd(6, 'x');
const empty = (): BuilderQuestion => ({
  id: '',
  type: 'TEXT',
  title: '',
  required: false,
  enabled: true,
  order: 0,
});

export function ApplicationBuilder() {
  const { guildId = '', applicationId = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const base = `/guilds/${guildId}/applications/${applicationId}`;
  const key = ['questions', applicationId];
  const q = useQuery({ queryKey: key, queryFn: () => api<QuestionsResponse>(`${base}/questions`) });
  const app = useQuery({
    queryKey: ['application', applicationId],
    queryFn: () => api<{ name: string; status: string; idPrefix: string | null }>(base),
  });
  const [prefix, setPrefix] = useState<string | null>(null);
  const savePrefix = useMutation({
    mutationFn: (v: string) => api(base, { method: 'PATCH', body: { idPrefix: v } }),
    onSuccess: () => {
      toast.success('ID-Präfix gespeichert.');
      setPrefix(null);
      void qc.invalidateQueries({ queryKey: ['application', applicationId] });
    },
    onError: (e) => toast.error(errorText(e)),
  });
  const [editing, setEditing] = useState<BuilderQuestion | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: key });
    setEditing(null);
  };
  const fail = (e: unknown) => toast.error(errorText(e));
  const save = useMutation({
    mutationFn: (v: BuilderQuestion) => {
      const { order: _o, ...question } = v;
      const body = { ...question, id: v.id || undefined };
      return isNew
        ? api(`${base}/questions`, { method: 'POST', body: { question: body } })
        : api(`${base}/questions/${v.id}`, { method: 'PUT', body });
    },
    onSuccess: () => {
      toast.success('Frage gespeichert.');
      done();
    },
    onError: fail,
  });
  const patch = useMutation({
    mutationFn: (v: BuilderQuestion) => {
      const { order: _o, ...body } = v;
      return api(`${base}/questions/${v.id}`, { method: 'PUT', body });
    },
    onSuccess: done,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/questions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Frage gelöscht.');
      done();
    },
    onError: fail,
  });
  const move = useMutation({
    mutationFn: (v: { id: string; toIndex: number }) =>
      api(`${base}/questions/${v.id}/move`, { method: 'POST', body: { toIndex: v.toIndex } }),
    onSuccess: done,
    onError: fail,
  });
  const publish = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; errors?: string[] }>(`${base}/publish`, { method: 'POST' }),
    onSuccess: (r) => {
      setPublishErrors(r.ok ? [] : (r.errors ?? []));
      if (r.ok) {
        toast.success('Veröffentlicht.');
        void qc.invalidateQueries({ queryKey: key });
        void qc.invalidateQueries({ queryKey: ['application', applicationId] });
      }
    },
    onError: fail,
  });

  return (
    <>
      <Link to={`/guilds/${guildId}/applications`} className="muted">
        ← Alle Bewerbungen
      </Link>
      <div className="row-head">
        <h1>{app.data?.name ?? 'Bewerbung'}</h1>
        <button
          className="btn primary"
          disabled={publish.isPending}
          onClick={() => publish.mutate()}
        >
          {publish.isPending ? 'Prüfe …' : 'Veröffentlichen'}
        </button>
      </div>
      <div className="actions">
        <label className="fld">
          <span>Präfix der Bewerbungs-ID (z. B. POL → #POL-00152; leer = SUB)</span>
          <input
            aria-label="ID-Präfix"
            value={prefix ?? app.data?.idPrefix ?? ''}
            maxLength={8}
            onChange={(e) => setPrefix(e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())}
          />
        </label>
        <button className="btn" disabled={prefix === null || savePrefix.isPending} onClick={() => savePrefix.mutate(prefix ?? '')}>
          Präfix speichern
        </button>
      </div>
      {publishErrors.length > 0 && (
        <div className="alert error" role="alert">
          <div>
            <strong>Nicht veröffentlichbar:</strong>
            <ul>
              {publishErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <QueryState query={q}>
        {(d) => (
          <>
            <p className="muted">
              {d.questions.length} Fragen ·{' '}
              {d.publishedVersion
                ? `Version ${d.publishedVersion} veröffentlicht`
                : 'noch nicht veröffentlicht'}
              {d.unpublishedChanges && d.publishedVersion
                ? ' · ⚠️ ungeveröffentlichte Änderungen'
                : ''}
            </p>
            <ol className="qlist">
              {d.questions.map((qq, i) => (
                <li
                  key={qq.id}
                  className={`row ${qq.enabled === false ? 'off' : ''}`}
                  draggable
                  aria-label={`Frage ${i + 1}: ${qq.title}`}
                  onDragStart={(e) => {
                    setDragId(qq.id);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', qq.id);
                  }}
                  onDragOver={(e) => dragId && dragId !== qq.id && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== qq.id) move.mutate({ id: dragId, toIndex: i });
                    setDragId(null);
                  }}
                  onDragEnd={() => setDragId(null)}
                  style={dragId === qq.id ? { opacity: 0.5 } : undefined}
                >
                  <span className="muted" title="Zum Sortieren ziehen" aria-hidden="true" style={{ cursor: 'grab' }}>⠿</span>
                  <span className="muted">{i + 1}.</span>
                  <span className="grow">
                    <strong>{qq.title}</strong>
                    {qq.required && <span title="Pflicht"> ＊</span>}
                    {qq.visibleIf ? <span title="Bedingung"> 🔀</span> : null}
                    <br />
                    <small className="muted">
                      {QUESTION_TYPE_LABEL[qq.type] ?? qq.type}
                      {qq.enabled === false ? ' · deaktiviert' : ''}
                    </small>
                  </span>
                  <button
                    className="btn icon-btn"
                    aria-label="Nach oben"
                    disabled={i === 0 || move.isPending}
                    onClick={() => move.mutate({ id: qq.id, toIndex: i - 1 })}
                  >
                    ↑
                  </button>
                  <button
                    className="btn icon-btn"
                    aria-label="Nach unten"
                    disabled={i === d.questions.length - 1 || move.isPending}
                    onClick={() => move.mutate({ id: qq.id, toIndex: i + 1 })}
                  >
                    ↓
                  </button>
                  <button
                    className="btn"
                    onClick={() => patch.mutate({ ...qq, enabled: qq.enabled === false })}
                  >
                    {qq.enabled === false ? 'Aktivieren' : 'Deaktivieren'}
                  </button>
                  <button
                    className="btn"
                    onClick={() => {
                      setIsNew(false);
                      setEditing(qq);
                    }}
                  >
                    Bearbeiten
                  </button>
                  <button
                    className="btn"
                    onClick={() => window.confirm(`„${qq.title}“ löschen?`) && remove.mutate(qq.id)}
                  >
                    Löschen
                  </button>
                </li>
              ))}
            </ol>
            {!editing && (
              <button
                className="btn primary"
                onClick={() => {
                  setIsNew(true);
                  setEditing(empty());
                }}
              >
                + Frage
              </button>
            )}
          </>
        )}
      </QueryState>
      {editing && (
        <QuestionForm
          key={editing.id || 'new'}
          q={editing}
          saving={save.isPending}
          onCancel={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
          types={q.data?.types ?? []}
          isNew={isNew}
        />
      )}
      <h2>Bearbeitung</h2>
      <RequirementsSettings guildId={guildId} applicationId={applicationId} />
      <ReviewSettings guildId={guildId} applicationId={applicationId} />
      <RatingSettings guildId={guildId} applicationId={applicationId} />
      <StatusSettings guildId={guildId} applicationId={applicationId} />
    </>
  );
}

function QuestionForm({
  q,
  types,
  saving,
  isNew,
  onSave,
  onCancel,
}: {
  q: BuilderQuestion;
  types: string[];
  saving: boolean;
  isNew: boolean;
  onSave: (q: BuilderQuestion) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<BuilderQuestion>(q);
  const set = (p: Partial<BuilderQuestion>) => setV((x) => ({ ...x, ...p }));
  const setVal = (p: BuilderQuestion['validation']) =>
    setV((x) => ({ ...x, validation: { ...x.validation, ...p } }));
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const isSelect = SELECTS.includes(v.type);
  const options = v.options ?? [];
  const setOpt = (i: number, p: Partial<QuestionOption>) =>
    set({ options: options.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const clean = (): BuilderQuestion => {
    const out = {
      ...v,
      options: isSelect
        ? options.map((o) => ({ ...o, value: o.value || o.label.toLowerCase() }))
        : undefined,
    };
    if (DISPLAY.includes(out.type)) out.required = false;
    return JSON.parse(JSON.stringify(out)) as BuilderQuestion;
  };
  return (
    <form
      className="card comp"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(clean());
      }}
    >
      <h3>{isNew ? 'Neue Frage' : 'Frage bearbeiten'}</h3>
      <div className="two">
        <label className="fld">
          <span>Typ</span>
          <select value={v.type} onChange={(e) => set({ type: e.target.value })}>
            {types.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </label>
        <label className="fld">
          <span>Titel / Fragetext</span>
          <input
            required
            maxLength={200}
            value={v.title}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
      </div>
      <label className="fld">
        <span>Beschreibung (optional)</span>
        <input
          maxLength={2000}
          value={v.description ?? ''}
          onChange={(e) => set({ description: e.target.value || undefined })}
        />
      </label>
      {!DISPLAY.includes(v.type) && (
        <label className="check">
          <input
            type="checkbox"
            checked={v.required}
            onChange={(e) => set({ required: e.target.checked })}
          />{' '}
          Pflichtfrage
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={v.enabled !== false}
          onChange={(e) => set({ enabled: e.target.checked })}
        />{' '}
        Aktiv (wird gestellt)
      </label>
      {['TEXT', 'LONG_TEXT'].includes(v.type) && (
        <div className="two">
          <label className="fld">
            <span>Mindestlänge</span>
            <input
              type="number"
              min={0}
              value={v.validation?.minLength ?? ''}
              onChange={(e) => setVal({ minLength: num(e.target.value) })}
            />
          </label>
          <label className="fld">
            <span>Höchstlänge</span>
            <input
              type="number"
              min={1}
              value={v.validation?.maxLength ?? ''}
              onChange={(e) => setVal({ maxLength: num(e.target.value) })}
            />
          </label>
        </div>
      )}
      {['TEXT', 'USERNAME'].includes(v.type) && (
        <label className="fld">
          <span>Regex-Validierung (optional, z. B. ^[A-Za-zÄÖÜäöüß ]+$)</span>
          <input
            value={v.validation?.pattern ?? ''}
            maxLength={500}
            onChange={(e) => setVal({ pattern: e.target.value || undefined })}
          />
        </label>
      )}
      {!DISPLAY.includes(v.type) && (
        <label className="fld">
          <span>Eigene Fehlermeldung bei ungültiger Antwort (optional)</span>
          <input
            value={v.validation?.errorMessage ?? ''}
            maxLength={300}
            onChange={(e) => setVal({ errorMessage: e.target.value || undefined })}
          />
        </label>
      )}
      {['NUMBER', 'DECIMAL', 'RATING', 'SLIDER'].includes(v.type) && (
        <div className="two">
          <label className="fld">
            <span>Minimum</span>
            <input
              type="number"
              value={v.validation?.min ?? ''}
              onChange={(e) => setVal({ min: num(e.target.value) })}
            />
          </label>
          <label className="fld">
            <span>Maximum</span>
            <input
              type="number"
              value={v.validation?.max ?? ''}
              onChange={(e) => setVal({ max: num(e.target.value) })}
            />
          </label>
        </div>
      )}
      {isSelect && (
        <div className="fld">
          <span>Optionen</span>
          {options.map((o, i) => (
            <div key={o.id} className="actions">
              <input
                className="inline-input"
                value={o.label}
                maxLength={80}
                placeholder="Beschriftung"
                onChange={(e) => setOpt(i, { label: e.target.value })}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={o.enabled}
                  onChange={(e) => setOpt(i, { enabled: e.target.checked })}
                />{' '}
                aktiv
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => set({ options: options.filter((_, j) => j !== i) })}
              >
                Entfernen
              </button>
            </div>
          ))}
          <div>
            <button
              type="button"
              className="btn"
              disabled={options.length >= 25}
              onClick={() =>
                set({ options: [...options, { id: uid(), label: '', value: '', enabled: true }] })
              }
            >
              + Option
            </button>
          </div>
          {v.type === 'MULTI_SELECT' && (
            <div className="two">
              <label className="fld">
                <span>Min. Auswahl</span>
                <input
                  type="number"
                  min={0}
                  value={v.validation?.minSelections ?? ''}
                  onChange={(e) => setVal({ minSelections: num(e.target.value) })}
                />
              </label>
              <label className="fld">
                <span>Max. Auswahl</span>
                <input
                  type="number"
                  min={1}
                  value={v.validation?.maxSelections ?? ''}
                  onChange={(e) => setVal({ maxSelections: num(e.target.value) })}
                />
              </label>
            </div>
          )}
        </div>
      )}
      <div className="actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
