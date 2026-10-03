import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertUser = vi.fn(async () => ({}));
vi.mock('@nexus/database', () => ({ userRepository: { upsert: upsertUser } }));

const { computeMemberAccess } = await import('../src/modules/auth/member-access.js');
const { generateState, verifyState, OAUTH_STATE_COOKIE } =
  await import('../src/modules/auth/oauth-state.js');
const { AuthController } = await import('../src/modules/auth/auth.controller.js');

describe('OAuth-State', () => {
  it('erzeugt eindeutige Werte und akzeptiert nur exakte Übereinstimmung', () => {
    const a = generateState();
    expect(a).toHaveLength(64);
    expect(generateState()).not.toBe(a);
    expect(verifyState(a, a)).toBe(true);
    expect(verifyState(a, a.replace(/.$/, a.endsWith('0') ? '1' : '0'))).toBe(false);
    expect(verifyState(a, undefined)).toBe(false);
    expect(verifyState(undefined, a)).toBe(false);
    expect(verifyState('', '')).toBe(false);
    expect(verifyState(a, a.slice(1))).toBe(false);
  });
});

describe('Discord-Verwaltungsrechte', () => {
  const roles = [
    { id: 'G', permissions: String(1n << 10n) },
    { id: 'admin', permissions: String(1n << 3n) },
    { id: 'mg', permissions: String(1n << 5n) },
    { id: 'plain', permissions: '0' },
  ];
  const base = { guildId: 'G', ownerId: 'owner', roles };
  it('Besitzer, Administrator und „Server verwalten“ dürfen verwalten', () => {
    expect(
      computeMemberAccess({ ...base, userId: 'owner', memberRoleIds: [] }).canManageGuild,
    ).toBe(true);
    expect(computeMemberAccess({ ...base, userId: 'u', memberRoleIds: ['admin'] })).toMatchObject({
      isAdmin: true,
      canManageGuild: true,
    });
    expect(computeMemberAccess({ ...base, userId: 'u', memberRoleIds: ['mg'] })).toMatchObject({
      isAdmin: false,
      canManageGuild: true,
    });
  });
  it('normale Mitglieder dürfen nicht; leere Besitzer-ID erzeugt keinen Besitzer', () => {
    expect(
      computeMemberAccess({ ...base, userId: 'u', memberRoleIds: ['plain'] }).canManageGuild,
    ).toBe(false);
    expect(
      computeMemberAccess({ ...base, ownerId: '', userId: '', memberRoleIds: [] }).isOwner,
    ).toBe(false);
  });
});

describe('AuthController', () => {
  const cfg = { DASHBOARD_URL: 'http://dash', NODE_ENV: 'development' } as Record<string, string>;
  const config = { get: (k: string) => cfg[k] };
  const user = { id: '1', username: 'a', globalName: null, avatar: null };
  const authService = {
    getAuthorizationUrl: vi.fn((s: string) => `https://discord/authorize?state=${s}`),
    handleCallback: vi.fn(async () => ({ token: 'JWT-SECRET', user })),
  };
  const controller = new AuthController(authService as never, config as never, {} as never);
  const mkRes = () => ({
    cookie: vi.fn(),
    clearCookie: vi.fn(),
    redirect: vi.fn(),
  });
  beforeEach(() => vi.clearAllMocks());

  it('login setzt state-Cookie und übergibt denselben state an Discord', () => {
    const res = mkRes();
    controller.login(res as never);
    const [name, value, opts] = res.cookie.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(name).toBe(OAUTH_STATE_COOKIE);
    expect(opts).toMatchObject({ httpOnly: true });
    expect(res.redirect).toHaveBeenCalledWith(`https://discord/authorize?state=${value}`);
  });
  it('Callback mit falschem oder fehlendem state wird abgelehnt – ohne Code-Austausch', async () => {
    for (const [cookie, state] of [
      ['abc', 'xyz'],
      [undefined, 'abc'],
      ['abc', undefined],
    ] as const) {
      const res = mkRes();
      await controller.callback(
        { cookies: { [OAUTH_STATE_COOKIE]: cookie } } as never,
        res as never,
        'code',
        state,
      );
      expect(res.redirect).toHaveBeenCalledWith('http://dash/login?error=state');
    }
    expect(authService.handleCallback).not.toHaveBeenCalled();
  });
  it('Abbruch durch den User führt zur Login-Seite', async () => {
    const res = mkRes();
    await controller.callback(
      { cookies: { [OAUTH_STATE_COOKIE]: 's' } } as never,
      res as never,
      undefined,
      's',
      'access_denied',
    );
    expect(res.redirect).toHaveBeenCalledWith('http://dash/login?error=denied');
  });
  it('Fehler beim Code-Austausch führen zur Login-Seite statt zu einem 500', async () => {
    authService.handleCallback.mockRejectedValueOnce(new Error('boom'));
    const res = mkRes();
    await controller.callback(
      { cookies: { [OAUTH_STATE_COOKIE]: 's' } } as never,
      res as never,
      'c',
      's',
    );
    expect(res.redirect).toHaveBeenCalledWith('http://dash/login?error=failed');
    expect(res.cookie).not.toHaveBeenCalled();
  });
  it('erfolgreicher Login: Session nur als httpOnly-Cookie, Token nie in der URL, User gespeichert', async () => {
    const res = mkRes();
    await controller.callback(
      { cookies: { [OAUTH_STATE_COOKIE]: 's' } } as never,
      res as never,
      'c',
      's',
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'nexus_session',
      'JWT-SECRET',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(res.redirect).toHaveBeenCalledWith('http://dash/auth/callback');
    expect(JSON.stringify(res.redirect.mock.calls)).not.toContain('JWT-SECRET');
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
  });
  it('Logout löscht das Session-Cookie', () => {
    const res = mkRes();
    expect(controller.logout(res as never)).toEqual({ ok: true });
    expect(res.clearCookie).toHaveBeenCalledWith('nexus_session', expect.anything());
  });
  it('/auth/me liefert den Discord-Access-Token nie aus', () => {
    expect(controller.me({ id: '1', at: 'ACCESS' } as never)).toEqual({ id: '1' });
  });
});
