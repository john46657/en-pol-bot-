import { MAX_BANNERS, emptyBanner, moveItem, type BannerCfg } from '@nexus/design/client';
import { useState } from 'react';
import { useParams } from 'react-router';
import { BannerView } from '../widgets/BannerBar';
import { ColorOpt, RolePicker } from './controls';
import { ImageField } from './ImageField';
import { pageOptions } from './pageOptions';
import { useEditor } from './state';
import { CtaEditor } from './WidgetEditor';

const rid = () => `b${Math.random().toString(36).slice(2, 7).padEnd(5, '0')}`;

/** Banner-Builder: Hinweise, die oberhalb des Inhalts ausgewählter (oder aller) Seiten erscheinen. */
export function BannersEditor() {
  const { draft, set, disabled } = useEditor();
  const { guildId = '' } = useParams();
  const banners = draft.layout.banners;
  const [selected, setSelected] = useState<string | null>(null);
  const sel = banners.find((b) => b.id === selected) ?? null;
  const save = (list: BannerCfg[]) => set('layout', { ...draft.layout, banners: list });
  const patch = (id: string, p: Partial<BannerCfg>) =>
    save(banners.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const options = pageOptions(draft.layout.custom);
  const all = sel?.pages.includes('*') ?? false;

  return (
    <>
      <p className="muted">
        Banner erscheinen oben auf den gewählten Seiten, solange sie sichtbar und nicht abgelaufen
        sind (höchstens drei gleichzeitig je Seite).
      </p>
      <button
        type="button"
        className="btn primary"
        disabled={disabled || banners.length >= MAX_BANNERS}
        onClick={() => {
          const b = { ...emptyBanner(rid()), title: 'Neuer Hinweis' };
          save([...banners, b]);
          setSelected(b.id);
        }}
      >
        + Banner erstellen
      </button>
      <ul className="plain nv-list" aria-label="Banner">
        {banners.map((b, i) => (
          <li key={b.id} className="row">
            <span aria-hidden>{b.icon || '📢'}</span>
            <span className="grow" style={{ opacity: b.visible ? 1 : 0.5 }}>
              {b.title || b.body.slice(0, 30) || 'Ohne Titel'}
              <small className="muted">
                {' '}
                · {b.pages.includes('*') ? 'alle Seiten' : `${b.pages.length} Seite(n)`}
                {b.expires && ` · bis ${b.expires}`}
                {b.roles.length > 0 && ` · 🔒 ${b.roles.length} Rolle(n)`}
              </small>
            </span>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || i === 0}
              aria-label={`${b.title || 'Banner'} nach oben`}
              onClick={() => save(moveItem(banners, i, i - 1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || i === banners.length - 1}
              aria-label={`${b.title || 'Banner'} nach unten`}
              onClick={() => save(moveItem(banners, i, i + 1))}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn"
              aria-pressed={selected === b.id}
              aria-label={`${b.title || 'Banner'} bearbeiten`}
              onClick={() => setSelected(selected === b.id ? null : b.id)}
            >
              Bearbeiten
            </button>
          </li>
        ))}
        {banners.length === 0 && <li className="muted">Noch keine Banner.</li>}
      </ul>
      {sel && (
        <div className="card we-insp" role="group" aria-label={`Banner bearbeiten: ${sel.title}`}>
          <h3>Banner bearbeiten</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={sel.visible}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { visible: e.target.checked })}
            />{' '}
            Sichtbar
          </label>
          <div className="two">
            <label className="fld">
              <span>Titel</span>
              <input
                value={sel.title}
                maxLength={80}
                disabled={disabled}
                onChange={(e) => patch(sel.id, { title: e.target.value })}
              />
            </label>
            <label className="fld">
              <span>Icon</span>
              <input
                value={sel.icon}
                maxLength={8}
                disabled={disabled}
                onChange={(e) => patch(sel.id, { icon: e.target.value })}
              />
            </label>
          </div>
          <label className="fld">
            <span>Text</span>
            <textarea
              rows={3}
              maxLength={400}
              value={sel.body}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { body: e.target.value })}
            />
            <small className="muted">**fett** · *kursiv* · [Link](https://…)</small>
          </label>
          <ImageField
            label="Bild"
            value={sel.image}
            disabled={disabled}
            onCommit={(v) => patch(sel.id, { image: v })}
          />
          <label className="fld">
            <span>Größe</span>
            <select
              value={sel.size}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { size: e.target.value as BannerCfg['size'] })}
            >
              <option value="small">Klein</option>
              <option value="medium">Mittel</option>
              <option value="large">Groß</option>
            </select>
          </label>
          <div className="two">
            <ColorOpt
              label="Akzentfarbe"
              value={sel.color}
              disabled={disabled}
              onChange={(v) => patch(sel.id, { color: v })}
            />
            <ColorOpt
              label="Hintergrund"
              value={sel.background}
              disabled={disabled}
              onChange={(v) => patch(sel.id, { background: v })}
            />
          </div>
          <ColorOpt
            label="Textfarbe"
            value={sel.textColor}
            disabled={disabled}
            onChange={(v) => patch(sel.id, { textColor: v })}
          />
          <label className="fld">
            <span>Ablaufdatum (optional, gilt bis Ende des Tages)</span>
            <input
              type="date"
              value={sel.expires}
              disabled={disabled}
              onChange={(e) => patch(sel.id, { expires: e.target.value })}
            />
          </label>
          <fieldset className="perm-group" disabled={disabled}>
            <legend>Anzeigen auf</legend>
            <label className="check">
              <input
                type="checkbox"
                checked={all}
                onChange={(e) => patch(sel.id, { pages: e.target.checked ? ['*'] : [] })}
              />{' '}
              Allen Seiten
            </label>
            {!all &&
              options.map(([k, l]) => (
                <label key={k} className="check">
                  <input
                    type="checkbox"
                    checked={sel.pages.includes(k)}
                    onChange={(e) =>
                      patch(sel.id, {
                        pages: e.target.checked
                          ? [...sel.pages, k]
                          : sel.pages.filter((x) => x !== k),
                      })
                    }
                  />{' '}
                  {l}
                </label>
              ))}
            {!all && sel.pages.length === 0 && (
              <small className="dz-warn">Ohne Auswahl gilt „Allen Seiten“.</small>
            )}
          </fieldset>
          <CtaEditor cta={sel.cta} disabled={disabled} onChange={(cta) => patch(sel.id, { cta })} />
          <RolePicker
            value={sel.roles}
            onChange={(roles) => patch(sel.id, { roles })}
            disabled={disabled}
          />
          <p className="muted">
            Mit Rollen-Auswahl liefert der Server das Banner nur an diese Rollen aus.
          </p>
          <h4>Vorschau</h4>
          <BannerView banner={sel} guildId={guildId} />
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => {
              save(banners.filter((b) => b.id !== sel.id));
              setSelected(null);
            }}
          >
            Banner löschen
          </button>
        </div>
      )}
    </>
  );
}
