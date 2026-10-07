import { describe, expect, it } from 'vitest';
import { readableOn } from '../src/lib/prefs';

describe('text colour on the accent colour', () => {
  it('uses dark text on light accents and white on dark ones', () => {
    expect(readableOn('#ffffff')).toBe('#111827');
    expect(readableOn('#facc15')).toBe('#111827'); // gelb
    expect(readableOn('#22c55e')).toBe('#111827'); // hellgrün
    expect(readableOn('#6f1f1f')).toBe('#ffffff'); // dunkelrot (Screenshot)
    expect(readableOn('#3b82f6')).toBe('#ffffff'); // Standard-Blau bleibt weiß
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('kein-hex')).toBe('#ffffff');
  });
});

describe('background decides light or dark', () => {
  it('light gradients/colours → light, dark ones → dark, standard/image → chosen mode', async () => {
    const { backgroundIsLight } = await import('../src/lib/prefs');
    expect(backgroundIsLight({ type: 'gradient', value: 'hell' })).toBe(true);
    expect(backgroundIsLight({ type: 'gradient', value: 'nacht' })).toBe(false);
    expect(backgroundIsLight({ type: 'color', value: '#ffffff' })).toBe(true);
    expect(backgroundIsLight({ type: 'color', value: '#0b0e14' })).toBe(false);
    expect(backgroundIsLight({ type: 'none', value: '' })).toBeNull();
    expect(backgroundIsLight({ type: 'image', value: 'https://x/y.jpg' })).toBeNull();
  });
});
