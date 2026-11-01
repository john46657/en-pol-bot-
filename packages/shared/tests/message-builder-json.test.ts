import { describe, expect, it } from 'vitest';
import {
  customIdsOf, MB_EXAMPLE_TEMPLATES, mbDocumentDataSchema, mbFromDiscordJson, mbParseJsonText, mbTemplateExportSchema, mbToDiscordJson, mbToDiscordJsonText,
  MB_TEMPLATE_EXPORT_FORMAT, parseJsonWithPosition, toDiscordPayload, validateMbDocument, interactiveComponents, type MbDocumentData,
} from '../src';

const full = (): MbDocumentData => mbDocumentDataSchema.parse({
  messages: [{
    id: 'm1', content: '**Fett** *kursiv* __unter__ ~~durch~~ `code` <@123456789012345678> <@&123456789012345679> <#123456789012345670> 🚓',
    mentions: { users: true, roles: true, everyone: false },
    embeds: [
      { id: 'e1', title: 'Titel', url: 'https://example.com', description: 'Beschreibung', color: '#1e3a8a', authorName: 'Autor', authorUrl: 'https://a.example', authorIconUrl: 'https://a.example/i.png',
        thumbnailUrl: 'https://x.example/t.png', imageUrl: 'https://x.example/i.png', footerText: 'Fuß', footerIconUrl: 'https://x.example/f.png', timestamp: 'send',
        fields: [{ id: 'f1', name: 'A', value: '1', inline: true }, { id: 'f2', name: 'B', value: '2', inline: false }] },
      { id: 'e2', description: 'Zweites', timestamp: 'custom', timestampAt: '2026-01-02T03:04:05.000Z' },
    ],
    rows: [
      { id: 'r1', type: 'buttons', buttons: [
        { id: 'b1', kind: 'link', label: 'Web', url: 'https://example.com', emoji: '🌐' },
        { id: 'b2', kind: 'action', label: 'Info', style: 'success', action: { type: 'reply', text: 'Hallo!' }, emoji: '<:pol:123456789012345678>' },
        { id: 'b3', kind: 'action', label: 'Aus', style: 'danger', disabled: true, action: { type: 'reply', text: 'x' } },
      ] },
      { id: 's1', type: 'select', placeholder: 'Wählen', minValues: 0, maxValues: 2, options: [
        { id: 'o1', label: 'Eins', description: 'erste', emoji: '1️⃣', action: { type: 'reply', text: 'eins' } },
        { id: 'o2', label: 'Zwei', action: { type: 'reply', text: 'zwei' } },
      ] },
    ],
  }, { id: 'm2', content: 'Zweite Nachricht' }],
  webhookProfile: { username: 'Leitstelle', avatarUrl: 'https://x.example/a.png' },
});

describe('JSON mit Fehlerposition', () => {
  it('gültiges JSON', () => expect(parseJsonWithPosition('{"a":[1,2,{"b":null}],"c":"x\\n"}')).toEqual({ ok: true, value: { a: [1, 2, { b: null }], c: 'x\n' } }));
  it('meldet Zeile/Spalte bei fehlendem Komma', () => {
    const r = parseJsonWithPosition('{\n  "a": 1\n  "b": 2\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.line).toBe(3); expect(r.error.column).toBe(3); expect(r.error.message).toMatch(/„,“ oder „}“/); }
  });
  it('Komma am Ende, einfache Anführungszeichen, offenes Ende', () => {
    const a = parseJsonWithPosition('[1,2,]'); expect(!a.ok && a.error.message).toMatch(/Komma vor „]“/);
    const b = parseJsonWithPosition("{'a':1}"); expect(!b.ok && b.error.message).toMatch(/doppelte|doppelten/);
    const c = parseJsonWithPosition('{"a": "x'); expect(!c.ok && c.error.message).toMatch(/nicht geschlossen/);
    const d = parseJsonWithPosition('{} x'); expect(!d.ok && d.error.column).toBe(4);
  });
});

