import { describe, expect, it } from 'vitest';
import { DISCORD_LIMITS, cloneWithNewIds, emptyMbDocument, hasErrors, interactiveComponents, isValidEmoji, mbDocumentDataSchema, mbSummary, missingBotPerms, toDiscordPayload, validateMbDocument, type MbDocumentData } from '../src/message-builder';

const doc = (over: Record<string, unknown> = {}): MbDocumentData => mbDocumentDataSchema.parse({ messages: [{ id: 'm1', content: 'Hallo **Team**', ...over }] });
const errors = (d: MbDocumentData, o = {}) => validateMbDocument(d, o).filter((i) => i.level === 'error').map((i) => i.message);

describe('Message Builder – Schema', () => {
  it('Entwürfe dürfen unfertig sein (locker gespeichert), Standardwerte werden ergänzt', () => {
    const d = mbDocumentDataSchema.parse({ messages: [{ id: 'a', embeds: [{ id: 'e', title: 'x'.repeat(300) }] }] });
    expect(d.messages[0]!.mentions).toEqual({ users: true, roles: false, everyone: false });
    expect(d.messages[0]!.embeds[0]!.fields).toEqual([]);
    expect(emptyMbDocument().messages).toHaveLength(1);
  });
  it('cloneWithNewIds vergibt neue IDs, Inhalte bleiben', () => {
    const d = doc({ embeds: [{ id: 'e1', title: 'T', fields: [{ id: 'f1', name: 'a', value: 'b' }] }] });
    const c = cloneWithNewIds(d.messages[0]!);
    expect(c.id).not.toBe('m1');
    expect(c.embeds[0]!.id).not.toBe('e1');
    expect(c.embeds[0]!.fields[0]).toMatchObject({ name: 'a', value: 'b' });
  });
});

