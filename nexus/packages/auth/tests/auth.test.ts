import { describe, expect, it } from 'vitest';
import { getAuthorizationUrl, signSession, verifySession } from '../src/index.js';

describe('getAuthorizationUrl', () => {
  it('baut eine Discord-Authorize-URL mit Pflicht-Parametern', () => {
    const url = getAuthorizationUrl({
      clientId: '123',
      redirectUri: 'http://localhost:3000/api/v1/auth/discord/callback',
    });

    expect(url).toContain('https://discord.com/api/oauth2/authorize');
    const params = new URL(url).searchParams;
    expect(params.get('client_id')).toBe('123');
    expect(params.get('response_type')).toBe('code');
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/api/v1/auth/discord/callback');
    expect(params.get('scope')).toBe('identify guilds');
  });

  it('nutzt übergebene Scopes und State', () => {
    const url = getAuthorizationUrl({
      clientId: '1',
      redirectUri: 'http://localhost/cb',
      scopes: ['identify'],
      state: 'xyz',
    });
    expect(new URL(url).searchParams.get('scope')).toBe('identify');
    expect(new URL(url).searchParams.get('state')).toBe('xyz');
  });
});

describe('Session-JWT', () => {
  const opts = { secret: 'test-secret-mindestens-32-zeichen-lang!!', issuer: 'nexus' };

  it('signiert und verifiziert roundtrip', async () => {
    const token = await signSession({ sub: '678', username: 'tester' }, opts);
    const payload = await verifySession(token, opts);
    expect(payload.sub).toBe('678');
    expect(payload.username).toBe('tester');
  });

  it('akzeptiert keinen Token mit anderem Secret', async () => {
    const token = await signSession({ sub: '1', username: 'a' }, opts);
    await expect(verifySession(token, { ...opts, secret: 'anderes-secret' })).rejects.toThrow();
  });

  it('akzeptiert keinen Token mit anderem Issuer', async () => {
    const token = await signSession({ sub: '1', username: 'a' }, opts);
    await expect(verifySession(token, { ...opts, issuer: 'boesewicht' })).rejects.toThrow();
  });

  it('akzeptiert keinen Müll als Token', async () => {
    await expect(verifySession('kein-jwt', opts)).rejects.toThrow();
  });

  it('läuft ab', async () => {
    const token = await signSession({ sub: '1', username: 'a' }, { ...opts, ttlSeconds: -10 });
    await expect(verifySession(token, opts)).rejects.toThrow();
  });
});
