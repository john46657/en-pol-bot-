import { describe, expect, it } from 'vitest';
import { checkRequirements, requirementMessage, snowflakeDate, type RequirementContext } from '../src/requirements.js';

const NOW = new Date('2026-10-05T12:00:00Z');
const DAY = 86_400_000;
// Discord-ID eines Kontos, das am 2026-01-01 erstellt wurde
const idAt = (d: Date) => String((BigInt(d.getTime()) - 1_420_070_400_000n) << 22n);
const ctx = (over: Partial<RequirementContext> = {}): RequirementContext => ({
  now: NOW,
  userId: idAt(new Date('2026-01-01T00:00:00Z')),
  memberRoleIds: ['r-member'],
  joinedAt: new Date(NOW.getTime() - 60 * DAY),
  submittedCount: 0,
  openCount: 0,
  acceptedApplicationIds: new Set(),
  ...over,
});

describe('Voraussetzungen', () => {
  it('ohne Voraussetzungen ist alles erlaubt', () => {
    expect(checkRequirements(undefined, ctx())).toEqual({ ok: true, reasons: [] });
    expect(checkRequirements({ enabled: false }, ctx()).ok).toBe(true);
  });

  it('Discord-Kontoalter aus der ID', () => {
    expect(snowflakeDate(idAt(new Date('2026-01-01T00:00:00Z')))?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(snowflakeDate('abc')).toBeNull();
    expect(checkRequirements({ minAccountAgeDays: 100 }, ctx()).ok).toBe(true); // ~277 Tage alt
    expect(checkRequirements({ minAccountAgeDays: 300 }, ctx()).reasons[0]).toMatch(/mindestens 300 Tage alt/);
  });

  it('Mindestzeit auf dem Server; unbekannter Beitritt zählt als nicht erfüllt', () => {
    expect(checkRequirements({ minGuildMembershipDays: 30 }, ctx()).ok).toBe(true);
    expect(checkRequirements({ minGuildMembershipDays: 90 }, ctx()).reasons[0]).toMatch(/90 Tage auf dem Server/);
    expect(checkRequirements({ minGuildMembershipDays: 1 }, ctx({ joinedAt: undefined })).ok).toBe(false);
  });

  it('erforderliche und ausgeschlossene Rollen (mit Namen)', () => {
    const names = { roles: { 'r-mod': 'Moderator', 'r-banned': 'Bewerbungssperre' } };
    const r = checkRequirements({ requiredRoleIds: ['r-mod'], restrictedRoleIds: ['r-banned'] }, ctx({ memberRoleIds: ['r-banned'], names }));
    expect(r.reasons).toEqual(['Dir fehlt die Rolle „Moderator“.', 'Mit der Rolle „Bewerbungssperre“ ist diese Bewerbung nicht möglich.']);
    expect(checkRequirements({ requiredRoleIds: ['r-mod'] }, ctx({ memberRoleIds: ['r-mod'] })).ok).toBe(true);
  });

  it('Wartezeit nach jeder Bewerbung und getrennt nach Ablehnung; späteste Wartezeit zählt', () => {
    const req = { cooldown: { days: 3 }, denyCooldown: { days: 14 } };
    const recent = checkRequirements(req, ctx({ lastSubmittedAt: new Date(NOW.getTime() - 1 * DAY), lastDeniedAt: new Date(NOW.getTime() - 2 * DAY) }));
    expect(recent.reasons).toHaveLength(2);
    expect(recent.reasons[1]).toMatch(/letzten Ablehnung/);
    expect(recent.waitUntil?.toISOString()).toBe(new Date(NOW.getTime() + 12 * DAY).toISOString());
    expect(checkRequirements(req, ctx({ lastSubmittedAt: new Date(NOW.getTime() - 4 * DAY), lastDeniedAt: new Date(NOW.getTime() - 15 * DAY) })).ok).toBe(true);
  });

  it('vorherige Annahme erforderlich bzw. ausgeschlossen', () => {
    const names = { applications: { a1: 'Support', a2: 'Moderation' } };
    expect(checkRequirements({ requirePreviousApproval: ['a1'] }, ctx({ names })).reasons[0]).toBe('Zuerst muss deine Bewerbung „Support“ angenommen sein.');
    expect(checkRequirements({ requirePreviousApproval: ['a1'] }, ctx({ acceptedApplicationIds: new Set(['a1']) })).ok).toBe(true);
    expect(checkRequirements({ forbidPreviousApproval: ['a2'] }, ctx({ acceptedApplicationIds: new Set(['a2']), names })).reasons[0]).toMatch(/Annahme bei „Moderation“/);
  });

  it('Höchstzahl je Person und freie Plätze', () => {
    expect(checkRequirements({ maxSubmissionsPerUser: 2 }, ctx({ submittedCount: 1 })).ok).toBe(true);
    expect(checkRequirements({ maxSubmissionsPerUser: 2 }, ctx({ submittedCount: 2 })).reasons[0]).toMatch(/Höchstzahl von 2 Bewerbungen/);
    expect(checkRequirements({ maxOpenSubmissions: 5 }, ctx({ openCount: 5 })).reasons[0]).toMatch(/alle Plätze belegt/);
  });

  it('Dienstgrad/Team aus der Personalakte; ohne Akte nicht erfüllt', () => {
    const req = { requiredRankIds: ['k1', 'k2'], requiredTeamIds: ['t1'] };
    expect(checkRequirements(req, ctx()).reasons).toEqual(['Dafür brauchst du eine Personalakte.']);
    expect(checkRequirements(req, ctx({ personnel: { rankId: 'k2', teamId: 't1' } })).ok).toBe(true);
    expect(checkRequirements(req, ctx({ personnel: { rankId: 'k3', teamId: null }, names: { ranks: { k1: 'Anwärter', k2: 'Kommissar' }, teams: { t1: 'Streife' } } })).reasons).toEqual([
      'Nötig ist der Dienstgrad „Anwärter“ oder „Kommissar“.',
      'Nötig ist die Zugehörigkeit zu „Streife“.',
    ]);
  });

  it('Mindestaktivität (Dienststunden im Zeitraum)', () => {
    expect(checkRequirements({ minDutyHours: 10, dutyWindowDays: 14 }, ctx({ dutyHours: 12.5 })).ok).toBe(true);
    expect(checkRequirements({ minDutyHours: 10, dutyWindowDays: 14 }, ctx({ dutyHours: 3.25 })).reasons[0]).toBe('Nötig sind mindestens 10 Dienststunden in den letzten 14 Tagen (bisher 3.2).');
  });

  it('Meldung: eigener Hinweis oder Standard, darunter die Gründe', () => {
    const r = checkRequirements({ maxOpenSubmissions: 1 }, ctx({ openCount: 1 }));
    expect(requirementMessage(r)).toBe('❌ Du erfüllst derzeit nicht die Voraussetzungen für diese Bewerbung.\n• Derzeit sind alle Plätze belegt – bitte versuche es später erneut.');
    expect(requirementMessage(r, 'Leider nicht.').startsWith('Leider nicht.\n• ')).toBe(true);
  });
});
