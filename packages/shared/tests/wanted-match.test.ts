import { describe, expect, it } from 'vitest';
import { diffPresence, JOIN_LOG_TOLERANCE_MS, matchWantedPlayer, playerKey, type WantedMatchSubject } from '../src';

const subjects: WantedMatchSubject[] = [
  { wantedId: 'w1', personId: 'p1', robloxUserId: '1001', robloxUsername: 'BadGuy', aliases: [] },
  { wantedId: 'w2', personId: 'p2', robloxUserId: null, robloxUsername: 'NoIdGuy', aliases: ['Shadow'] },
];

describe('matchWantedPlayer', () => {
  it('exakte Roblox-ID → bestätigt, auch nach Namensänderung', () => {
    expect(matchWantedPlayer({ name: 'RenamedGuy', id: '1001' }, subjects)).toEqual([{ wantedId: 'w1', personId: 'p1', matchType: 'ROBLOX_ID', identified: true }]);
  });
  it('gleicher Name, andere ID → nur mögliche Übereinstimmung (gekennzeichnet)', () => {
    expect(matchWantedPlayer({ name: 'badguy', id: '9999' }, subjects)).toEqual([{ wantedId: 'w1', personId: 'p1', matchType: 'NAME_ID_MISMATCH', identified: false }]);
  });
  it('Name/Alias ohne gespeicherte ID oder ohne ID von der API → nie bestätigt', () => {
    expect(matchWantedPlayer({ name: 'NoIdGuy', id: '5005' }, subjects)[0]).toMatchObject({ matchType: 'NAME', identified: false });
    expect(matchWantedPlayer({ name: 'Shadow', id: null }, subjects)[0]).toMatchObject({ matchType: 'ALIAS', identified: false });
    expect(matchWantedPlayer({ name: 'BadGuy', id: null }, subjects)[0]).toMatchObject({ matchType: 'NAME', identified: false });
  });
  it('kein Eintrag → kein Treffer', () => {
    expect(matchWantedPlayer({ name: 'Harmless', id: '3003' }, subjects)).toEqual([]);
  });
});

describe('diffPresence', () => {
  const t0 = new Date('2026-10-15T20:00:00Z');
  const row = { id: 's1', playerKey: 'id:1001', joinedAt: t0, lastSeenAt: new Date(t0.getTime() + 60_000) };
  it('neu / geblieben / weg', () => {
    const d = diffPresence([{ name: 'BadGuy', id: '1001' }, { name: 'New', id: '2' }], [row, { ...row, id: 's2', playerKey: 'id:7' }]);
    expect(d.joined.map(playerKey)).toEqual(['id:2']);
    expect(d.stayed.map((x) => x.row.id)).toEqual(['s1']);
    expect(d.left.map((x) => x.id)).toEqual(['s2']);
  });
  it('Join-Log: der Beitritt zum Sitzungsbeginn zählt nicht, ein späterer schon', () => {
    const early = new Map([['id:1001', t0.getTime() + 5_000]]);
    expect(diffPresence([{ name: 'BadGuy', id: '1001' }], [row], early).rejoined).toHaveLength(0);
    const later = new Map([['id:1001', t0.getTime() + JOIN_LOG_TOLERANCE_MS + 120_000]]);
    expect(diffPresence([{ name: 'BadGuy', id: '1001' }], [row], later).rejoined).toHaveLength(1);
  });
});
