import { describe, expect, it } from 'vitest';
import type { PermissionGrant } from '../src';
import { resolvePermission, can, ALL_PERMISSIONS, assertTransition, canTransition, DISPATCH_TRANSITIONS, TICKET_TRANSITIONS, InvalidTransitionError, REPORT_TRANSITIONS, isValidRobloxUserId } from '../src';

const ctx = (userOverrides: PermissionGrant[] = [], roleGrants: PermissionGrant[] = []) => ({ userOverrides, roleGrants });

describe('resolvePermission', () => {
  it('defaults to deny', () => {
    expect(resolvePermission(ctx(), 'persons.view')).toEqual({ allowed: false, source: 'DEFAULT_DENY' });
  });
  it('role allow grants', () => {
    expect(resolvePermission(ctx([], [{ permission: 'persons.view', effect: 'ALLOW' }]), 'persons.view').source).toBe('ROLE_ALLOW');
  });
  it('role deny beats role allow', () => {
    const r = resolvePermission(ctx([], [{ permission: 'a.b', effect: 'ALLOW' }, { permission: 'a.b', effect: 'DENY' }]), 'a.b');
    expect(r).toEqual({ allowed: false, source: 'ROLE_DENY' });
  });
  it('user allow beats role deny', () => {
    const r = resolvePermission(ctx([{ permission: 'dispatch.manage', effect: 'ALLOW' }], [{ permission: 'dispatch.manage', effect: 'DENY' }]), 'dispatch.manage');
    expect(r).toEqual({ allowed: true, source: 'USER_ALLOW' });
  });
  it('user DENY overrides role ALLOW', () => {
    const r = resolvePermission(ctx([{ permission: 'tickets.void', effect: 'DENY' }], [{ permission: 'tickets.void', effect: 'ALLOW' }]), 'tickets.void');
    expect(r).toEqual({ allowed: false, source: 'USER_DENY' });
  });
  it('user DENY beats user ALLOW', () => {
    const r = resolvePermission(ctx([{ permission: 'x.y', effect: 'ALLOW' }, { permission: 'x.y', effect: 'DENY' }]), 'x.y');
    expect(r.source).toBe('USER_DENY');
  });
  it('wildcards match module and global, deny wildcard wins at same level', () => {
    expect(can(ctx([], [{ permission: 'persons.*', effect: 'ALLOW' }]), 'persons.edit')).toBe(true);
    expect(can(ctx([], [{ permission: 'persons.*', effect: 'ALLOW' }]), 'vehicles.edit')).toBe(false);
    expect(can(ctx([], [{ permission: '*', effect: 'ALLOW' }, { permission: 'audit.*', effect: 'DENY' }]), 'audit.view')).toBe(false);
    expect(can(ctx([], [{ permission: '*', effect: 'ALLOW' }]), 'audit.view')).toBe(true);
  });
  it('wildcard prefix does not match sibling modules', () => {
    expect(can(ctx([], [{ permission: 'person.*', effect: 'ALLOW' }]), 'persons.view')).toBe(false);
  });
  it('catalog contains no duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

describe('status transitions', () => {
  it('allows forward dispatch flow', () => {
    expect(canTransition(DISPATCH_TRANSITIONS, 'NEW', 'ASSIGNED')).toBe(true);
    expect(canTransition(DISPATCH_TRANSITIONS, 'EN_ROUTE', 'ON_SCENE')).toBe(true);
  });
  it('rejects leaving terminal states', () => {
    expect(() => assertTransition(DISPATCH_TRANSITIONS, 'CLOSED', 'NEW')).toThrow(InvalidTransitionError);
    expect(() => assertTransition(TICKET_TRANSITIONS, 'VOID', 'ISSUED')).toThrow(InvalidTransitionError);
  });
  it('report cannot skip review', () => {
    expect(canTransition(REPORT_TRANSITIONS, 'DRAFT', 'APPROVED')).toBe(false);
  });
});

describe('roblox id', () => {
  it('validates', () => {
    expect(isValidRobloxUserId('123456789')).toBe(true);
    expect(isValidRobloxUserId('0')).toBe(false);
    expect(isValidRobloxUserId('abc')).toBe(false);
    expect(isValidRobloxUserId('')).toBe(false);
  });
});
