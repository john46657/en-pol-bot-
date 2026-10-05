import 'reflect-metadata';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getGuildMember = vi.fn();
const getUserProfile = vi.fn();
const listGuildMembers = vi.fn(async (..._a: unknown[]) => [] as unknown[]);
const findMany = vi.fn(async (..._a: unknown[]) => [{ userId: '900000000000000002', rpName: 'Max Mustermann' }]);
vi.mock('@nexus/discord', () => ({ getGuildMember, getUserProfile, listGuildMembers }));
vi.mock('@nexus/database', () => ({ assertGuildId: (g: string) => g, prisma: { personnelRecord: { findMany } } }));

const { NamesService } = await import('../src/modules/guild/names.service.js');
const svc = () => new NamesService({ get: () => 'token' } as never);

beforeEach(() => {
  getGuildMember.mockReset();
  getUserProfile.mockReset();
});

describe('Namen statt Discord-IDs', () => {
  it('Spitzname vor Anzeigename vor Benutzername; RP-Name aus der Akte; Ausgetretene über das Konto', async () => {
    getGuildMember.mockImplementation(async (_t: string, _g: string, id: string) =>
      id === '900000000000000001' ? { userId: id, username: 'lea', globalName: 'Lea', nick: 'HKin Lea', avatar: 'abc', roles: [] } : id === '900000000000000002' ? { userId: id, username: 'max', globalName: null, nick: null, avatar: null, roles: [] } : null,
    );
    getUserProfile.mockImplementation(async (_t: string, id: string) => (id === '900000000000000003' ? { id, username: 'weg', globalName: 'Ehemals', avatar: null } : null));
    const r = await svc().resolve('G', ['900000000000000001', '900000000000000002', '900000000000000003', '900000000000000004', 'kaputt', '900000000000000001']);
    expect(Object.keys(r)).toEqual(['900000000000000001', '900000000000000002', '900000000000000003', '900000000000000004']);
    expect(r['900000000000000001']).toEqual({ name: 'HKin Lea', username: 'lea', rpName: null, avatarUrl: 'https://cdn.discordapp.com/avatars/900000000000000001/abc.png?size=64', inGuild: true });
    expect(r['900000000000000002']).toMatchObject({ name: 'max', rpName: 'Max Mustermann', inGuild: true });
    expect(r['900000000000000003']).toMatchObject({ name: 'Ehemals', username: 'weg', inGuild: false });
    expect(r['900000000000000004']).toMatchObject({ name: null, inGuild: false });
  });

  it('zwischengespeichert; Discord-Fehler ergeben „unbekannt“ ohne Abbruch und werden nicht gespeichert', async () => {
    const s = svc();
    getGuildMember.mockResolvedValue({ userId: 'x', username: 'a', globalName: null, nick: null, avatar: null, roles: [] });
    await s.resolve('G', ['900000000000000010']);
    await s.resolve('G', ['900000000000000010']);
    expect(getGuildMember).toHaveBeenCalledTimes(1);
    getGuildMember.mockRejectedValueOnce(new Error('429'));
    expect((await s.resolve('G', ['900000000000000011']))['900000000000000011']).toMatchObject({ name: null });
    getGuildMember.mockResolvedValueOnce({ userId: 'x', username: 'spaeter', globalName: null, nick: null, avatar: null, roles: [] });
    expect((await s.resolve('G', ['900000000000000011']))['900000000000000011']).toMatchObject({ name: 'spaeter' });
  });

  it('höchstens 100 IDs je Anfrage', async () => {
    getGuildMember.mockResolvedValue(null);
    getUserProfile.mockResolvedValue(null);
    const ids = Array.from({ length: 150 }, (_, i) => `9000000000001${String(i).padStart(5, '0')}`);
    expect(Object.keys(await svc().resolve('G', ids))).toHaveLength(100);
  });
});

describe('Personensuche', () => {
  it('Discord-Treffer und RP-Namen zusammengeführt; ID direkt; zu kurz = leer', async () => {
    listGuildMembers.mockResolvedValueOnce([{ userId: '900000000000000020', username: 'zebra', globalName: 'Zebra', nick: null, roles: [] }]);
    findMany.mockImplementation(async (a: any) => (a?.where?.rpName ? [{ userId: '900000000000000021', rpName: 'Zebrowski' }] : []));
    getGuildMember.mockImplementation(async (_t: string, _g: string, id: string) => ({ userId: id, username: 'zeb21', globalName: null, nick: 'Zeb', avatar: null, roles: [] }));
    const r = await svc().search('G', 'zeb');
    expect(r).toEqual([
      { id: '900000000000000020', name: 'Zebra', username: 'zebra', rpName: null },
      { id: '900000000000000021', name: 'Zeb', username: 'zeb21', rpName: 'Zebrowski' },
    ]);
    expect(await svc().search('G', 'z')).toEqual([]);
    const byId = await svc().search('G', '900000000000000021');
    expect(byId).toEqual([expect.objectContaining({ id: '900000000000000021', name: 'Zeb' })]);
  });
});