describe('Message Builder – Discord-Limits', () => {
  it('gültige Nachricht ohne Fehler', () => expect(errors(doc())).toEqual([]));
  it('leere Nachricht, zu langer Text', () => {
    expect(errors(doc({ content: '' }))[0]).toMatch(/leer/);
    expect(errors(doc({ content: 'x'.repeat(2001) }))[0]).toMatch(/2001\/2000/);
    expect(errors(doc({ content: '😀'.repeat(2000) }))).toEqual([]); // Zeichen, nicht UTF-16-Einheiten
  });
  it('Embed-Limits: Titel, Beschreibung, Felder, 6000 gesamt, 10 Embeds', () => {
    expect(errors(doc({ embeds: [{ id: 'e', title: 'x'.repeat(257) }] })).join()).toMatch(/Titel: 257\/256/);
    expect(errors(doc({ embeds: [{ id: 'e', description: 'x'.repeat(4097) }] })).join()).toMatch(/4097\/4096/);
    const fields = Array.from({ length: 26 }, (_, i) => ({ id: `f${i}`, name: 'n', value: 'v' }));
    expect(errors(doc({ embeds: [{ id: 'e', fields }] })).join()).toMatch(/25 Felder/);
    expect(errors(doc({ embeds: [{ id: 'e', fields: [{ id: 'f', name: '', value: 'x'.repeat(1025) }] }] })).join()).toMatch(/Feldname fehlt.*1025\/1024/);
    const big = Array.from({ length: 2 }, (_, i) => ({ id: `e${i}`, description: 'x'.repeat(3500) }));
    expect(errors(doc({ embeds: big })).join()).toMatch(/7000\/6000/);
    expect(errors(doc({ embeds: Array.from({ length: 11 }, (_, i) => ({ id: `e${i}`, title: 't' })) })).join()).toMatch(/10 Embeds/);
    expect(errors(doc({ embeds: [{ id: 'e' }] })).join()).toMatch(/Embed ist leer/);
  });
  it('URLs, Farbe, Autor/Fußzeile, Zeitstempel', () => {
    const e = errors(doc({ embeds: [{ id: 'e', title: 'T', url: 'javascript:alert(1)', imageUrl: 'ftp://x', color: 'blau', footerIconUrl: 'https://a.de/i.png', authorIconUrl: 'https://a.de/i.png', timestamp: 'custom', timestampAt: 'morgen' }] })).join('\n');
    expect(e).toMatch(/Titel-URL: keine gültige URL/);
    expect(e).toMatch(/Bild: keine gültige URL/);
    expect(e).toMatch(/Farbe/);
    expect(e).toMatch(/Fußzeilen-Icon braucht/);
    expect(e).toMatch(/Autornamen/);
    expect(e).toMatch(/Zeitstempel/);
    const w = validateMbDocument(doc({ embeds: [{ id: 'e', title: 'T', imageUrl: 'http://a.de/x.png' }] }));
    expect(w.filter((x) => x.level === 'warning').map((x) => x.message).join()).toMatch(/http/);
  });
  it('Komponenten: 5 Reihen, 5 Buttons, Link-URL, Aktion nötig, Webhook nur Links', () => {
    const btn = (i: number, x = {}) => ({ id: `b${i}`, kind: 'link', label: 'L', url: 'https://emden.example/', ...x });
    expect(errors(doc({ rows: [{ id: 'r', type: 'buttons', buttons: Array.from({ length: 6 }, (_, i) => btn(i)) }] })).join()).toMatch(/5 Buttons/);
    expect(errors(doc({ rows: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, type: 'buttons', buttons: [btn(i)] })) })).join()).toMatch(/5 Komponenten-Reihen/);
    expect(errors(doc({ rows: [{ id: 'r', type: 'buttons', buttons: [btn(1, { url: '' })] }] })).join()).toMatch(/braucht eine URL/);
    expect(errors(doc({ rows: [{ id: 'r', type: 'buttons', buttons: [btn(1, { url: 'https://x.de/' + 'a'.repeat(DISCORD_LIMITS.linkUrl) })] }] })).join()).toMatch(/512/);
    expect(errors(doc({ rows: [{ id: 'r', type: 'buttons', buttons: [btn(1, { kind: 'action' })] }] })).join()).toMatch(/Antworttext fehlt/);
    const act = doc({ rows: [{ id: 'r', type: 'buttons', buttons: [btn(1, { kind: 'action', action: { type: 'reply', text: 'Danke' } })] }] });
    expect(errors(act)).toEqual([]);
    expect(errors(act, { target: 'webhook' }).join()).toMatch(/nur Link-Buttons/);
    const role = doc({ rows: [{ id: 'r', type: 'buttons', buttons: [btn(1, { kind: 'action', action: { type: 'role', roleId: '123456789012345678' } })] }] });
    expect(errors(role, { allowRoleActions: false }).join()).toMatch(/Rollen-Aktionen/);
    expect(errors(role, { roleIds: ['999999999999999999'] }).join()).toMatch(/gibt es auf dem Discord-Server nicht/);
    expect(errors(role, { roleIds: ['123456789012345678'] })).toEqual([]);
    expect(errors(doc({ rows: [{ id: 's', type: 'select', options: [] }] })).join()).toMatch(/mindestens eine Option/);
  });
  it('Emoji-Erkennung', () => {
    for (const e of ['🚓', '👮‍♂️', '🇩🇪', '1️⃣', '<:polizei:123456789012345678>', '<a:blink:123456789012345678>']) expect(isValidEmoji(e)).toBe(true);
    for (const e of ['abc', ':smile:', '<:x:1>', '🚓 Text']) expect(isValidEmoji(e)).toBe(false);
  });
  it('Webhook-Profil: verbotene Namen', () => {
    const d = { ...doc(), webhookProfile: { username: 'Discord Bot', avatarUrl: '' } };
    expect(errors(d, { target: 'webhook' }).join()).toMatch(/clyde/);
    expect(errors(d, { target: 'bot' })).toEqual([]);
  });
  it('hasErrors', () => { expect(hasErrors(validateMbDocument(doc({ content: '' })))).toBe(true); expect(hasErrors(validateMbDocument(doc()))).toBe(false); });
});

