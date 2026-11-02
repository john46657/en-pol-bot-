import { describe, expect, it } from 'vitest';
import {
  accessLevelGrants, accessLevelOf, applyAccessLevel, buildOrgTree, effectiveQualificationStatus, helpSlug, isBackupDue,
  orgAncestors, orgDescendants, orgWouldCycle, practicalExamSchema, resolvePermission, scorePractical, backupScheduleSchema,
} from '../src';

describe('Zugriffsstufen (Berechtigungsmatrix)', () => {
  it('maps levels to existing permission keys and back', () => {
    expect(accessLevelGrants('org', 'view')).toEqual([{ permission: 'org.view', effect: 'ALLOW' }]);
    expect(accessLevelGrants('org', 'edit').map((g) => g.permission)).toEqual(['org.view', 'org.edit']);
    expect(accessLevelGrants('org', 'full')).toEqual([{ permission: 'org.*', effect: 'ALLOW' }]);
    expect(accessLevelGrants('org', 'blocked')).toEqual([{ permission: 'org.*', effect: 'DENY' }]);
    for (const l of ['none', 'view', 'edit', 'full', 'blocked'] as const) expect(accessLevelOf('backup', accessLevelGrants('backup', l))).toBe(l);
    // sensible/verwaltende Rechte nie in „Bearbeiten“
    const edit = accessLevelGrants('personnel', 'edit').map((g) => g.permission);
    expect(edit).toContain('personnel.notes_create');
    expect(edit).not.toContain('personnel.view_sensitive');
    expect(edit).not.toContain('personnel.notes_confidential');
    expect(edit).not.toContain('personnel.delete');
    expect(accessLevelOf('personnel', [{ permission: 'personnel.view', effect: 'ALLOW' }, { permission: 'personnel.delete', effect: 'ALLOW' }])).toBe('custom');
    expect(accessLevelOf('personnel', [{ permission: '*', effect: 'ALLOW' }])).toBe('full');
  });
  it('replaces only the area and keeps other grants; explicit block wins over lower roles', () => {
    const before = [{ permission: 'org.edit', effect: 'ALLOW' as const }, { permission: 'help.view', effect: 'ALLOW' as const }];
    expect(applyAccessLevel(before, 'org', 'none')).toEqual([{ permission: 'help.view', effect: 'ALLOW' }]);
    const ctx = { userOverrides: [], roleGrants: [{ permission: 'org.*', effect: 'DENY' as const, rank: 10 }, { permission: 'org.view', effect: 'ALLOW' as const, rank: 50 }] };
    expect(resolvePermission(ctx, 'org.view').allowed).toBe(false);
    // Benutzer-Sonderrecht schlägt Rollensperre, Benutzer-Sperre schlägt alles
    expect(resolvePermission({ ...ctx, userOverrides: [{ permission: 'org.view', effect: 'ALLOW' }] }, 'org.view').allowed).toBe(true);
    expect(resolvePermission({ userOverrides: [{ permission: 'org.view', effect: 'DENY' }], roleGrants: [{ permission: '*', effect: 'ALLOW' }] }, 'org.view').allowed).toBe(false);
  });
});

describe('Organigramm', () => {
  const nodes = [{ id: 'a', parentId: null, name: 'Führung' }, { id: 'b', parentId: 'a', name: 'Abteilung' }, { id: 'c', parentId: 'b', name: 'DG 1' }, { id: 'd', parentId: 'x', name: 'verwaist' }];
  it('descendants, ancestors, cycles, tree', () => {
    expect([...orgDescendants(nodes, 'a')].sort()).toEqual(['b', 'c']);
    expect(orgAncestors(nodes, 'c')).toEqual(['b', 'a']);
    expect(orgWouldCycle(nodes, 'a', 'c')).toBe(true);
    expect(orgWouldCycle(nodes, 'a', 'a')).toBe(true);
    expect(orgWouldCycle(nodes, 'c', 'a')).toBe(false);
    const tree = buildOrgTree(nodes);
    expect(tree.map((t) => t.id)).toEqual(['a', 'd']);
    expect(tree[0]!.children[0]!.children[0]!.id).toBe('c');
  });
});

describe('Praktische Prüfung', () => {
  const criteria = [{ id: 'k1', label: 'Eigensicherung', maxPoints: 10, required: true }, { id: 'k2', label: 'Kommunikation', maxPoints: 10, required: false }];
  it('scores per criterion with required criteria and completeness', () => {
    expect(scorePractical(criteria, { k1: { points: 8 }, k2: { points: 6 } }, 12)).toMatchObject({ total: 14, max: 20, passed: true, complete: true });
    expect(scorePractical(criteria, { k1: { points: 4 }, k2: { points: 10 } }, 12)).toMatchObject({ passed: false, failedRequired: ['k1'] });
    expect(scorePractical(criteria, { k1: { points: 8 } }, 5)).toMatchObject({ complete: false, missing: ['k2'], passed: false });
    expect(scorePractical(criteria, { k1: { points: 11 }, k2: { points: 1 } }, 5)).toMatchObject({ invalid: ['k1'], passed: false });
  });
  it('rejects impossible pass marks', () => {
    expect(practicalExamSchema.safeParse({ title: 'Test', criteria, passPoints: 21 }).success).toBe(false);
    expect(practicalExamSchema.safeParse({ title: 'Test', criteria, passPoints: 20 }).success).toBe(true);
  });
});

describe('Qualifikationen, Hilfe, Backup-Zeitplan', () => {
  it('expires active qualifications', () => {
    expect(effectiveQualificationStatus({ status: 'ACTIVE', expiresAt: '2020-01-01' })).toBe('EXPIRED');
    expect(effectiveQualificationStatus({ status: 'REVOKED', expiresAt: '2020-01-01' })).toBe('REVOKED');
    expect(effectiveQualificationStatus({ status: 'ACTIVE', expiresAt: null })).toBe('ACTIVE');
  });
  it('slugs', () => { expect(helpSlug('Wie melde ich mich im MDT an?')).toBe('wie-melde-ich-mich-im-mdt-an'); expect(helpSlug('Größe & Übung')).toBe('groesse-uebung'); });
  it('schedules', () => {
    const now = new Date('2026-11-04T10:00:00Z'); // Mittwoch
    const daily = backupScheduleSchema.parse({ frequency: 'daily', hour: 3 });
    expect(isBackupDue(daily, new Date('2026-11-04T03:30:00Z'), now)).toBe(false);
    expect(isBackupDue(daily, new Date('2026-11-03T03:30:00Z'), now)).toBe(true);
    const weekly = backupScheduleSchema.parse({ frequency: 'weekly', weekday: 1, hour: 3 });
    expect(isBackupDue(weekly, new Date('2026-11-02T04:00:00Z'), now)).toBe(false);
    expect(isBackupDue(weekly, new Date('2026-11-01T04:00:00Z'), now)).toBe(true);
    const monthly = backupScheduleSchema.parse({ frequency: 'monthly', monthDay: 5, hour: 3 });
    expect(isBackupDue(monthly, new Date('2026-10-06T00:00:00Z'), now)).toBe(false);
    expect(isBackupDue(monthly, new Date('2026-10-04T00:00:00Z'), now)).toBe(true);
    expect(isBackupDue(backupScheduleSchema.parse({ frequency: 'off' }), null, now)).toBe(false);
    expect(isBackupDue(backupScheduleSchema.parse({}), null, now)).toBe(true);
  });
});
