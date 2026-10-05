import { describe, expect, it } from 'vitest';
import { MODULES, commandBlock, moduleOfApiSegment, moduleOfNav, normalizeState } from '../src/index.js';

describe('Module', () => {
  it('Verzeichnis ist eindeutig (Schlüssel, Befehle, API-Pfade)', () => {
    const uniq = (xs: readonly string[]) => new Set(xs).size === xs.length;
    expect(uniq(MODULES.map((m) => m.key))).toBe(true);
    expect(uniq(MODULES.flatMap((m) => m.commands))).toBe(true);
    expect(uniq(MODULES.flatMap((m) => m.apiPrefixes))).toBe(true);
    expect(uniq(MODULES.flatMap((m) => m.navKeys))).toBe(true);
  });
  it('Zustand wird tolerant gelesen', () => {
    expect(normalizeState(null)).toEqual({ disabled: [], disabledCommands: [] });
    expect(normalizeState({ disabled: ['tickets', 'gibtsnicht', 'tickets', 3], disabledCommands: ['mod', 'nexus', 'quatsch'] })).toEqual({ disabled: ['tickets'], disabledCommands: ['mod'] });
  });
  it('Befehle: Modul aus, einzeln aus, Grundbefehle immer', () => {
    const s = normalizeState({ disabled: ['tickets'], disabledCommands: ['mod'] });
    expect(commandBlock(s, 'ticket')).toEqual({ blocked: true, message: 'Das Modul „Tickets“ ist auf diesem Server deaktiviert.' });
    expect(commandBlock(s, 'mod')).toEqual({ blocked: true, message: 'Der Befehl /mod ist auf diesem Server deaktiviert.' });
    expect(commandBlock(s, 'sperre')).toEqual({ blocked: false });
    expect(commandBlock(normalizeState({ disabled: MODULES.map((m) => m.key) }), 'nexus')).toEqual({ blocked: false });
  });
  it('Zuordnung von API-Pfaden und Menüpunkten', () => {
    expect(moduleOfApiSegment('submissions')?.key).toBe('applications');
    expect(moduleOfApiSegment('personnel-structure')?.key).toBe('personnel');
    expect(moduleOfApiSegment('permissions')).toBeUndefined();
    expect(moduleOfNav('team')?.key).toBe('personnel');
    expect(moduleOfNav('logs')).toBeUndefined();
  });
});
