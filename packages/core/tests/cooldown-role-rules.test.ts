import { describe, it, expect } from 'vitest';
import { RoleRuleType, RoleMatchMode } from '@nexus/types';
import { checkCooldown, computeExpiry, durationToSeconds, formatDuration } from '../src/index.js';
import { checkRoleRequirements, matchRoles, roleActionsForTransition } from '../src/index.js';

describe('Cooldown & Zeitlimit (§20/§51)', () => {
  it('rechnet Duration in Sekunden', () => {
    expect(durationToSeconds({ days: 2, hours: 3, minutes: 4 })).toBe(2 * 86400 + 3 * 3600 + 240);
    expect(durationToSeconds(undefined)).toBe(0);
  });

  it('formatiert Dauer lesbar', () => {
    expect(formatDuration({ days: 1, hours: 2 })).toBe('1 Tag 2 Stunden');
    expect(formatDuration({ minutes: 30 })).toBe('30 Minuten');
  });

  it('erkennt aktiven Cooldown', () => {
    const vor3tagen = new Date(Date.now() - 3 * 86400_000).toISOString();
    const state = checkCooldown({ days: 7 }, vor3tagen);
    expect(state.active).toBe(true);
    expect(state.remainingSeconds).toBeGreaterThan(3 * 86400 - 60);
    expect(state.remainingSeconds).toBeLessThanOrEqual(4 * 86400);
  });

  it('erkennt abgelaufenen Cooldown', () => {
    const vor10tagen = new Date(Date.now() - 10 * 86400_000).toISOString();
    expect(checkCooldown({ days: 7 }, vor10tagen).active).toBe(false);
  });

  it('ohne Cooldown immer inaktiv', () => {
    expect(checkCooldown(undefined, new Date().toISOString()).active).toBe(false);
  });

  it('berechnet den Ablauf eines Zeitlimits', () => {
    const started = '2026-09-24T18:00:00.000Z';
    expect(computeExpiry({ hours: 3 }, started)).toBe('2026-09-24T21:00:00.000Z');
    expect(computeExpiry(undefined, started)).toBeUndefined();
  });
});

describe('Rollenregeln (§38)', () => {
  it('HAS_ALL / HAS_ANY / HAS_NONE', () => {
    const base = { id: 'x', type: RoleRuleType.REQUIRED } as const;
    expect(
      matchRoles(['r1', 'r2'], {
        ...base,
        roleId: 'r1',
        additionalRoleIds: ['r2'],
        matchMode: RoleMatchMode.HAS_ALL,
      }),
    ).toBe(true);
    expect(
      matchRoles(['r1'], {
        ...base,
        roleId: 'r1',
        additionalRoleIds: ['r2'],
        matchMode: RoleMatchMode.HAS_ALL,
      }),
    ).toBe(false);
    expect(matchRoles(['r1'], { ...base, roleId: 'r1', matchMode: RoleMatchMode.HAS_ANY })).toBe(
      true,
    );
    expect(matchRoles(['r2'], { ...base, roleId: 'r3', matchMode: RoleMatchMode.HAS_ANY })).toBe(
      false,
    );
    expect(matchRoles(['r2'], { ...base, roleId: 'r1', matchMode: RoleMatchMode.HAS_NONE })).toBe(
      true,
    );
    expect(
      matchRoles(['r1', 'r2'], { ...base, roleId: 'r1', matchMode: RoleMatchMode.HAS_NONE }),
    ).toBe(false);
  });

  it('required/restricted Start-Checks', () => {
    const rules = [
      {
        id: '1',
        type: RoleRuleType.REQUIRED,
        roleId: 'mitglied',
        matchMode: RoleMatchMode.HAS_ANY,
      },
      {
        id: '2',
        type: RoleRuleType.RESTRICTED,
        roleId: 'gebannt',
        matchMode: RoleMatchMode.HAS_ANY,
      },
    ];
    expect(checkRoleRequirements(['mitglied'], rules).ok).toBe(true);
    expect(checkRoleRequirements(['gast'], rules).ok).toBe(false);
    expect(checkRoleRequirements(['mitglied', 'gebannt'], rules).ok).toBe(false);
  });
});

describe('Rollen-Automation (§39)', () => {
  const rules = [
    { id: '1', type: RoleRuleType.PENDING, roleId: 'bewerber', matchMode: RoleMatchMode.HAS_ANY },
    { id: '2', type: RoleRuleType.ACCEPTED, roleId: 'polizei', matchMode: RoleMatchMode.HAS_ANY },
    { id: '3', type: RoleRuleType.DENIED, roleId: 'abgelehnt', matchMode: RoleMatchMode.HAS_ANY },
  ];

  it('fügt Pending-Rolle bei Einreichung hinzu', () => {
    const submit = roleActionsForTransition('IN_PROGRESS', 'SUBMITTED', rules);
    expect(submit).toContainEqual({
      type: 'ADD',
      roleId: 'bewerber',
      reason: 'Bewerbung eingereicht',
    });
  });

  it('bei Accept: Pending weg, Fraktion dazu', () => {
    const accept = roleActionsForTransition('SUBMITTED', 'ACCEPTED', rules);
    expect(accept).toContainEqual({
      type: 'REMOVE',
      roleId: 'bewerber',
      reason: 'Bewerbung angenommen',
    });
    expect(accept).toContainEqual({
      type: 'ADD',
      roleId: 'polizei',
      reason: 'Bewerbung angenommen',
    });
  });

  it('bei Deny: Pending weg, Denied-Rolle dazu', () => {
    const deny = roleActionsForTransition('SUBMITTED', 'DENIED', rules);
    expect(deny).toContainEqual({
      type: 'REMOVE',
      roleId: 'bewerber',
      reason: 'Bewerbung abgelehnt',
    });
    expect(deny).toContainEqual({
      type: 'ADD',
      roleId: 'abgelehnt',
      reason: 'Bewerbung abgelehnt',
    });
  });

  it('dedupliziert Aktionen', () => {
    const actions = roleActionsForTransition('SUBMITTED', 'ACCEPTED', [
      { id: '1', type: RoleRuleType.ACCEPTED, roleId: 'polizei', matchMode: RoleMatchMode.HAS_ANY },
      { id: '2', type: RoleRuleType.ACCEPTED, roleId: 'polizei', matchMode: RoleMatchMode.HAS_ALL },
    ]);
    expect(actions.filter((a) => a.roleId === 'polizei')).toHaveLength(1);
  });
});
