import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '../src/permissions';
import { BOT_COMMAND_MODULES, MODULE_KEYS, commandsForServer, moduleDependencyError, moduleOfPermission, policyAllowsFlow } from '../src/modules';

describe('Modul-Katalog', () => {
  it('jedes Recht gehört zu genau einem Modul; Verwaltungsrechte zum Grundsystem', () => {
    for (const p of ALL_PERMISSIONS) expect(MODULE_KEYS).toContain(moduleOfPermission(p));
    expect(moduleOfPermission('cad.view')).toBe('cad');
    expect(moduleOfPermission('persons.view')).toBe('mdt');
    expect(moduleOfPermission('team.manage')).toBe('shift_logs');
    expect(moduleOfPermission('connections.manage')).toBe('core');
    expect(moduleOfPermission('*')).toBe('core');
  });
  it('Systemmodul nicht abschaltbar; MDT hängt nicht von CAD ab', () => {
    expect(moduleDependencyError('core', false, {})).toMatch(/Systemmodul/);
    expect(moduleDependencyError('mdt', true, { cad: false })).toBeNull();
    expect(moduleDependencyError('cad', false, {})).toBeNull();
  });
  it('Befehle je Server nach Modulen; Bot-Befehle verweisen nur auf bekannte Module', () => {
    for (const m of Object.values(BOT_COMMAND_MODULES)) expect(MODULE_KEYS).toContain(m);
    const all = [{ name: 'cad' }, { name: 'person' }, { name: 'hilfe' }];
    expect(commandsForServer(all, ['cad']).map((c) => c.name)).toEqual(['person', 'hilfe']);
  });
  it('Richtungen: unidirektional bleibt unidirektional, NONE/aus überträgt nichts', () => {
    const p = { sourceServerId: 'A', targetServerId: 'B', direction: 'A_TO_B', enabled: true };
    expect(policyAllowsFlow(p, 'A', 'B')).toBe(true);
    expect(policyAllowsFlow(p, 'B', 'A')).toBe(false);
    expect(policyAllowsFlow({ ...p, direction: 'B_TO_A' }, 'B', 'A')).toBe(true);
    expect(policyAllowsFlow({ ...p, direction: 'BIDIRECTIONAL' }, 'B', 'A')).toBe(true);
    expect(policyAllowsFlow({ ...p, direction: 'NONE' }, 'A', 'B')).toBe(false);
    expect(policyAllowsFlow({ ...p, enabled: false }, 'A', 'B')).toBe(false);
    expect(policyAllowsFlow(p, 'A', 'C')).toBe(false);
  });
});
