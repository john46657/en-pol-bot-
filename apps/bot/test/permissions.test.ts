import type { GuildMember } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const forRoles = vi.fn(async (_g: string, roles: readonly string[]) => {
  return new Set(
    roles.includes('rev')
      ? ['applications.submissions.accept']
      : roles.includes('mgr')
        ? ['applications.manage']
        : [],
  );
});
vi.mock('@nexus/database', () => ({}));
vi.mock('@nexus/permissions', async () => {
  const engine = await vi.importActual<
    typeof import('../../../packages/permissions/src/engine.js')
  >('../../../packages/permissions/src/engine.js');
  const grants = await vi.importActual<
    typeof import('../../../packages/permissions/src/grants.js')
  >('../../../packages/permissions/src/grants.js');
  return {
    ...engine,
    ...grants,
    permissions: {
      can: async (ctx: { guildId: string; roleIds: string[]; bypass: boolean }, k: never) =>
        ctx.bypass || engine.hasPermission((await forRoles(ctx.guildId, ctx.roleIds)) as never, k),
      canAny: async (ctx: { guildId: string; roleIds: string[]; bypass: boolean }, ks: never[]) =>
        ctx.bypass ||
        engine.hasAnyPermission((await forRoles(ctx.guildId, ctx.roleIds)) as never, ks),
    },
  };
});
const { memberCanReview, memberCanManage, memberCanViewSubmissions, requireMemberPermission } =
  await import('../src/discord/permissions.js');

const member = (roles: string[], opts: { admin?: boolean; owner?: boolean } = {}) =>
  ({
    id: opts.owner ? 'owner' : 'u',
    guild: { id: 'G', ownerId: 'owner' },
    roles: { cache: new Map(roles.map((r) => [r, {}])) },
    permissions: { has: () => !!opts.admin },
  }) as unknown as GuildMember;

beforeEach(() => {
  forRoles.mockClear();
});

describe('Bot-Berechtigungen (zentrale Engine)', () => {
  it('Prüfer-Rolle darf bewerten, aber nicht verwalten', async () => {
    expect(await memberCanReview(member(['rev']))).toBe(true);
    expect(await memberCanManage(member(['rev']))).toBe(false);
  });
  it('applications.manage schließt Review und Ansicht ein', async () => {
    expect(await memberCanReview(member(['mgr']))).toBe(true);
    expect(await memberCanViewSubmissions(member(['mgr']))).toBe(true);
  });
  it('Mitglied ohne Rolle darf nichts', async () => {
    expect(await memberCanReview(member([]))).toBe(false);
  });
  it('Administrator und Server-Besitzer dürfen immer – ohne Datenbankabfrage', async () => {
    expect(await memberCanReview(member([], { admin: true }))).toBe(true);
    expect(await memberCanManage(member([], { owner: true }))).toBe(true);
    expect(forRoles).not.toHaveBeenCalled();
  });
  it('requireMemberPermission antwortet bei Ablehnung ephemeral und liefert null', async () => {
    const reply = vi.fn(async () => undefined);
    const interaction = {
      guild: { id: 'G', members: { fetch: async () => member([]) } },
      user: { id: 'u' },
      isRepliable: () => true,
      replied: false,
      deferred: false,
      reply,
    };
    expect(
      await requireMemberPermission(interaction as never, ['applications.submissions.view']),
    ).toBeNull();
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/Du benötigst: Einreichungen ansehen/),
      }),
    );
  });
  it('requireMemberPermission liefert das Mitglied bei Erlaubnis', async () => {
    const m = member(['mgr']);
    const interaction = {
      guild: { id: 'G', members: { fetch: async () => m } },
      user: { id: 'u' },
      isRepliable: () => true,
      reply: vi.fn(),
    };
    expect(await requireMemberPermission(interaction as never, ['applications.notes.create'])).toBe(
      m,
    );
    expect(interaction.reply).not.toHaveBeenCalled();
  });
});
