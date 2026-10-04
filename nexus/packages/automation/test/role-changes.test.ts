import { describe, expect, it, vi } from 'vitest';

const audit = vi.fn(async (_i: Record<string, unknown>) => ({}));
class FakeDiscordApiError extends Error {
  constructor(public status: number) {
    super(`status ${status}`);
  }
}
vi.mock('@nexus/database', () => ({ auditRepository: { create: audit } }));
vi.mock('@nexus/discord', () => ({
  DiscordApiError: FakeDiscordApiError,
  addGuildMemberRole: vi.fn(),
  removeGuildMemberRole: vi.fn(),
  getGuildMember: vi.fn(),
}));
const { applyRoleChanges, describeRoleError } = await import('../src/role-changes.js');

/** In-Memory-Discord: Rollen eines Mitglieds, optional mit Ablehnungen je Rolle. */
function driver(start: string[], reject: Record<string, number> = {}) {
  let roles = [...start];
  return {
    getRoleIds: vi.fn(async () => [...roles]),
    add: vi.fn(async (_u: string, roleId: string) => {
      if (reject[roleId]) throw new FakeDiscordApiError(reject[roleId]!);
      roles.push(roleId);
    }),
    remove: vi.fn(async (_u: string, roleId: string) => {
      if (reject[roleId]) throw new FakeDiscordApiError(reject[roleId]!);
      roles = roles.filter((r) => r !== roleId);
    }),
  };
}
const req = (extra: Record<string, unknown> = {}) => ({
  guildId: 'G',
  userId: 'u1',
  trigger: 'Beförderung',
  automation: 'promotion-flow',
  roleNames: { old: '@Polizeikommissar', new: '@Polizeioberkommissar' },
  ...extra,
});

describe('applyRoleChanges', () => {
  it('Beförderung: entzieht die alte, vergibt die neue Rolle und protokolliert vorher/nachher', async () => {
    const d = driver(['old', 'keep']);
    const r = await applyRoleChanges(
      req({
        remove: ['old'],
        add: ['new'],
        resourceType: 'Promotion',
        resourceId: 'p1',
        permission: 'promotions.approve',
      }),
      d,
    );
    expect(r.status).toBe('success');
    expect(r.rolesBefore).toEqual(['old', 'keep']);
    expect(r.rolesAfter.sort()).toEqual(['keep', 'new']);
    const entry = audit.mock.calls.at(-1)![0];
    expect(entry).toMatchObject({
      action: 'role.change',
      result: 'success',
      automation: 'promotion-flow',
      permission: 'promotions.approve',
      resourceType: 'Promotion',
      resourceId: 'p1',
      actorType: 'AUTOMATION',
      before: { roles: ['old', 'keep'] },
      after: { roles: expect.arrayContaining(['new', 'keep']) },
    });
    expect((entry as any).metadata).toMatchObject({ trigger: 'Beförderung', userId: 'u1' });
    expect((entry as any).metadata.changes).toEqual([
      expect.objectContaining({ roleName: '@Polizeikommissar', action: 'remove', ok: true }),
      expect.objectContaining({ roleName: '@Polizeioberkommissar', action: 'add', ok: true }),
    ]);
  });

  it('meldet NIE Erfolg, wenn Discord ablehnt: Rollenposition → failed mit verständlichem Grund', async () => {
    const d = driver([], { new: 403 });
    const r = await applyRoleChanges(req({ add: ['new'] }), d);
    expect(r.status).toBe('failed');
    expect(r.message).toContain('fehlgeschlagen');
    expect(r.message).toContain('Rollenposition');
    expect(r.rolesAfter).toEqual([]); // Nachher-Stand kommt von Discord, nicht aus der Absicht
    expect(audit.mock.calls.at(-1)![0]).toMatchObject({
      result: 'failed',
      reason: expect.stringContaining('Rollenposition'),
    });
  });

  it('teilweise fehlgeschlagen: eine Rolle klappt, die andere nicht', async () => {
    const d = driver(['old'], { new: 403 });
    const r = await applyRoleChanges(req({ remove: ['old'], add: ['new'] }), d);
    expect(r.status).toBe('partial');
    expect(r.message).toContain('teilweise');
    expect(r.changes.map((c) => c.ok)).toEqual([true, false]);
    expect(audit.mock.calls.at(-1)![0]).toMatchObject({ result: 'partial' });
  });

  it('Zielzustand schon erreicht: keine Discord-Aufrufe, Erfolg', async () => {
    const d = driver(['new']);
    const r = await applyRoleChanges(req({ add: ['new'], remove: ['old'] }), d);
    expect(r.status).toBe('success');
    expect(d.add).not.toHaveBeenCalled();
    expect(d.remove).not.toHaveBeenCalled();
  });

  it('menschlicher Auslöser wird als Handelnder protokolliert', async () => {
    await applyRoleChanges(
      req({ add: ['new'], actorId: 'staff1', automation: undefined }),
      driver([]),
    );
    expect(audit.mock.calls.at(-1)![0]).toMatchObject({ actorType: 'USER', actorId: 'staff1' });
  });

  it('übersetzt Fehlerarten verständlich ohne technische Details', () => {
    expect(describeRoleError(new FakeDiscordApiError(403))).toContain('Bot-Rolle');
    expect(describeRoleError(new FakeDiscordApiError(404))).toContain('nicht gefunden');
    expect(describeRoleError(new FakeDiscordApiError(429))).toContain('Rate-Limit');
    expect(describeRoleError(new Error('boom'))).toContain('unerwartet');
  });
});
