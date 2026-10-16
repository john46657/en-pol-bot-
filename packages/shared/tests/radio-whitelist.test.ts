import { describe, expect, it } from 'vitest';
import { DEFAULT_RADIO_ROLE_RULES, csvCell, effectiveRadioStatus, isRadioAuthorized, parseCsv, radioRoleSyncAction, type RoleSyncGrant } from '../src/radio-whitelist';

const now = new Date('2026-10-16T12:00:00Z');
const past = new Date('2026-10-01T00:00:00Z'), future = new Date('2026-12-01T00:00:00Z');

describe('effektiver Status', () => {
  it('abgelaufen, gesperrt, Sperre abgelaufen', () => {
    expect(effectiveRadioStatus({ status: 'ACTIVE', expiresAt: null }, now)).toBe('ACTIVE');
    expect(effectiveRadioStatus({ status: 'ACTIVE', expiresAt: past }, now)).toBe('EXPIRED');
    expect(effectiveRadioStatus({ status: 'ACTIVE', expiresAt: future }, now)).toBe('ACTIVE');
    expect(effectiveRadioStatus({ status: 'SUSPENDED', expiresAt: null, suspendedUntil: null }, now)).toBe('SUSPENDED');
    expect(effectiveRadioStatus({ status: 'SUSPENDED', expiresAt: null, suspendedUntil: past, statusBeforeSuspend: 'ACTIVE' }, now)).toBe('ACTIVE');
    expect(effectiveRadioStatus({ status: 'SUSPENDED', expiresAt: past, suspendedUntil: past, statusBeforeSuspend: 'ACTIVE' }, now)).toBe('EXPIRED');
    expect(isRadioAuthorized({ status: 'PENDING', expiresAt: null }, now)).toBe(false);
    expect(isRadioAuthorized(null, now)).toBe(false);
  });
});

describe('Rollenabgleich-Regeln', () => {
  const rules = { ...DEFAULT_RADIO_ROLE_RULES, enabled: true, grantRoleIds: ['R1'] };
  const g = (o: Partial<RoleSyncGrant>): RoleSyncGrant => ({ status: 'ACTIVE', source: 'ROLE', roleRevoked: false, archived: false, expiresAt: null, ...o });
  it('ausgeschaltet → nichts', () => expect(radioRoleSyncAction({ ...rules, enabled: false }, ['R1'], null, now).kind).toBe('none'));
  it('Rolle gewonnen → anlegen (aktiv/ausstehend/nichts)', () => {
    expect(radioRoleSyncAction(rules, ['R1'], null, now)).toEqual({ kind: 'create', status: 'ACTIVE' });
    expect(radioRoleSyncAction({ ...rules, onRoleGain: 'PENDING' }, ['R1'], null, now)).toEqual({ kind: 'create', status: 'PENDING' });
    expect(radioRoleSyncAction({ ...rules, onRoleGain: 'NONE' }, ['R1'], null, now).kind).toBe('none');
    expect(radioRoleSyncAction(rules, ['X'], null, now).kind).toBe('none');
  });
  it('Rolle verloren → je nach Herkunft und Regel', () => {
    expect(radioRoleSyncAction(rules, [], g({}), now).kind).toBe('revoke');
    expect(radioRoleSyncAction({ ...rules, onRoleLoss: 'DISABLE' }, [], g({}), now).kind).toBe('disable');
    expect(radioRoleSyncAction(rules, [], g({ source: 'MANUAL' }), now).kind).toBe('none');
    expect(radioRoleSyncAction({ ...rules, manualOnRoleLoss: 'REVOKE' }, null, g({ source: 'REQUEST' }), now).kind).toBe('revoke');
  });
  it('erforderliche Rollen getrennt von berechtigenden', () => {
    const r = { ...rules, requiredRoleIds: ['MEMBER'] };
    expect(radioRoleSyncAction(r, ['MEMBER'], g({}), now).kind).toBe('none');
    expect(radioRoleSyncAction(r, ['R1'], g({}), now).kind).toBe('revoke');
  });
  it('Sperren und manuelle Entzüge bleiben; nur vom Abgleich entzogene kommen zurück', () => {
    expect(radioRoleSyncAction(rules, [], g({ status: 'SUSPENDED' }), now).kind).toBe('none');
    expect(radioRoleSyncAction(rules, ['R1'], g({ status: 'REVOKED', archived: true }), now).kind).toBe('none');
    expect(radioRoleSyncAction(rules, ['R1'], g({ status: 'REVOKED', archived: true, roleRevoked: true }), now)).toEqual({ kind: 'reactivate', status: 'ACTIVE' });
    expect(radioRoleSyncAction(rules, ['R1'], g({ status: 'DISABLED', roleRevoked: false }), now).kind).toBe('none');
  });
});

describe('CSV', () => {
  it('Zellen: Quoting und Formel-Schutz', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell(null)).toBe('');
    expect(csvCell('sag "hi"')).toBe('"sag ""hi"""');
  });
  it('liest Komma/Semikolon, Anführungszeichen, Zeilennummern, BOM', () => {
    const r = parseCsv('﻿discord_id,discord_name\r\n123,"Muster, Max"\r\n\r\n456,"Zeile\nzwei"\n789,\'=x');
    expect(r.header).toEqual(['discord_id', 'discord_name']);
    expect(r.rows.map((x) => [x.line, x.cells.discord_id, x.cells.discord_name])).toEqual([[2, '123', 'Muster, Max'], [4, '456', 'Zeile\nzwei'], [6, '789', '=x']]);
    expect(parseCsv('Discord_ID;Rank\n1;PM').rows[0]!.cells).toEqual({ discord_id: '1', rank: 'PM' });
  });
});