describe('Discord-JSON ↔ Editor', () => {
  it('Export hat das Discord-Format (custom_id = Komponenten-ID, min/max_values, Farbe als Zahl)', () => {
    const now = new Date('2026-11-01T10:00:00.000Z');
    const j = mbToDiscordJson(full(), now);
    const m = j.messages[0]!;
    expect(m.embeds[0]).toMatchObject({ title: 'Titel', color: 0x1e3a8a, timestamp: now.toISOString(), author: { name: 'Autor', icon_url: 'https://a.example/i.png' }, footer: { text: 'Fuß' }, fields: [{ name: 'A', value: '1', inline: true }, { name: 'B', value: '2', inline: false }] });
    expect(m.components[0]!.components).toEqual([
      { type: 2, style: 5, url: 'https://example.com', label: 'Web', emoji: { name: '🌐' } },
      { type: 2, style: 3, custom_id: 'b2', label: 'Info', emoji: { id: '123456789012345678', name: 'pol' } },
      { type: 2, style: 4, custom_id: 'b3', label: 'Aus', disabled: true },
    ]);
    expect(m.components[1]!.components[0]).toMatchObject({ type: 3, custom_id: 's1', min_values: 0, max_values: 2, options: [{ label: 'Eins', value: 'o1', description: 'erste' }, { label: 'Zwei', value: 'o2' }] });
    expect(m.allowed_mentions).toEqual({ parse: ['users', 'roles'] });
    expect(j.webhook).toEqual({ username: 'Leitstelle', avatar_url: 'https://x.example/a.png' });
  });
  it('Rundreise: Export → Import ergibt denselben Inhalt; Aktionen und „beim Senden“ bleiben erhalten', () => {
    const now = new Date('2026-11-01T10:00:00.000Z');
    const d = full();
    const r = mbParseJsonText(mbToDiscordJsonText(d, now), { previous: d, sendNow: now });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.data.messages[0]!;
    expect(m.content).toBe(d.messages[0]!.content);
    expect(m.embeds[0]).toMatchObject({ title: 'Titel', color: '#1e3a8a', timestamp: 'send', authorName: 'Autor', footerIconUrl: 'https://x.example/f.png', imageUrl: 'https://x.example/i.png', thumbnailUrl: 'https://x.example/t.png' });
    expect(m.embeds[1]).toMatchObject({ timestamp: 'custom', timestampAt: '2026-01-02T03:04:05.000Z' });
    const row = m.rows[0]!; expect(row.type).toBe('buttons');
    if (row.type === 'buttons') {
      expect(row.buttons[1]).toMatchObject({ id: 'b2', kind: 'action', style: 'success', action: { type: 'reply', text: 'Hallo!' }, emoji: '<:pol:123456789012345678>' });
      expect(row.buttons[2]!.disabled).toBe(true);
    }
    const sel = m.rows[1]!; expect(sel).toMatchObject({ type: 'select', id: 's1', minValues: 0, maxValues: 2 });
    if (sel.type === 'select') expect(sel.options[0]!.action).toEqual({ type: 'reply', text: 'eins' });
    expect(r.data.webhookProfile).toEqual({ username: 'Leitstelle', avatarUrl: 'https://x.example/a.png' });
    expect(r.data.messages[1]!.content).toBe('Zweite Nachricht');
    expect(validateMbDocument(r.data).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('akzeptiert einzelne Nachricht, Liste und { messages: [{ data }] }', () => {
    expect(mbFromDiscordJson({ content: 'a' }).ok).toBe(true);
    const list = mbFromDiscordJson([{ content: 'a' }, { content: 'b' }]);
    expect(list.ok && list.data.messages.map((x) => x.content)).toEqual(['a', 'b']);
    const dh = mbFromDiscordJson({ messages: [{ data: { content: 'x', username: 'Hook', embeds: [{ title: 'T', color: 255 }] } }] });
    expect(dh.ok && dh.data.messages[0]!.embeds[0]!.color).toBe('#0000ff');
    expect(dh.ok && dh.data.webhookProfile.username).toBe('Hook');
  });
  it('Fehler mit Pfad: falscher Typ, unbekannte Komponente, Premium-Button, ungültiger Zeitstempel', () => {
    const a = mbFromDiscordJson({ embeds: [{ title: 5 }] });
    expect(!a.ok && a.error.path).toBe('embeds[0].title');
    const b = mbFromDiscordJson({ components: [{ type: 1, components: [{ type: 4 }] }] });
    expect(!b.ok && b.error.message).toMatch(/nicht unterstützt/);
    const c = mbFromDiscordJson({ messages: [{ components: [{ type: 1, components: [{ type: 2, style: 6, sku_id: '1' }] }] }] });
    expect(!c.ok && c.error).toMatchObject({ path: 'messages[0].components[0].components[0].style' });
    const d = mbFromDiscordJson({ embeds: [{ title: 'x', timestamp: 'gestern' }] });
    expect(!d.ok && d.error.message).toMatch(/ISO/);
    const e = mbParseJsonText('{"content": }');
    expect(!e.ok && e.error.line).toBe(1);
  });
  it('neue interaktive Komponenten brauchen eine Aktion; fremde custom_ids nur beim Bearbeiten übernehmbar', () => {
    const json = { content: 'x', components: [{ type: 1, components: [{ type: 2, style: 1, label: 'Ticket', custom_id: 'ticket:open:1' }] }] };
    const asAction = mbFromDiscordJson(json);
    expect(asAction.ok && asAction.notes[0]).toMatch(/Aktion festlegen/);
    expect(asAction.ok && validateMbDocument(asAction.data).some((i) => /Antworttext fehlt/.test(i.message))).toBe(true);
    const kept = mbFromDiscordJson(json, { foreignCustomIds: 'keep' });
    expect(kept.ok).toBe(true);
    if (!kept.ok) return;
    // nicht in der erlaubten Liste → Fehler; in der Liste → gültig, custom_id unverändert im Payload, keine neue Aktion
    expect(validateMbDocument(kept.data).some((i) => /custom_id/.test(i.message))).toBe(true);
    expect(validateMbDocument(kept.data, { keptCustomIds: ['ticket:open:1'] }).filter((i) => i.level === 'error')).toEqual([]);
    expect(interactiveComponents(kept.data.messages[0]!)).toEqual([]);
    expect(toDiscordPayload(kept.data.messages[0]!).components[0]!.components[0]).toMatchObject({ custom_id: 'ticket:open:1', style: 1 });
    expect(customIdsOf(json.components)).toEqual(['ticket:open:1']);
  });
});

describe('Auswahlmenü: Mindest-/Höchstanzahl', () => {
  const sel = (o: Record<string, unknown>) => mbDocumentDataSchema.parse({ messages: [{ id: 'm', rows: [{ id: 's', type: 'select', options: [{ id: 'a', label: 'A', action: { type: 'reply', text: 'a' } }, { id: 'b', label: 'B', action: { type: 'reply', text: 'b' } }], ...o }] }] });
  const errs = (d: MbDocumentData) => validateMbDocument(d).filter((i) => i.level === 'error').map((i) => i.message);
  it('Standard 1/1, Pflichtauswahl = min ≥ 1', () => expect(toDiscordPayload(sel({}).messages[0]!, { customIdOf: () => 'mb:x' }).components[0]!.components[0]).toMatchObject({ min_values: 1, max_values: 1 }));
  it('min > max und max > Optionen sind Fehler', () => {
    expect(errs(sel({ minValues: 2, maxValues: 1 }))[0]).toMatch(/Mindestanzahl/);
    expect(errs(sel({ maxValues: 3 }))[0]).toMatch(/Höchstanzahl/);
    expect(errs(sel({ minValues: 0, maxValues: 2 }))).toEqual([]);
  });
});

describe('Beispielvorlagen und Vorlagen-Export', () => {
  it('sechs gültige, sendbare Beispielvorlagen mit eindeutigen Namen', () => {
    expect(MB_EXAMPLE_TEMPLATES.map((t) => t.name)).toEqual(['Willkommen', 'Dienstbeginn', 'Bewerbungsinformationen', 'Ticket-Eröffnung', 'Ausbildungsankündigung', 'Regelwerk-Hinweis']);
    for (const t of MB_EXAMPLE_TEMPLATES) expect(validateMbDocument(t.data).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('Export-Format wird geprüft', () => {
    expect(mbTemplateExportSchema.safeParse({ format: MB_TEMPLATE_EXPORT_FORMAT, version: 1, templates: [{ name: 'A', category: null, data: { messages: [{ id: 'x', content: 'a' }] } }] }).success).toBe(true);
    expect(mbTemplateExportSchema.safeParse({ format: 'anders', version: 1, templates: [] }).success).toBe(false);
  });
});
