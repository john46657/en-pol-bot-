import {
  MAX_NAV_GROUPS,
  MAX_NAV_ITEMS,
  emptyItem,
  isLinkKey,
  materializeItems,
  moveItem,
  newGroupId,
  newLinkKey,
  type NavGroup,
  type NavItem,
} from '@nexus/design/client';
import { useRef, useState } from 'react';
import { BUILTIN_NAV } from '../../pages/GuildLayout';
import { ColorOpt, Field, RolePicker, UrlText } from './controls';
import { useEditor } from './state';

const label = (key: string) => BUILTIN_NAV.find((b) => b.key === key);

/** Sidebar-Einträge und -Gruppen: Reihenfolge per Drag & Drop oder Pfeiltasten, Titel, Icon, Rollen, Badge, Farben. */
export function NavEditor() {
  const { draft, set, disabled } = useEditor();
  const nav = draft.navigation;
  const items = materializeItems(BUILTIN_NAV, nav);
  const [open, setOpen] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const [newGroup, setNewGroup] = useState('');
  const [newLink, setNewLink] = useState({ title: '', href: '' });
  const save = (groups: NavGroup[], list: NavItem[]) => set('navigation', { groups, items: list });
  const setItem = (key: string, patch: Partial<NavItem>) =>
    save(
      nav.groups,
      items.map((i) => (i.key === key ? { ...i, ...patch } : i)),
    );
  const move = (from: number, to: number) => save(nav.groups, moveItem(items, from, to));

  return (
    <>
      <h3>Gruppen</h3>
      <p className="muted">
        Gruppen fassen Einträge unter einer Überschrift zusammen. Einträge ohne Gruppe stehen oben.
      </p>
      <ul className="plain">
        {nav.groups.map((g, i) => (
          <li key={g.id} className="row">
            <input
              className="nv-icon"
              value={g.icon}
              maxLength={8}
              placeholder="🎫"
              aria-label={`Icon der Gruppe ${g.name}`}
              disabled={disabled}
              onChange={(e) =>
                save(
                  nav.groups.map((x) => (x.id === g.id ? { ...x, icon: e.target.value } : x)),
                  items,
                )
              }
            />
            <input
              className="grow"
              value={g.name}
              maxLength={30}
              aria-label={`Name der Gruppe ${g.name}`}
              disabled={disabled}
              onChange={(e) =>
                save(
                  nav.groups.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)),
                  items,
                )
              }
            />
            <label className="check">
              <input
                type="checkbox"
                checked={g.visible}
                disabled={disabled}
                onChange={(e) =>
                  save(
                    nav.groups.map((x) =>
                      x.id === g.id ? { ...x, visible: e.target.checked } : x,
                    ),
                    items,
                  )
                }
              />{' '}
              sichtbar
            </label>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || i === 0}
              aria-label={`Gruppe ${g.name} nach oben`}
              onClick={() => save(moveItem(nav.groups, i, i - 1), items)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled || i === nav.groups.length - 1}
              aria-label={`Gruppe ${g.name} nach unten`}
              onClick={() => save(moveItem(nav.groups, i, i + 1), items)}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn icon-btn"
              disabled={disabled}
              aria-label={`Gruppe ${g.name} löschen`}
              onClick={() =>
                save(
                  nav.groups.filter((x) => x.id !== g.id),
                  items,
                )
              }
            >
              🗑️
            </button>
          </li>
        ))}
      </ul>
      <div className="dz-seg">
        <input
          value={newGroup}
          maxLength={30}
          placeholder="Name der neuen Gruppe, z. B. SUPPORT"
          aria-label="Name der neuen Gruppe"
          disabled={disabled}
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <button
          type="button"
          className="btn"
          disabled={disabled || newGroup.trim() === '' || nav.groups.length >= MAX_NAV_GROUPS}
          onClick={() => {
            save(
              [
                ...nav.groups,
                {
                  id: newGroupId(
                    newGroup,
                    nav.groups.map((g) => g.id),
                  ),
                  name: newGroup.trim(),
                  icon: '',
                  visible: true,
                },
              ],
              items,
            );
            setNewGroup('');
          }}
        >
          + Gruppe hinzufügen
        </button>
      </div>

      <h3>Einträge</h3>
      <p className="muted">
        Reihenfolge per Ziehen (⠿) oder mit den Pfeiltasten ändern. „Bearbeiten“ öffnet die
        Einstellungen eines Eintrags.
      </p>
      <ul className="plain nv-list" aria-label="Menüeinträge">
        {items.map((it, idx) => {
          const b = label(it.key);
          const title = it.title || b?.label || it.key;
          const g = nav.groups.find((x) => x.id === it.group);
          return (
            <li
              key={it.key}
              className={`nv-item ${dragFrom === idx ? 'dragging' : ''}`}
              onDragOver={(e) => {
                if (dragRef.current !== null) e.preventDefault(); // Ablegen erlauben
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragRef.current;
                dragRef.current = null;
                setDragFrom(null);
                if (from !== null) move(from, idx);
              }}
            >
              <div className="row">
                <span
                  className="nv-handle"
                  draggable={!disabled}
                  onDragStart={(e) => {
                    dragRef.current = idx;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', it.key); // Firefox startet das Ziehen sonst nicht
                    // Darstellung erst nach dem Start ändern (sonst bricht Chrome das Ziehen manchmal ab)
                    setTimeout(() => setDragFrom(idx), 0);
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setDragFrom(null);
                  }}
                  aria-hidden
                  title="Ziehen zum Verschieben"
                >
                  ⠿
                </span>
                <span aria-hidden>{it.icon || b?.icon || '🔗'}</span>
                <span className="grow" style={{ opacity: it.visible ? 1 : 0.5 }}>
                  {title}
                  {g && <small className="muted"> · {g.name}</small>}
                  {it.badge && <small className="muted"> · Badge „{it.badge}“</small>}
                  {it.roles.length > 0 && (
                    <small className="muted"> · 🔒 {it.roles.length} Rolle(n)</small>
                  )}
                </span>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={it.visible}
                    disabled={disabled}
                    aria-label={`${title} sichtbar`}
                    onChange={(e) => setItem(it.key, { visible: e.target.checked })}
                  />
                </label>
                <button
                  type="button"
                  className="btn icon-btn"
                  disabled={disabled || idx === 0}
                  aria-label={`${title} nach oben`}
                  onClick={() => move(idx, idx - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn icon-btn"
                  disabled={disabled || idx === items.length - 1}
                  aria-label={`${title} nach unten`}
                  onClick={() => move(idx, idx + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-expanded={open === it.key}
                  aria-label={`${title} bearbeiten`}
                  onClick={() => setOpen(open === it.key ? null : it.key)}
                >
                  Bearbeiten
                </button>
              </div>
              {open === it.key && (
                <div className="nv-edit card">
                  <label className="fld">
                    <span>Titel (leer = {b?.label ?? 'Standard'})</span>
                    <input
                      value={it.title}
                      maxLength={40}
                      disabled={disabled}
                      onChange={(e) => setItem(it.key, { title: e.target.value })}
                    />
                  </label>
                  <label className="fld">
                    <span>Icon (leer = {b?.icon ?? '🔗'})</span>
                    <input
                      value={it.icon}
                      maxLength={8}
                      disabled={disabled}
                      onChange={(e) => setItem(it.key, { icon: e.target.value })}
                    />
                  </label>
                  <label className="fld">
                    <span>Gruppe</span>
                    <select
                      value={it.group}
                      disabled={disabled}
                      onChange={(e) => setItem(it.key, { group: e.target.value })}
                    >
                      <option value="">– ohne Gruppe –</option>
                      {nav.groups.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="fld">
                    <span>Badge (kurzer Text, z. B. „neu“)</span>
                    <input
                      value={it.badge}
                      maxLength={12}
                      disabled={disabled}
                      onChange={(e) => setItem(it.key, { badge: e.target.value })}
                    />
                  </label>
                  <div className="two">
                    <ColorOpt
                      label="Farbe"
                      value={it.color}
                      disabled={disabled}
                      onChange={(v) => setItem(it.key, { color: v })}
                    />
                    <ColorOpt
                      label="Hover-Farbe"
                      value={it.hoverColor}
                      disabled={disabled}
                      onChange={(v) => setItem(it.key, { hoverColor: v })}
                    />
                  </div>
                  {isLinkKey(it.key) && (
                    <UrlText
                      label="Adresse (https)"
                      value={it.href}
                      disabled={disabled}
                      allowEmpty={false}
                      onCommit={(v) => setItem(it.key, { href: v })}
                    />
                  )}
                  <RolePicker
                    value={it.roles}
                    onChange={(roles) => setItem(it.key, { roles })}
                    disabled={disabled}
                  />
                  {isLinkKey(it.key) && (
                    <button
                      type="button"
                      className="btn"
                      disabled={disabled}
                      onClick={() => {
                        save(
                          nav.groups,
                          items.filter((i) => i.key !== it.key),
                        );
                        setOpen(null);
                      }}
                    >
                      Link-Eintrag löschen
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <h3>Eigener Link</h3>
      <div className="two">
        <input
          value={newLink.title}
          maxLength={40}
          placeholder="Titel, z. B. Diensthandbuch"
          aria-label="Titel des neuen Links"
          disabled={disabled}
          onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
        />
        <input
          value={newLink.href}
          maxLength={500}
          placeholder="https://…"
          aria-label="Adresse des neuen Links"
          disabled={disabled}
          onChange={(e) => setNewLink({ ...newLink, href: e.target.value })}
        />
      </div>
      <button
        type="button"
        className="btn"
        disabled={
          disabled ||
          newLink.title.trim() === '' ||
          !/^https:\/\/\S+$/.test(newLink.href) ||
          items.length >= MAX_NAV_ITEMS
        }
        onClick={() => {
          save(nav.groups, [
            ...items,
            {
              ...emptyItem(newLinkKey(items.map((i) => i.key))),
              title: newLink.title.trim(),
              href: newLink.href.trim(),
              icon: '📚',
            },
          ]);
          setNewLink({ title: '', href: '' });
        }}
      >
        + Link hinzufügen
      </button>
      <Field
        path="navigation"
        label="Gesamte Navigation"
        hint="Setzt Gruppen, Reihenfolge, Titel, Rollen und Links auf den Standard zurück."
      >
        <span />
      </Field>
    </>
  );
}
