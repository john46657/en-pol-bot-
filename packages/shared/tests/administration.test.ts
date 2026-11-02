import { describe, expect, it } from 'vitest';
import {
  announcementMessage, canRespond, canSeeDocument, compareStaffing, coverage, deliveryFor, dueReminders, expandRecurrence, localDate, localParts,
  minutesWithin, nextRecurrence, overlaps, passedReminders, periodRange, rankRows, toCsv, zonedTime, MAX_MENTION_ROLES, ALL_PERMISSIONS, moduleOfPermission, BOT_COMMAND_MODULES,
} from '../src';

const iso = (d: Date) => d.toISOString();

describe('Zeitzonen', () => {
  it('lokale Uhrzeit Europe/Berlin → UTC im Winter und Sommer', () => {
    expect(iso(zonedTime(2026, 1, 15, 18, 0))).toBe('2026-01-15T17:00:00.000Z');
    expect(iso(zonedTime(2026, 7, 15, 18, 0))).toBe('2026-07-15T16:00:00.000Z');
  });
  it('Tagesüberlauf und lokales Datum', () => {
    expect(iso(zonedTime(2026, 1, 32, 0, 0))).toBe('2026-01-31T23:00:00.000Z');
    expect(localDate(new Date('2026-03-01T23:30:00Z'))).toBe('2026-03-02');
    expect(localParts(new Date('2026-11-02T08:00:00Z')).wd).toBe(1); // Montag
  });
  it('Überschneidung: Grenzen berühren zählt nicht', () => {
    const d = (s: string) => new Date(s);
    expect(overlaps(d('2026-01-01T10:00Z'), d('2026-01-01T12:00Z'), d('2026-01-01T11:00Z'), d('2026-01-01T13:00Z'))).toBe(true);
    expect(overlaps(d('2026-01-01T10:00Z'), d('2026-01-01T12:00Z'), d('2026-01-01T12:00Z'), d('2026-01-01T13:00Z'))).toBe(false);
  });
});

