import { describe, expect, it } from 'vitest';
import { panelConfigSchema } from '../src/panel.js';

const base = { embed: { title: 'Willkommen', description: 'Text' }, buttons: [] as unknown[] };
const btn = (o: Record<string, unknown> = {}) => ({
  id: 'abc',
  label: 'Los',
  style: 'primary',
  action: { type: 'message', content: 'Hi' },
  ...o,
});
const ok = (c: unknown) => panelConfigSchema.safeParse(c).success;
const msgs = (c: unknown) => {
  const r = panelConfigSchema.safeParse(c);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe('panelConfigSchema', () => {
  it('akzeptiert Embed mit Buttons, Select, Emojis und Farbe', () => {
    expect(
      ok({
        ...base,
        embed: {
          ...base.embed,
          color: '#5865F2',
          thumbnailUrl: 'https://x.de/a.png',
          footer: 'f',
          fields: [{ name: 'a', value: 'b', inline: true }],
        },
        buttons: [
          btn({ emoji: '🚓' }),
          btn({ id: 'lnk', style: 'link', url: 'https://example.com', action: undefined }),
          btn({
            id: 'role1',
            emoji: '<:logo:123456789012345678>',
            action: { type: 'role-toggle', roleId: '123456789012345678' },
          }),
        ],
        select: {
          placeholder: 'Wähle',
          options: [
            { id: 'o1x', label: 'Eins', emoji: '1️⃣', action: { type: 'message', content: 'x' } },
          ],
        },
      }),
    ).toBe(true);
  });
  it('verlangt Inhalt', () => {
    expect(ok({ embed: {}, buttons: [] })).toBe(false);
    expect(ok({ content: 'nur Text', embed: {}, buttons: [] })).toBe(true);
  });
  it('Link-Buttons brauchen https-URL und keine Aktion; andere brauchen eine Aktion', () => {
    expect(msgs({ ...base, buttons: [btn({ style: 'link', action: undefined })] })).toContain(
      'Link-Buttons brauchen eine Adresse.',
    );
    expect(
      ok({
        ...base,
        buttons: [btn({ style: 'link', url: 'http://unsicher.de', action: undefined })],
      }),
    ).toBe(false);
    expect(
      ok({
        ...base,
        buttons: [btn({ style: 'link', url: 'javascript:alert(1)', action: undefined })],
      }),
    ).toBe(false);
    expect(ok({ ...base, buttons: [btn({ action: undefined })] })).toBe(false);
    expect(ok({ ...base, buttons: [btn({ url: 'https://a.de' })] })).toBe(false);
  });
  it('lehnt ungültige Emojis, Farben, Komponenten-IDs und Rollen-IDs ab', () => {
    expect(ok({ ...base, buttons: [btn({ emoji: 'abc' })] })).toBe(false);
    expect(ok({ ...base, embed: { ...base.embed, color: 'red' } })).toBe(false);
    expect(ok({ ...base, buttons: [btn({ id: 'A B' })] })).toBe(false);
    expect(
      ok({ ...base, buttons: [btn({ action: { type: 'role-toggle', roleId: 'abc' } })] }),
    ).toBe(false);
    expect(ok({ ...base, buttons: [btn({ action: { type: 'unbekannt' } })] })).toBe(false);
  });
  it('erzwingt Limits und eindeutige IDs', () => {
    expect(
      ok({ ...base, buttons: Array.from({ length: 21 }, (_, i) => btn({ id: `b${i}x` })) }),
    ).toBe(false);
    expect(
      ok({ ...base, buttons: Array.from({ length: 20 }, (_, i) => btn({ id: `b${i}x` })) }),
    ).toBe(true);
    expect(msgs({ ...base, buttons: [btn(), btn()] })).toContain(
      'Komponenten-IDs müssen eindeutig sein.',
    );
    expect(
      ok({
        ...base,
        buttons: [btn()],
        select: { options: [{ id: 'abc', label: 'x', action: { type: 'message', content: 'x' } }] },
      }),
    ).toBe(false); // ID doppelt zu Button
    expect(ok({ ...base, embed: { description: 'x'.repeat(4097) } })).toBe(false);
    expect(
      ok({
        embed: { title: 't'.repeat(256), description: 'd'.repeat(4000), footer: 'f'.repeat(2000) },
        buttons: [],
      }),
    ).toBe(false); // > 6000 gesamt
    expect(ok({ ...base, select: { options: [] } })).toBe(false);
  });
});
