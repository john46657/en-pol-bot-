import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const entries = (keys: string[]) =>
  keys.map((key) => ({ key, effect: 'ALLOW' as const, scope: 'SERVER' as const, scopeRef: '' }));

const setPermissionsForRole = vi.fn(async (_g: string, _r: string, e: unknown[], _s?: unknown) => ({
  before: ['applications.view'],
  after: e.map((x) => (x as { key: string; effect: string }).key),
}));
const setProfilesForRole = vi.fn(async (_g: string, _r: string, ids: string[], _s?: unknown) => ({
  before: [] as string[],
  after: ids,
}));
const getGrants = vi.fn(
  async () =>
    new Map([
      [
        '111111',
        { keys: ['applications.view'], deny: [], entries: [], name: 'Polizei', deleted: false },
      ],
      [
        '999999',
        {
          keys: ['applications.manage'],
          deny: ['config.edit'],
          entries: [],
          name: 'Weg',
          deleted: true,
        },
      ],
    ]),
);
const profiles: Record<string, any> = {};
const createProfile = vi.fn(async (_g: string, d: any) => (profiles['p1'] = { id: 'p1', ...d }));
const updateProfile = vi.fn(async (_g: string, id: string, d: any) =>
  profiles[id] ? (profiles[id] = { ...profiles[id], ...d }) : null,
);
const loadGrantIndex = vi.fn(async () => ({
  byRole: new Map([
    [
      'r-lead',
      [
        {
          key: 'promotions.manage',
          effect: 'ALLOW',
          scope: 'SERVER',
          scopeRef: '',
          source: { kind: 'role', roleName: 'Leitung' },
        },
        {
          key: 'promotions.approve',
          effect: 'DENY',
          scope: 'SERVER',
          scopeRef: '',
          source: { kind: 'profile', roleName: 'Leitung', profileName: 'Stellv.' },
        },
      ],
    ],
  ]),
  byUser: new Map(),
}));
const audit = vi.fn(async (_i: unknown) => ({}));
vi.mock('@nexus/database', () => ({
  guildRepository: { get: vi.fn(async () => ({ id: 'G' })) },
  permissionRepository: {
    setPermissionsForRole,
    setProfilesForRole,
    getGrants,
    listProfiles: vi.fn(async () => [{ id: 'p1', name: 'Profil 1' }]),
    getProfilesByRole: vi.fn(async () => new Map([['111111', ['p1']]])),
    getProfile: vi.fn(async (_g: string, id: string) => profiles[id] ?? null),
    createProfile,
    updateProfile,
    deleteProfile: vi.fn(async () => true),
    loadGrantIndex,
    loadGrants: vi.fn(async () => [
      {
        key: 'promotions.manage',
        effect: 'ALLOW',
        scope: 'SERVER',
        scopeRef: '',
        source: { kind: 'role', roleName: 'Leitung' },
      },
      {
        key: 'promotions.approve',
        effect: 'DENY',
        scope: 'SERVER',
        scopeRef: '',
        source: { kind: 'profile', roleName: 'Leitung', profileName: 'Stellv.' },
      },
    ]),
    listUserOverrides: vi.fn(async () => []),
    addUserOverride: vi.fn(async (_g: string, d: any) => ({ id: 'o1', ...d })),
    removeUserOverride: vi.fn(async () => true),
  },
  auditRepository: { create: audit, list: vi.fn(async () => []) },
}));
vi.mock('@nexus/discord', () => ({
  getGuildMember: vi.fn(async () => ({
    userId: '555555',
    username: 'max',
    globalName: 'Max',
    roles: ['r-lead'],
  })),
  listGuildMembers: vi.fn(async () => [
    { userId: '555555', username: 'max', globalName: 'Max', roles: ['r-lead'] },
    { userId: '666666', username: 'neu', globalName: null, roles: [] },
  ]),
  getGuild: vi.fn(async () => ({ ownerId: '1' })),
  getGuildRoles: vi.fn(async () => [{ id: 'G', permissions: '0' }]),
}));
vi.mock('@nexus/permissions', async () => {
  const real = await vi.importActual<typeof import('../../../packages/permissions/src/grants.js')>(
    '../../../packages/permissions/src/grants.js',
  );
  const eng = await vi.importActual<typeof import('../../../packages/permissions/src/engine.js')>(
    '../../../packages/permissions/src/engine.js',
  );
  return {
    ...real,
    ...eng,
    permissions: {
      canAll: vi.fn(
        async (ctx: { bypass: boolean; roleIds: string[] }, req: string[]) =>
          ctx.bypass || (ctx.roleIds.includes('ok') && req.length > 0),
      ),
      hasAnyPermission: vi.fn(
        async (ctx: { roleIds: string[] }) =>
          ctx.roleIds.includes('some') || ctx.roleIds.includes('ok'),
      ),
    },
  };
});