describe('Wiederholungen', () => {
  it('wöchentlich über die Zeitumstellung: lokale Uhrzeit bleibt 18:00', () => {
    const start = zonedTime(2026, 3, 22, 18, 0), end = zonedTime(2026, 3, 22, 22, 0);
    const occ = expandRecurrence(start, end, { freq: 'WEEKLY', count: 3 });
    expect(occ).toHaveLength(3);
    expect(occ.map((o) => localParts(o.startsAt).h)).toEqual([18, 18, 18]);
    expect(iso(occ[1]!.startsAt)).toBe('2026-03-29T16:00:00.000Z'); // Sommerzeit
    expect(occ.every((o) => o.endsAt.getTime() - o.startsAt.getTime() === 4 * 3_600_000)).toBe(true);
  });
  it('monatlich am 31. überspringt kürzere Monate; Obergrenze 52', () => {
    const s = zonedTime(2026, 1, 31, 9, 0);
    const occ = expandRecurrence(s, new Date(s.getTime() + 3_600_000), { freq: 'MONTHLY', count: 3 });
    expect(occ.map((o) => localDate(o.startsAt))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
    expect(expandRecurrence(s, s, { freq: 'DAILY', count: 500 })).toHaveLength(52);
  });
  it('nächste wiederkehrende Ankündigung', () => {
    expect(nextRecurrence(zonedTime(2026, 10, 24, 12, 0), 'WEEKLY')!.toISOString()).toBe(zonedTime(2026, 10, 31, 12, 0).toISOString());
    expect(nextRecurrence(new Date(), 'NONE')).toBeNull();
  });
});

describe('Schichtplanung', () => {
  it('Besetzung', () => {
    expect(coverage(1, 2, 4)).toMatchObject({ state: 'UNDER', missing: 1, free: 3 });
    expect(coverage(4, 2, 4)).toMatchObject({ state: 'FULL', free: 0 });
    expect(coverage(3, 2, null)).toMatchObject({ state: 'OK', free: null });
  });
  it('Abgleich geplant ↔ im Dienst ↔ abwesend: jede Person genau einmal', () => {
    const r = compareStaffing(['a', 'b', 'c'], ['a', 'd'], ['c']);
    expect(r).toEqual({ plannedPresent: ['a'], plannedMissing: ['b'], plannedAbsent: ['c'], unplannedPresent: ['d'] });
  });
});

describe('Kalender', () => {
  const start = new Date('2026-06-01T18:00:00Z');
  it('fällige Erinnerung: nur die kürzeste, keine Flut nach Neustart', () => {
    const now = new Date('2026-06-01T17:45:00Z');
    expect(dueReminders(start, [1440, 60, 30], [], now)).toEqual([30]);
    expect(passedReminders(start, [1440, 60, 30], [], now).sort()).toEqual([1440, 30, 60].sort());
    expect(dueReminders(start, [1440, 60], [1440, 60], now)).toEqual([]);
    expect(dueReminders(start, [60], [], new Date('2026-06-01T18:01:00Z'))).toEqual([]); // schon begonnen
  });
  it('An-/Abmeldung', () => {
    const now = new Date('2026-06-01T10:00:00Z');
    expect(canRespond({ status: 'SCHEDULED', startsAt: start, maxParticipants: 2 }, 2, false, now)).toMatch(/Plätze/);
    expect(canRespond({ status: 'SCHEDULED', startsAt: start, maxParticipants: 2 }, 2, true, now)).toBeNull();
    expect(canRespond({ status: 'CANCELLED', startsAt: start, maxParticipants: null }, 0, false, now)).toMatch(/nicht/);
  });
});

describe('Ankündigungen', () => {
  it('nie @everyone/@here, höchstens 3 Rollen, nur https-Bilder/Links', () => {
    const m = announcementMessage('GENERAL', { title: 'Hallo @everyone', description: 'Bitte @here lesen', imageUrl: 'http://x.de/a.png', links: [{ label: 'Doku', url: 'javascript:alert(1)' }, { label: 'OK', url: 'https://example.org' }] },
      ['111111111111111111', '222222222222222222', '333333333333333333', '444444444444444444', 'bad']);
    expect(m.mentionRoles).toHaveLength(MAX_MENTION_ROLES);
    expect(JSON.stringify(m.embeds)).not.toMatch(/@everyone|@here/);
    expect(m.embeds[0]).not.toHaveProperty('image');
    expect(m.buttons).toEqual([{ id: 'link-0', label: 'OK', style: 'secondary', url: 'https://example.org' }]);
  });
  it('zurückgezogen: keine Erwähnung, grau, Hinweistext', () => {
    const m = announcementMessage('SYSTEM', { title: 'Wartung', description: 'x' }, ['111111111111111111'], { retracted: true });
    expect(m).not.toHaveProperty('content');
    expect(m.embeds[0]!.title).toMatch(/Zurückgezogen/);
  });
});

describe('Dokumente', () => {
  const user = { view: true, manage: false, confidential: false, roleIds: ['r1'] };
  it('Zugriffsgruppen', () => {
    expect(canSeeDocument({ access: 'ALL', roleIds: [], status: 'ACTIVE' }, user)).toBe(true);
    expect(canSeeDocument({ access: 'ROLES', roleIds: ['r2'], status: 'ACTIVE' }, user)).toBe(false);
    expect(canSeeDocument({ access: 'ROLES', roleIds: ['r1'], status: 'ACTIVE' }, user)).toBe(true);
    expect(canSeeDocument({ access: 'CONFIDENTIAL', roleIds: [], status: 'ACTIVE' }, { ...user, manage: true })).toBe(false);
    expect(canSeeDocument({ access: 'ALL', roleIds: [], status: 'ARCHIVED' }, user)).toBe(false);
    expect(canSeeDocument({ access: 'ALL', roleIds: [], status: 'ACTIVE' }, { ...user, view: false })).toBe(false);
  });
});

describe('Benachrichtigungen', () => {
  it('DM nur mit Zustimmung und nur für DM-fähige Ereignisse', () => {
    expect(deliveryFor('shift.changed', {})).toEqual({ store: true, dm: false, important: true });
    expect(deliveryFor('shift.changed', { dm: true }).dm).toBe(true);
    expect(deliveryFor('ticket.new', { dm: true }).dm).toBe(false);
    expect(deliveryFor('shift.changed', { dm: true, dmEvents: ['calendar.new'] }).dm).toBe(false);
    expect(deliveryFor('shift.changed', { dm: true, muted: ['shift.changed'] })).toMatchObject({ store: false, dm: false });
    expect(deliveryFor('calendar.reminder', { reminders: false, dm: true })).toEqual({ store: false, dm: false, important: false });
  });
});

describe('Statistiken', () => {
  const now = new Date('2026-11-04T12:00:00Z'); // Mittwoch
  it('Zeiträume in deutscher Zeit', () => {
    expect(iso(periodRange('today', now).from)).toBe('2026-11-03T23:00:00.000Z');
    expect(iso(periodRange('week', now).from)).toBe('2026-11-01T23:00:00.000Z'); // Montag 02.11.
    expect(iso(periodRange('month', now).from)).toBe('2026-10-31T23:00:00.000Z');
    expect(iso(periodRange('custom', now, { from: '2026-10-01', to: '2026-10-31' }).to)).toBe('2026-10-31T23:00:00.000Z');
    expect(() => periodRange('custom', now, { from: '2026-10-05', to: '2026-10-01' })).toThrow();
  });
  it('Minuten im Zeitraum (abgeschnitten)', () => {
    const f = new Date('2026-11-01T00:00:00Z'), t = new Date('2026-11-02T00:00:00Z');
    expect(minutesWithin(new Date('2026-10-31T23:00:00Z'), new Date('2026-11-01T01:00:00Z'), f, t)).toBe(60);
    expect(minutesWithin(new Date('2026-11-01T23:30:00Z'), null, f, t, new Date('2026-11-02T05:00:00Z'))).toBe(30);
  });
  it('Rangliste mit gleichen Plätzen, ohne Nullwerte', () => {
    expect(rankRows([{ id: 'a', value: 5 }, { id: 'b', value: 9 }, { id: 'c', value: 5 }, { id: 'd', value: 0 }]).map((r) => [r.id, r.place])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
  });
  it('CSV entschärft Formeln', () => {
    expect(toCsv(['a', 'b'], [['=1+1', 'x;y']])).toBe('a;b\r\n\'=1+1;"x;y"');
  });
});

describe('Rechte und Module', () => {
  it('neue Rechte gehören zu den neuen Modulen', () => {
    for (const p of ['shiftplan.manage', 'calendar.view', 'meetings.organize', 'announce.publish', 'documents.confidential', 'notifications.manage', 'promotion.request', 'transfer.request']) expect(ALL_PERMISSIONS).toContain(p);
    expect(moduleOfPermission('shiftplan.view')).toBe('planning');
    expect(moduleOfPermission('announce.publish')).toBe('announcements');
    expect(moduleOfPermission('documents.view')).toBe('documents');
    expect(moduleOfPermission('notifications.manage')).toBe('core');
    expect(BOT_COMMAND_MODULES.schichtplan).toBe('planning');
  });
});
