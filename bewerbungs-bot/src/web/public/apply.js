
/** Bewerbung im Browser (persönlicher Link vom Bot). Der Server prüft alle Antworten erneut. */
const token = location.pathname.split('/').pop();
const root = document.getElementById('app');
const draftKey = `bewerbung-entwurf-${token.slice(-24)}`;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

async function api(method, body) {
  const res = await fetch(`/api/apply/${token}`, { method, headers: { 'x-requested-with': 'bewerbungs-bot', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
  return data;
}

let draft = {};
try { draft = JSON.parse(localStorage.getItem(draftKey) ?? '{}'); } catch { draft = {}; }
const saveDraft = (answers) => { try { localStorage.setItem(draftKey, JSON.stringify(answers)); } catch { /* egal */ } };

async function main() {
  let f;
  try { f = await api('GET'); } catch (e) { root.replaceChildren(h('div', { class: 'card stack' }, h('h1', {}, 'Bewerbung'), h('div', { class: 'error' }, e.message))); return; }
  document.title = `Bewerbung – ${f.name}`;
  const answers = {};
  const blocks = f.questions.map((q, i) => {
    const label = h('div', { class: 'q' }, h('strong', {}, `${i + 1}. ${q.label}`), q.required ? h('span', { class: 'req' }, ' *') : h('span', { class: 'muted small' }, ' (optional)'));
    let input;
    if (q.type === 'TEXT') {
      input = h('textarea', { rows: q.maxLength > 300 ? 5 : 2, maxlength: q.maxLength, required: q.required, value: draft[q.key] ?? '' });
      const count = h('span', { class: 'hint' });
      const upd = () => { answers[q.key] = input.value; count.textContent = `${input.value.trim().length}/${q.maxLength}${q.minLength ? ` · mindestens ${q.minLength}` : ''}`; saveDraft(answers); };
      input.addEventListener('input', upd); upd();
      return h('label', { class: 'card q-block' }, label, input, count);
    }
    if (q.type === 'ROBLOX') {
      input = h('input', { maxlength: 20, placeholder: 'Roblox-Benutzername (nicht der Anzeigename)', required: q.required, value: draft[q.key] ?? '', autocomplete: 'off' });
      const upd = () => { answers[q.key] = input.value.trim(); saveDraft(answers); };
      input.addEventListener('input', upd); upd();
      return h('label', { class: 'card q-block' }, label, input, h('span', { class: 'hint' }, 'Wird beim Absenden bei Roblox geprüft.'));
    }
    const chosen = new Set(Array.isArray(draft[q.key]) ? draft[q.key] : []);
    answers[q.key] = [...chosen];
    const name = `q_${q.key}`;
    const opts = q.options.map((o) => h('label', { class: 'check' }, h('input', { type: q.multiple ? 'checkbox' : 'radio', name, value: o.label, checked: chosen.has(o.label), onchange: (e) => {
      if (!q.multiple) chosen.clear();
      if (e.target.checked) chosen.add(o.label); else chosen.delete(o.label);
      answers[q.key] = [...chosen]; saveDraft(answers);
    } }), o.label));
    return h('fieldset', { class: 'card q-block' }, label, h('div', { class: 'stack' }, opts), q.multiple && h('span', { class: 'hint' }, 'Mehrfachauswahl möglich.'));
  });
  const err = h('div');
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Bewerbung absenden');
  const form = h('form', { class: 'stack', onsubmit: async (e) => {
    e.preventDefault(); err.replaceChildren(); btn.disabled = true; btn.textContent = 'Wird gesendet …';
    try {
      const r = await api('POST', { answers });
      try { localStorage.removeItem(draftKey); } catch { /* egal */ }
      root.replaceChildren(h('div', { class: 'card stack' }, h('h1', {}, '✅ Bewerbung abgeschickt'), h('p', { class: 'pre' }, r.message.replace(/\*\*/g, '').replace(/`/g, '')), h('p', { class: 'muted small' }, 'Du kannst dieses Fenster schließen.')));
    } catch (ex) { err.replaceChildren(h('div', { class: 'error' }, ex.message)); btn.disabled = false; btn.textContent = 'Bewerbung absenden'; }
  } }, blocks, err, h('div', {}, btn));
  root.replaceChildren(h('div', { class: 'stack' },
    h('div', { class: 'card stack' }, h('h1', {}, `📋 ${f.name}`), f.guildName && h('p', { class: 'muted' }, f.guildName), f.description && h('p', { class: 'pre' }, f.description),
      h('p', { class: 'small muted' }, `Angemeldet als ${f.userName} · Link gültig bis ${new Date(f.expiresAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}. Deine Eingaben werden in diesem Browser zwischengespeichert.`)),
    form));
}
main();