describe('Message Builder – Discord-Payload', () => {
  const full = doc({
    content: 'Hallo <@&123456789012345678>',
    mentions: { users: true, roles: true, everyone: false },
    embeds: [{ id: 'e', title: 'Dienstantritt', url: 'https://emden.example/', description: 'Text', color: '#1e3a8a', authorName: 'Leitstelle', authorIconUrl: 'https://emden.example/a.png', thumbnailUrl: 'https://emden.example/t.png', imageUrl: 'https://emden.example/i.png', footerText: 'EN | Polizei', footerIconUrl: 'https://emden.example/f.png', timestamp: 'send', fields: [{ id: 'f', name: 'Einheit', value: 'EMD 1', inline: true }] }],
    rows: [
      { id: 'r1', type: 'buttons', buttons: [{ id: 'b1', kind: 'link', label: 'Website', emoji: '🌐', url: 'https://emden.example/' }, { id: 'b2', kind: 'action', label: 'Info', style: 'success', emoji: '<:pol:123456789012345678>', action: { type: 'reply', text: 'Hi' } }] },
      { id: 's1', type: 'select', placeholder: 'Wähle', options: [{ id: 'o1', label: 'A', description: 'd', action: { type: 'reply', text: 'A!' } }] },
    ],
  });
  it('erzeugt Discord-REST-JSON', () => {
    const now = new Date('2026-10-14T12:00:00Z');
    const p = toDiscordPayload(full.messages[0]!, { now, customIdOf: (id) => `mb:${id}` });
    expect(p.allowed_mentions).toEqual({ parse: ['users', 'roles'] });
    expect(p.embeds[0]).toEqual({ title: 'Dienstantritt', url: 'https://emden.example/', description: 'Text', color: 0x1e3a8a, author: { name: 'Leitstelle', icon_url: 'https://emden.example/a.png' }, thumbnail: { url: 'https://emden.example/t.png' }, image: { url: 'https://emden.example/i.png' }, footer: { text: 'EN | Polizei', icon_url: 'https://emden.example/f.png' }, timestamp: now.toISOString(), fields: [{ name: 'Einheit', value: 'EMD 1', inline: true }] });
    expect(p.components[0]!.components).toEqual([
      { type: 2, style: 5, url: 'https://emden.example/', label: 'Website', emoji: { name: '🌐' } },
      { type: 2, style: 3, custom_id: 'mb:b2', label: 'Info', emoji: { id: '123456789012345678', name: 'pol' } },
    ]);
    expect(p.components[1]!.components[0]).toMatchObject({ type: 3, custom_id: 'mb:s1', min_values: 1, max_values: 1, placeholder: 'Wähle', options: [{ label: 'A', value: 'o1', description: 'd' }] });
  });
  it('ohne Aktions-Zuordnung keine interaktiven Komponenten (keine Buttons ohne Funktion)', () => {
    const p = toDiscordPayload(full.messages[0]!);
    expect(p.components).toHaveLength(1);
    expect(p.components[0]!.components).toHaveLength(1);
    expect(p.components[0]!.components[0]).toMatchObject({ style: 5 });
  });
  it('Zusammenfassung, interaktive Komponenten, fehlende Bot-Rechte', () => {
    expect(mbSummary(full.messages[0]!)).toBe('Text · 1 Embed · 2 Buttons · 1 Auswahlmenü');
    expect(interactiveComponents(full.messages[0]!).map((c) => c.componentId)).toEqual(['b2', 's1']);
    expect(missingBotPerms({ view: true, send: true, embed: false }, full)).toEqual(['Links einbetten']);
    expect(missingBotPerms({ view: true, send: true, embed: true }, full)).toEqual([]);
  });
});
