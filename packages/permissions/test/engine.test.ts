import { PERMISSIONS, PERMISSION_CATALOG, type Permission } from '@nexus/types';
import { describe, expect, it } from 'vitest';
import {
  effectivePermissions,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
  isValidPermission,
  moduleOf,
  resolvePermissions,
} from '../src/engine.js';

const set = (...p: Permission[]) => new Set<Permission>(p);

describe('Katalog', () => {
  it('enthält die geplanten Schlüssel und keine Duplikate', () => {
    for (const k of [
      'applications.view',
      'applications.manage',
      'training.view',
      'training.manage',
      'promotions.create',
      'promotions.approve',
      'shifts.start',
      'shifts.pause',
      'shifts.end',
      'sek.view',
      'sek.manage',
    ]) {
      expect(PERMISSIONS).toContain(k);
    }
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });
  it('jedes Modul hat Schlüssel nur mit seinem Präfix', () => {
    for (const m of PERMISSION_CATALOG)
      for (const [key] of m.permissions) expect(moduleOf(key)).toBe(m.module);
  });
});

describe('Engine', () => {
  it('löst Permissions über mehrere Rollen auf und ignoriert unbekannte Rollen', () => {
    const grants = new Map<string, Permission[]>([
      ['r1', ['shifts.start']],
      ['r2', ['training.view']],
    ]);
    expect([...resolvePermissions(grants, ['r1', 'r2', 'x'])].sort()).toEqual([
      'shifts.start',
      'training.view',
    ]);
    expect(resolvePermissions(grants, []).size).toBe(0);
  });
  it('direkte Permission genügt, andere nicht', () => {
    expect(hasPermission(set('shifts.start'), 'shifts.start')).toBe(true);
    expect(hasPermission(set('shifts.start'), 'shifts.end')).toBe(false);
  });
  it('<modul>.manage schließt das ganze Modul ein – aber nur dieses', () => {
    expect(hasPermission(set('training.manage'), 'training.view')).toBe(true);
    expect(hasPermission(set('applications.manage'), 'applications.submissions.accept')).toBe(true);
    expect(hasPermission(set('applications.manage'), 'training.view')).toBe(false); // früher: Superuser-Lücke
    expect(hasPermission(set('sek.manage'), 'shifts.manage')).toBe(false);
  });
  it('view/Einzelrechte implizieren kein manage', () => {
    expect(hasPermission(set('training.view'), 'shifts.manage')).toBe(false);
  });
  it('all/any und effektive Liste', () => {
    const s = set('shifts.start', 'training.manage');
    expect(hasAllPermissions(s, ['shifts.start', 'training.view'])).toBe(true);
    expect(hasAllPermissions(s, ['shifts.start', 'shifts.end'])).toBe(false);
    expect(hasAnyPermission(s, ['shifts.end', 'training.view'])).toBe(true);
    expect(hasAnyPermission(s, [])).toBe(false);
    expect(
      effectivePermissions(set('training.manage')).every((p) => p.startsWith('training.')),
    ).toBe(true);
    expect(effectivePermissions(set('training.manage'))).toEqual(
      expect.arrayContaining(['training.manage', 'training.view', 'training.edit']),
    );
  });
  it('validiert Schlüssel', () => {
    expect(isValidPermission('sek.view')).toBe(true);
    expect(isValidPermission('sek.*')).toBe(false);
    expect(isValidPermission('')).toBe(false);
  });
});

describe('Sammelrechte (tickets.handle ⇒ Einzelrechte)', () => {
  const set = (...p: string[]) => new Set(p) as ReadonlySet<Permission> as never;
  it('tickets.handle schließt Einzelrechte ein, ein Einzelrecht nicht das Sammelrecht', () => {
    expect(hasPermission(set('tickets.handle'), 'tickets.close' as Permission)).toBe(true);
    expect(hasPermission(set('tickets.close'), 'tickets.close' as Permission)).toBe(true);
    expect(hasPermission(set('tickets.close'), 'tickets.claim' as Permission)).toBe(false);
    expect(hasPermission(set('tickets.close'), 'tickets.handle' as Permission)).toBe(false);
  });
  it('tickets.view genügt für Transkripte, aber nicht zum Schließen', () => {
    expect(hasPermission(set('tickets.view'), 'tickets.transcript.view' as Permission)).toBe(true);
    expect(hasPermission(set('tickets.view'), 'tickets.close' as Permission)).toBe(false);
  });
});

describe('Büro und Dashboard-Ansicht', () => {
  const set = (...p: string[]) => new Set(p) as never;
  it('office.view gilt auch über die bisherigen Rechte; office.manage schließt es ein', () => {
    expect(hasPermission(set('office.manage'), 'office.view' as Permission)).toBe(true);
    expect(hasPermission(set('personnel.view'), 'office.view' as Permission)).toBe(true);
    expect(hasPermission(set('tickets.view'), 'office.view' as Permission)).toBe(false);
  });
  it('dashboard.view ist ein eigener Schlüssel ohne Schreibrechte', () => {
    expect(isValidPermission('dashboard.view')).toBe(true);
    expect(hasPermission(set('dashboard.view'), 'dashboard.manage' as Permission)).toBe(false);
  });
});
