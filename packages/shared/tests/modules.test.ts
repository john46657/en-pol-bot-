import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS } from '../src/permissions';
import { BOT_COMMAND_MODULES, MODULE_KEYS, commandsForModules, moduleDependencyError, moduleOfPermission } from '../src/modules';

describe('Modul-Katalog', () => {
  it('jedes Recht gehört zu genau einem Modul; Verwaltungsrechte zum Grundsystem', () => {
    for (const p of ALL_PERMISSIONS) expect(MODULE_KEYS).toContain(moduleOfPermission(p));
    expect(moduleOfPermission('cad.view')).toBe('cad');
    expect(moduleOfPermission('persons.view')).toBe('mdt');
    expect(moduleOfPermission('team.manage')).toBe('shift_logs');
    expect(moduleOfPermission('modules.manage')).toBe('core');
    expect(moduleOfPermission('*')).toBe('core');
  });
  it('keine Multi-Server-Rechte mehr (Server, Verbindungen, Synchronisierung)', () => {
    expect(ALL_PERMISSIONS.filter((p) => /^(servers|connections|sync)\./.test(p))).toEqual([]);
  });
  it('Systemmodul nicht abschaltbar; MDT hängt nicht von CAD ab', () => {
    expect(moduleDependencyError('core', false, {})).toMatch(/Systemmodul/);
    expect(moduleDependencyError('mdt', true, { cad: false })).toBeNull();
    expect(moduleDependencyError('cad', false, {})).toBeNull();
  });
  it('Befehle nach Modulen; Bot-Befehle verweisen nur auf bekannte Module', () => {
    for (const m of Object.values(BOT_COMMAND_MODULES)) expect(MODULE_KEYS).toContain(m);
    const all = [{ name: 'cad' }, { name: 'person' }, { name: 'hilfe' }];
    expect(commandsForModules(all, ['cad']).map((c) => c.name)).toEqual(['person', 'hilfe']);
  });
});
