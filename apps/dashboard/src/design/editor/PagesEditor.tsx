import {
  MAX_CUSTOM_PAGES,
  PAGE_TEMPLATES,
  TEMPLATE_LABEL,
  newPageKey,
  slugOf,
  templateWidgets,
  type CustomPage,
  type PageTemplate,
} from '@nexus/design/client';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Dialog } from '../../components/Dialog';
import { RolePicker } from './controls';
import { useEditor } from './state';
import { WidgetEditor } from './WidgetEditor';

const rnd = () => `p${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;

/** Seiten & Widgets: die Übersicht und eigene Seiten (Page Builder) mit Vorlagen. */
export function PagesEditor() {
  const { draft, set, disabled } = useEditor();
  const { guildId = '' } = useParams();
  const custom = draft.layout.custom;
  const [page, setPage] = useState('overview');
  const [dialog, setDialog] = useState<'new' | 'delete' | null>(null);
  const [form, setForm] = useState({
    name: '',
    icon: '',
    description: '',
    template: 'empty' as PageTemplate,
    slug: '',
  });
  const current = custom.find((c) => c.key === page) ?? null;
  const layout = (patch: Partial<typeof draft.layout>) =>
    set('layout', { ...draft.layout, ...patch });
  const patchPage = (p: Partial<CustomPage>) =>
    layout({ custom: custom.map((c) => (c.key === page ? { ...c, ...p } : c)) });

  const taken = custom.map((c) => c.key);
  const slugOk = /^[a-z0-9-]{1,30}$/.test(form.slug);
  const slugTaken = slugOk && taken.includes(`page-${form.slug}`);
  // Eigene Adresse, wenn gültig und frei; sonst aus dem Namen erzeugt
  const chosenKey = slugOk && !slugTaken ? `page-${form.slug}` : newPageKey(form.name, taken);
  const create = () => {
    const key = chosenKey;
    layout({
      custom: [
        ...custom,
        {
          key,
          name: form.name.trim(),
          icon: form.icon.trim(),
          description: form.description.trim(),
          roles: [],
        },
      ],
      pages: { ...draft.layout.pages, [key]: { widgets: templateWidgets(form.template, rnd()) } },
    });
    setPage(key);
    setDialog(null);
  };
  const remove = () => {
    const pages = { ...draft.layout.pages };
    delete pages[page];
    layout({ custom: custom.filter((c) => c.key !== page), pages });
    setPage('overview');
    setDialog(null);
  };

  return (
    <>
      <div className="dz-seg">
        <label className="fld grow">
          <span>Seite</span>
          <select value={page} onChange={(e) => setPage(e.target.value)} aria-label="Seite wählen">
            <option value="overview">🏠 Übersicht</option>
            {custom.map((c) => (
              <option key={c.key} value={c.key}>
                {c.icon || '📄'} {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn primary"
          disabled={disabled || custom.length >= MAX_CUSTOM_PAGES}
          onClick={() => {
            setForm({ name: '', icon: '', description: '', template: 'empty', slug: '' });
            setDialog('new');
          }}
        >
          + Seite erstellen
        </button>
      </div>
      {current && (
        <div className="card">
          <h3>Seiteneinstellungen</h3>
          <div className="two">
            <label className="fld">
              <span>Name</span>
              <input
                value={current.name}
                maxLength={40}
                disabled={disabled}
                onChange={(e) => patchPage({ name: e.target.value })}
              />
            </label>
            <label className="fld">
              <span>Icon</span>
              <input
                value={current.icon}
                maxLength={8}
                disabled={disabled}
                onChange={(e) => patchPage({ icon: e.target.value })}
              />
            </label>
          </div>
          <label className="fld">
            <span>Beschreibung</span>
            <input
              value={current.description}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => patchPage({ description: e.target.value })}
            />
          </label>
          <p className="muted">
            Adresse: <code>/guilds/…/p/{slugOf(current.key)}</code> · Die Seite erscheint
            automatisch im Menü (Tab „Navigation“: Reihenfolge, Gruppe, Rollen). Öffnen lässt sie
            sich nach dem Speichern:{' '}
            <a href={`/guilds/${guildId}/p/${slugOf(current.key)}`}>Seite öffnen</a>
          </p>
          <RolePicker
            value={current.roles}
            onChange={(roles) => patchPage({ roles })}
            disabled={disabled}
          />
          <p className="muted">
            Mit Rollen-Auswahl liefert der Server die Seite (und ihre Widgets) nur an diese Rollen
            aus; Server-Verwalter sehen immer alles.
          </p>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => setDialog('delete')}
          >
            Seite löschen …
          </button>
        </div>
      )}
      <WidgetEditor key={page} page={page} />

      <Dialog open={dialog === 'new'} title="Neue Seite" onClose={() => setDialog(null)}>
        <label className="fld">
          <span>Name</span>
          <input
            value={form.name}
            maxLength={40}
            placeholder="Ausbildung"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="fld">
          <span>Icon</span>
          <input
            value={form.icon}
            maxLength={8}
            placeholder="🎓"
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
          />
        </label>
        <label className="fld">
          <span>Beschreibung</span>
          <input
            value={form.description}
            maxLength={200}
            placeholder="Ausbildungsübersicht"
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>
        <label className="fld">
          <span>Vorlage</span>
          <select
            value={form.template}
            onChange={(e) => setForm({ ...form, template: e.target.value as PageTemplate })}
          >
            {PAGE_TEMPLATES.map((t) => (
              <option key={t} value={t}>
                {TEMPLATE_LABEL[t].label}
              </option>
            ))}
          </select>
          <small className="muted">
            {TEMPLATE_LABEL[form.template].hint} Danach lässt sich alles anpassen.
          </small>
        </label>
        <label className="fld">
          <span>Adresse (URL, optional)</span>
          <input
            value={form.slug}
            maxLength={30}
            placeholder={slugOf(newPageKey(form.name, taken))}
            onChange={(e) =>
              setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })
            }
          />
          <small className={slugTaken ? 'dz-warn' : 'muted'}>
            {slugTaken
              ? 'Diese Adresse ist schon vergeben – es wird eine freie erzeugt.'
              : `Die Seite liegt unter …/p/${slugOf(chosenKey)} (nur a–z, 0–9 und -).`}
          </small>
        </label>
        <div className="dz-seg">
          <button type="button" className="btn" onClick={() => setDialog(null)}>
            Abbrechen
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={form.name.trim().length < 1}
            onClick={create}
          >
            Erstellen
          </button>
        </div>
      </Dialog>
      <Dialog open={dialog === 'delete'} title="Seite löschen?" onClose={() => setDialog(null)}>
        <p>
          „{current?.name}“ wird mit allen Widgets entfernt (sobald du speicherst). Frühere
          Versionen des Themes bleiben im Verlauf erhalten.
        </p>
        <div className="dz-seg">
          <button type="button" className="btn" onClick={() => setDialog(null)}>
            Abbrechen
          </button>
          <button type="button" className="btn primary" onClick={remove}>
            Löschen
          </button>
        </div>
      </Dialog>
    </>
  );
}