const { PermissionsAdminService } = await import('../src/modules/guild/permissions.service.js');
const { AccessService } = await import('../src/modules/guild/access.service.js');
const { PermissionGuard } = await import('../src/common/guards/permission.guard.js');
const { GUILD_ADMIN_KEY } = await import('../src/common/decorators/guild-admin.decorator.js');

const role = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  name: `R${id}`,
  color: 0,
  position: 3,
  manageable: true,
  ...o,
});
const discord = {
  listRoles: vi.fn(async () => [
    role('111111', { name: 'Polizei' }),
    role('222222', { name: 'Leitung', position: 4 }),
    role('r-lead', { name: 'Leitung' }),
    role('G', { name: '@everyone', blockedReason: 'everyone' }),
  ]),
};
const admin = new PermissionsAdminService(discord as never);
const access = new AccessService(discord as never, { get: () => 'token' } as never);
beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(profiles)) delete profiles[k];
});

describe('PermissionsAdminService – Rollenzuordnung', () => {
  it('liefert Katalog mit Aliasen, Vorlagen, Profile, Rollen mit Erlaubnissen/Sperren/Profilen und Verwaiste', async () => {
    const o = await admin.overview('G');
    expect(o.roles.map((r) => r.id)).toEqual(['111111', '222222', 'r-lead']);
    expect(o.roles[0]).toMatchObject({
      allow: ['applications.view'],
      deny: [],
      profileIds: ['p1'],
    });
    expect(o.orphaned).toEqual([
      {
        roleId: '999999',
        name: 'Weg',
        permissions: ['applications.manage'],
        deny: ['config.edit'],
      },
    ]);
    expect(o.templates.map((t) => t.name)).toContain('Stellv. Polizeileitung');
    const alias = o.catalog
      .flatMap((m) => m.permissions)
      .find((p) => p.key === 'applications.submissions.accept');
    expect(alias?.alias).toBe('APPLICATION_ACCEPT');
    expect(o.catalog.map((m) => m.module)).not.toContain('dispatch');
  });

  it('speichert Erlaubnisse, Sperren und Profile; Audit mit alt/neu und Berechtigung', async () => {
    await admin.setForRole('G', 'u1', '222222', {
      allow: ['promotions.manage'],
      deny: ['promotions.approve'],
      profileIds: ['p1'],
    });
    const sent = setPermissionsForRole.mock.calls[0]![2] as { key: string; effect: string }[];
    expect(sent).toEqual([
      expect.objectContaining({ key: 'promotions.manage', effect: 'ALLOW' }),
      expect.objectContaining({ key: 'promotions.approve', effect: 'DENY' }),
    ]);
    expect(setProfilesForRole).toHaveBeenCalledWith('G', '222222', ['p1'], {
      name: 'Leitung',
      position: 4,
      color: 0,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permissions.role.set',
        permission: 'permissions.edit',
        result: 'success',
        actorId: 'u1',
      }),
    );
  });

  it('weist Widersprüche, unbekannte Schlüssel, Rollen und Profile ab', async () => {
    await expect(
      admin.setForRole('G', 'u', '222222', { allow: ['shifts.start'], deny: ['shifts.start'] }),
    ).rejects.toThrow(/gleichzeitig/);
    await expect(
      admin.setForRole('G', 'u', '222222', { allow: ['bogus.key'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      admin.setForRole('G', 'u', '777777', { allow: ['shifts.start'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      admin.setForRole('G', 'u', 'G', { allow: ['shifts.start'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    setProfilesForRole.mockRejectedValueOnce(new Error('Unbekanntes Profil.'));
    await expect(admin.setForRole('G', 'u', '222222', { profileIds: ['fremd'] })).rejects.toThrow(
      /Profil/,
    );
  });

  it('erlaubt das Entfernen einer verwaisten Zuordnung und das alleinige Ändern der Sperren', async () => {
    await admin.setForRole('G', 'u', '999999', { allow: [], deny: [] });
    expect(setPermissionsForRole).toHaveBeenCalledWith('G', '999999', [], undefined);
  });

  it('Rückwärtskompatibel: `permissions` entspricht `allow`', async () => {
    await admin.setForRole('G', 'u', '111111', { permissions: ['training.view'] });
    expect((setPermissionsForRole.mock.calls[0]![2] as { key: string }[])[0]?.key).toBe(
      'training.view',
    );
  });
});

describe('AccessService – Profile und Vorlagen', () => {
  const entry = (key: string, effect = 'ALLOW', scope = 'SERVER', scopeRef = '') => ({
    key,
    effect,
    scope,
    scopeRef,
  });

  it('legt Profile an (Personal-Sachbearbeiter-Beispiel) und auditiert', async () => {
    const p = await access.createProfile('G', 'u1', {
      name: 'Personal-Sachbearbeiter',
      entries: [
        entry('applications.submissions.view'),
        entry('applications.submissions.accept'),
        entry('personnel.edit'),
        entry('promotions.approve', 'DENY'),
        entry('config.edit', 'DENY'),
      ],
    });
    expect(p.name).toBe('Personal-Sachbearbeiter');
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'permissions.profile.create',
        resourceType: 'PermissionProfile',
      }),
    );
  });

  it('validiert Einträge: unbekannter Schlüssel, Widerspruch, Datensatz ohne ID, Referenz bei SERVER, leerer Name', async () => {
    const bad = (e: unknown[], name = 'x') => access.createProfile('G', 'u', { name, entries: e });
    await expect(bad([entry('gibt.es.nicht')])).rejects.toBeInstanceOf(BadRequestException);
    await expect(bad([entry('shifts.start'), entry('shifts.start', 'DENY')])).rejects.toThrow(
      /gleichzeitig/,
    );
    await expect(bad([entry('shifts.start', 'ALLOW', 'RECORD')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bad([entry('shifts.start', 'ALLOW', 'SERVER', 'x')])).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(bad([], '  ')).rejects.toBeInstanceOf(BadRequestException);
    // gleiches Recht erlaubt (SERVER) und gesperrt für ein Team ist kein Widerspruch
    await expect(
      bad([entry('shifts.start'), entry('shifts.start', 'DENY', 'TEAM', 'sek')]),
    ).resolves.toBeTruthy();
  });

  it('Namenskonflikt → 409', async () => {
    createProfile.mockRejectedValueOnce(new Error('Unique constraint failed'));
    await expect(
      access.createProfile('G', 'u', { name: 'Doppelt', entries: [] }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('wendet eine Vorlage an: Stellv. Polizeileitung = Rechte der Polizeileitung + Sperren', async () => {
    await access.createFromTemplate('G', 'u', { templateKey: 'stv-polizeileitung' });
    const sent = createProfile.mock.calls[0]![1] as {
      name: string;
      templateKey: string;
      entries: { key: string; effect: string }[];
    };
    expect(sent).toMatchObject({
      name: 'Stellv. Polizeileitung',
      templateKey: 'stv-polizeileitung',
    });
    expect(sent.entries.filter((e) => e.effect === 'ALLOW').length).toBeGreaterThan(10);
    expect(sent.entries.filter((e) => e.effect === 'DENY').map((e) => e.key)).toEqual(
      expect.arrayContaining(['config.edit', 'permissions.edit']),
    );
    await expect(
      access.createFromTemplate('G', 'u', { templateKey: 'leitstelle' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('Teamleitungs-Vorlage erzeugt TEAM-gebundene Einträge', async () => {
    await access.createFromTemplate('G', 'u', {
      templateKey: 'teamleitung',
      name: 'Streifendienst-Leitung',
    });
    const sent = createProfile.mock.calls[0]![1] as { name: string; entries: { scope: string }[] };
    expect(sent.name).toBe('Streifendienst-Leitung');
    expect(sent.entries.every((e) => e.scope === 'TEAM')).toBe(true);
  });

  it('Profil ändern/löschen: unbekannt → 404', async () => {
    await expect(
      access.updateProfile('G', 'u', 'nix', { name: 'x', entries: [] }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(access.deleteProfile('G', 'u', 'nix')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AccessService – Benutzer-Übersicht und Erklärung', () => {
  it('Übersicht zeigt Rollen und Anzahl effektiver Rechte (Sperre schlägt manage)', async () => {
    const list = await access.listMembers('G', undefined, 50);
    const max = list.find((m) => m.id === '555555')!;
    expect(max.roles).toEqual([{ id: 'r-lead', name: 'Leitung' }]);
    // promotions.manage ⇒ view/create/approve/reject/manage; approve ist gesperrt ⇒ 4
    expect(max.permissionCount).toBe(4);
    expect(list.find((m) => m.id === '666666')?.permissionCount).toBe(0);
  });

  it('Detail erklärt Herkunft: Rolle → Profil → Recht, Sperre und manage-Herkunft', async () => {
    const a = await access.memberAccess('G', '555555');
    expect(a.user.displayName).toBe('Max');
    const approve = a.permissions.find((p) => p.key === 'promotions.approve')!;
    expect(approve.state).toBe('denied');
    expect(approve.entries.find((e) => e.effect === 'DENY')?.source).toMatchObject({
      kind: 'profile',
      profileName: 'Stellv.',
    });
    const view = a.permissions.find((p) => p.key === 'promotions.view')!;
    expect(view.state).toBe('allowed');
    expect(view.entries[0]).toMatchObject({ viaManage: true });
    expect(a.permissions.find((p) => p.key === 'sek.view')?.state).toBe('none');
    expect(a.counts.denied).toBe(1);
    expect(a.pending).toContain('Personalakte');
    expect(a.guildAdmin).toBe(false);
  });

  it('Ausnahmen: hinzufügen/entfernen mit Audit; ungültige Eingaben abgelehnt', async () => {
    await access.addOverride('G', 'adm', '555555', {
      key: 'audit.view',
      effect: 'ALLOW',
      note: 'Vertretung',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'permissions.user.override.add', resourceType: 'User' }),
    );
    await expect(
      access.addOverride('G', 'adm', '555555', { key: 'bogus', effect: 'ALLOW' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      access.addOverride('G', 'adm', 'kein-id', { key: 'audit.view', effect: 'ALLOW' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(access.removeOverride('G', 'adm', '555555', 'unbekannt')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(access.memberAccess('G', 'abc')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PermissionGuard', () => {
  const ctx = (roleIds: string[], userId = 'u') =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId, roleIds }, params: { guildId: 'G' } }),
      }),
    }) as never;
  const reflector = (req: string[] | undefined, adminOnly = false) => ({
    getAllAndOverride: (key: string) => (key === GUILD_ADMIN_KEY ? adminOnly : req),
  });
  const make = (opts: {
    req?: string[];
    adminOnly?: boolean;
    canManageGuild?: boolean;
    member?: { isMember: boolean; roleIds: string[] };
  }) =>
    new PermissionGuard(
      reflector(opts.req, opts.adminOnly) as never,
      {
        getMemberAccess: async () => ({ canManageGuild: !!opts.canManageGuild }),
        getMember: async () => opts.member ?? { isMember: true, roleIds: ['ok'] },
      } as never,
    );
  const message = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return (e as ForbiddenException).message;
    }
    return 'ERLAUBT';
  };

  it('lässt Endpunkte ohne Anforderung offen', async () => {
    expect(await make({}).canActivate(ctx([]))).toBe(true);
  });

  it('erlaubt mit passender Rolle; Server-Verwalter umgehen die Zuordnung', async () => {
    expect(await make({ req: ['shifts.start'] }).canActivate(ctx(['ok']))).toBe(true);
    expect(
      await make({ req: ['shifts.start'], canManageGuild: true }).canActivate(ctx(['x'])),
    ).toBe(true);
  });

  it('Fehlermeldung nennt die Bezeichnung des Rechts – ohne interne Schlüssel', async () => {
    const m = await message(
      make({ req: ['applications.submissions.accept'] }).canActivate(ctx(['some'])),
    );
    expect(m).toContain('Du benötigst: Einreichungen annehmen');
    expect(m).toContain('Administrator');
    expect(m).not.toMatch(/applications\.|APPLICATION_/);
  });

  it('ohne irgendeine Berechtigung: klare Dashboard-Meldung', async () => {
    const m = await message(make({ req: ['shifts.start'] }).canActivate(ctx(['keine'])));
    expect(m).toContain('keinen Zugriff auf das Dashboard');
  });

  it('nicht mehr auf dem Server: Zugriff verweigert (auch mit bekanntem Token)', async () => {
    const guard = make({ req: ['shifts.start'], member: { isMember: false, roleIds: [] } });
    expect(await message(guard.canActivate(ctx([])))).toContain('nicht (mehr) Mitglied');
  });

  it('nur-Verwalter-Endpunkte: NEXUS-Rolle genügt nicht', async () => {
    const m = await message(make({ adminOnly: true }).canActivate(ctx(['ok'])));
    expect(m).toContain('Server-Verwalter-Rechte');
    expect(await make({ adminOnly: true, canManageGuild: true }).canActivate(ctx([]))).toBe(true);
  });
});
