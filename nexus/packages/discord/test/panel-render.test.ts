import type { PanelConfig } from '@nexus/types';
import { describe, expect, it } from 'vitest';
import {
  findPanelAction,
  panelButtonId,
  panelSelectId,
  parseEmoji,
  renderPanelMessage,
} from '../src/panel-render.js';

const cfg: PanelConfig = {
  content: 'Hallo',
  embed: {
    title: 'T',
    description: 'D',
    color: '#ff0000',
    thumbnailUrl: 'https://x.de/t.png',
    footer: 'F',
    fields: [{ name: 'n', value: 'v' }],
  },
  buttons: [
    ...Array.from({ length: 6 }, (_, i): PanelConfig['buttons'][number] => ({
      id: `b${i}x`,
      label: `B${i}`,
      style: 'primary',
      action: { type: 'message', content: `m${i}` },
    })),
    {
      id: 'lnk',
      label: 'Web',
      style: 'link',
      url: 'https://example.com',
      emoji: '<a:wave:123456789012345678>',
    },
  ],
  select: {
    placeholder: 'P',
    options: [
      {
        id: 'o1x',
        label: 'Eins',
        emoji: '🚓',
        action: { type: 'role-toggle', roleId: '123456789012345678' },
      },
    ],
  },
};

describe('renderPanelMessage', () => {
  const msg = renderPanelMessage('pan1', cfg);
  it('rendert Embed (Farbe als Zahl, Thumbnail, Footer, Felder)', () => {
    expect(msg.content).toBe('Hallo');
    expect(msg.embeds?.[0]).toMatchObject({
      title: 'T',
      description: 'D',
      color: 0xff0000,
      thumbnail: { url: 'https://x.de/t.png' },
      footer: { text: 'F' },
      fields: [{ name: 'n', value: 'v', inline: false }],
    });
  });
  it('verteilt Buttons auf Reihen à 5 und hängt das Select als eigene Reihe an', () => {
    expect(msg.components?.map((r) => r.components.length)).toEqual([5, 2, 1]);
    expect(msg.components!.length).toBeLessThanOrEqual(5);
  });
  it('Custom-IDs verweisen auf Panel und Komponente; Link-Buttons haben URL statt Custom-ID', () => {
    const [first] = msg.components![0]!.components as { custom_id?: string; style: number }[];
    expect(first?.custom_id).toBe(panelButtonId('pan1', 'b0x'));
    const link = msg.components![1]!.components[1] as {
      url?: string;
      custom_id?: string;
      style: number;
      emoji?: unknown;
    };
    expect(link).toMatchObject({
      style: 5,
      url: 'https://example.com',
      emoji: { id: '123456789012345678', name: 'wave', animated: true },
    });
    expect(link.custom_id).toBeUndefined();
    expect((msg.components![2]!.components[0] as { custom_id: string }).custom_id).toBe(
      panelSelectId('pan1'),
    );
    expect(panelButtonId('x'.repeat(25), 'y'.repeat(12)).length).toBeLessThanOrEqual(100);
  });
  it('Select-Optionen tragen die Komponenten-ID als Wert', () => {
    const sel = msg.components![2]!.components[0] as {
      options: { value: string; emoji?: { name: string } }[];
    };
    expect(sel.options[0]).toMatchObject({ value: 'o1x', emoji: { name: '🚓' } });
  });
  it('lässt leere Embeds weg und überschreitet nie 5 Reihen bei 20 Buttons + Select', () => {
    const only = renderPanelMessage('p', { content: 'nur Text', embed: {}, buttons: [] });
    expect(only.embeds).toEqual([]);
    const full = renderPanelMessage('p', {
      ...cfg,
      buttons: Array.from({ length: 20 }, (_, i) => ({
        id: `b${i}x`,
        label: 'x',
        style: 'secondary' as const,
        action: { type: 'message' as const, content: 'x' },
      })),
    });
    expect(full.components).toHaveLength(5);
  });
});

describe('Hilfsfunktionen', () => {
  it('parseEmoji', () => {
    expect(parseEmoji('🚓')).toEqual({ name: '🚓' });
    expect(parseEmoji('<:logo:123456789012345678>')).toEqual({
      id: '123456789012345678',
      name: 'logo',
    });
  });
  it('findPanelAction findet Button- und Select-Aktionen, sonst undefined', () => {
    expect(findPanelAction(cfg, 'b1x')).toEqual({ type: 'message', content: 'm1' });
    expect(findPanelAction(cfg, 'o1x')?.type).toBe('role-toggle');
    expect(findPanelAction(cfg, 'lnk')).toBeUndefined();
    expect(findPanelAction(cfg, 'nope')).toBeUndefined();
  });
});
