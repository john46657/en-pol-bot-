import { prisma } from '@nexus/database';
import { addEntry, createRecord, saveRank } from '@nexus/personnel';
import { endShift, saveType, startShift } from '@nexus/shifts';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromotionError, approve, checkFor, eligibleCandidates, formatNumber, getByNumber, historyOf, listRequests, listRules, reject, requestPromotion, saveRule, withdraw } from '../src/index.js';

const G = 'promotest-guild';
const [A, B, BOSS, SUP] = ['900000000000170001', '900000000000170002', '900000000000170003', '900000000000170004'];
const R1 = '900000000000179001';
const R2 = '900000000000179002';
const err = (p: Promise<unknown>, code: string) => expect(p).rejects.toSatisfy((e) => e instanceof PromotionError && e.code === code);
let rk: { anw: string; ok: string; kom: string };

function fakePort() {
  const roles = new Map<string, Set<string>>();
  const driver = { getRoleIds: async (u: string) => [...(roles.get(u) ?? [])], add: vi.fn(async (u: string, r: string) => void roles.set(u, (roles.get(u) ?? new Set()).add(r))), remove: vi.fn(async (u: string, r: string) => void roles.get(u)?.delete(r)) };
  return { roles, port: { sendDm: vi.fn(), postMessage: vi.fn(), editMessage: vi.fn(), roleDriver: () => driver } as never };
}

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.create({ data: { id: G, name: 'Beförderung', settings: { create: {} } } });
  rk = {
    anw: (await saveRank(G, { name: 'Anwärter', order: 1, isEntry: true, discordRoleId: R1 }, 'x')).id,
    ok: (await saveRank(G, { name: 'Oberkommissar', order: 2, discordRoleId: R2 }, 'x')).id,
    kom: (await saveRank(G, { name: 'Kommissar', order: 3 }, 'x')).id,
  };
  for (const [u, n] of [[A, 'Anna'], [B, 'Bert']] as const) {
    const r = await createRecord({ guildId: G, userId: u, rpName: n, actorId: 'x', rankId: rk.anw });
    await prisma.personnelRecord.update({ where: { id: r.id }, data: { joinedAt: new Date(Date.now() - 40 * 86_400_000) } });
  }
});
afterAll(async () => {
  await prisma.promotionCounter.deleteMany({ where: { guildId: G } });
  await prisma.guild.deleteMany({ where: { id: G } });
  await prisma.$disconnect();
});

describe('Regeln', () => {
  it('Voraussetzungen speichern und validieren; Prüfung erklärt jede einzeln', async () => {
    await err(saveRule(G, 'nix', [], 'b'), 'not-found');
    await err(saveRule(G, rk.ok, [{ type: 'MAGIE' }], 'b'), 'invalid');
    await err(saveRule(G, rk.ok, [{ type: 'SERVICE_DAYS', days: 0 }], 'b'), 'invalid');
    await saveRule(G, rk.ok, [{ type: 'SERVICE_DAYS', days: 30 }, { type: 'RANK_DAYS', days: 14 }, { type: 'NO_DISCIPLINE', days: 90 }, { type: 'SHIFT_HOURS', hours: 1 }], 'b');
    expect(await listRules(G)).toHaveLength(1);
    expect(await prisma.qualification.count({ where: { guildId: G } })).toBe(0); // keine Nebenwirkungen
    let r = await checkFor(G, A, rk.ok);
    expect(r.checks.map((c) => [c.met, c.detail])).toEqual([[true, '40 Tage'], [true, '40 Tage'], [true, 'keine'], [false, '0 Std.']]);
    expect(r.eligible).toBe(false);
    const type = await saveType(G, { name: 'Streife' }, 'x');
    const s = await startShift({ guildId: G, userId: A, typeId: type.id, memberRoleIds: [] }, new Date(Date.now() - 2 * 3600_000));
    await endShift(G, s.id, { actorId: A });
    r = await checkFor(G, A, rk.ok);
    expect(r.eligible).toBe(true);
    // Disziplin sperrt
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    await addEntry(G, rec.id, { kind: 'DISCIPLINE', title: 'Verwarnung' }, 'boss');
    expect((await checkFor(G, A, rk.ok)).checks[2]).toMatchObject({ met: false, detail: '1 aktive' });
  });
});

describe('Antrag → Entscheidung', () => {
  beforeEach(async () => {
    await saveRule(G, rk.ok, [{ type: 'SERVICE_DAYS', days: 30 }], 'b');
    await saveRule(G, rk.kom, [{ type: 'SERVICE_DAYS', days: 999 }], 'b');
  });

  it('Antrag-Validierung: Selbstvorschlag, Rang nicht höher, unerfüllt → Ausnahme mit Begründung, ein offener Antrag', async () => {
    await err(requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: A }), 'forbidden');
    await err(requestPromotion({ guildId: G, userId: A, toRankId: rk.anw, requestedBy: BOSS }), 'invalid');
    await err(requestPromotion({ guildId: G, userId: 'x9', toRankId: rk.ok, requestedBy: BOSS }), 'not-found');
    await err(requestPromotion({ guildId: G, userId: A, toRankId: rk.kom, requestedBy: BOSS }), 'conflict'); // 999 Tage
    await err(requestPromotion({ guildId: G, userId: A, toRankId: rk.kom, requestedBy: BOSS, override: true }), 'invalid'); // Begründung fehlt
    const ex = await requestPromotion({ guildId: G, userId: A, toRankId: rk.kom, requestedBy: BOSS, override: true, reason: 'Außergewöhnliche Leistung' });
    expect(ex).toMatchObject({ override: true, status: 'PENDING', number: 1 });
    await err(requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: BOSS }), 'conflict'); // schon offen
  });

  it('Genehmigen: Dienstgrad + Rollenwechsel + Akteneintrag + Historie; Vier-Augen; nicht doppelt', async () => {
    const { port, roles } = fakePort();
    roles.set(A, new Set([R1]));
    const req = await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP, reason: 'Gute Arbeit' });
    expect(formatNumber(req.number)).toBe('B-0001');
    await err(approve({ guildId: G, requestId: req.id, actorId: SUP, port }), 'forbidden'); // Antragsteller
    await err(approve({ guildId: G, requestId: req.id, actorId: A, port }), 'forbidden'); // Beförderte selbst
    const r = await approve({ guildId: G, requestId: req.id, actorId: BOSS, reason: 'Einverstanden', port });
    expect(r.request).toMatchObject({ status: 'APPROVED', decidedBy: BOSS, roleResult: 'success' });
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A }, include: { rank: true } });
    expect(rec.rank?.name).toBe('Oberkommissar');
    expect([...(roles.get(A) ?? [])]).toEqual([R2]); // alte Rolle weg, neue da
    const entry = await prisma.personnelEntry.findFirstOrThrow({ where: { recordId: rec.id, kind: 'PROMOTION' } });
    expect(entry.title).toBe('Beförderung: Anwärter → Oberkommissar');
    expect((await historyOf(G, A)).map((h) => h.toRankName)).toEqual(['Oberkommissar']);
    await err(approve({ guildId: G, requestId: req.id, actorId: BOSS, port }), 'conflict');
    await err(withdraw(G, req.id, SUP), 'conflict');
    expect(await prisma.auditLog.count({ where: { guildId: G, action: 'promotion.approved' } })).toBe(1);
    // Folgeantrag möglich
    await requestPromotion({ guildId: G, userId: A, toRankId: rk.kom, requestedBy: SUP, override: true, reason: 'Sonderfall' });
  });

  it('Genehmigung prüft erneut: nachträglich verletzte Voraussetzung blockiert; Verwalter darf eigene Anträge', async () => {
    const req = await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP });
    await prisma.personnelRecord.updateMany({ where: { guildId: G, userId: A }, data: { joinedAt: new Date() } }); // Dienstzeit „verloren“
    await err(approve({ guildId: G, requestId: req.id, actorId: BOSS }), 'conflict');
    await prisma.personnelRecord.updateMany({ where: { guildId: G, userId: A }, data: { joinedAt: new Date(Date.now() - 40 * 86_400_000) } });
    const ok = await approve({ guildId: G, requestId: req.id, actorId: SUP, manage: true }); // Verwalter darf auch als Antragsteller
    expect(ok.request.status).toBe('APPROVED');
    expect(ok.request.roleResult).toBeNull(); // ohne Discord-Port keine Rollenänderung, ehrlich festgehalten
  });

  it('Dienstgrad zwischenzeitlich geändert → Antrag veraltet', async () => {
    const req = await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP });
    const rec = await prisma.personnelRecord.findFirstOrThrow({ where: { guildId: G, userId: A } });
    await prisma.personnelRecord.update({ where: { id: rec.id }, data: { rankId: rk.ok } });
    await err(approve({ guildId: G, requestId: req.id, actorId: BOSS }), 'conflict');
  });

  it('Ablehnen mit Grund, Zurückziehen, Listen/Filter, Statusschutz', async () => {
    const r1 = await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP });
    await err(reject({ guildId: G, requestId: r1.id, actorId: BOSS }), 'invalid');
    const rj = await reject({ guildId: G, requestId: r1.id, actorId: BOSS, reason: 'Noch zu früh' });
    expect(rj).toMatchObject({ status: 'REJECTED', decisionReason: 'Noch zu früh', pendingKey: null });
    await err(reject({ guildId: G, requestId: r1.id, actorId: BOSS, reason: 'nochmal' }), 'conflict');
    const r2 = await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP }); // nach Ablehnung neuer Antrag möglich
    const r3 = await requestPromotion({ guildId: G, userId: B, toRankId: rk.ok, requestedBy: SUP });
    await err(withdraw(G, r2.id, BOSS), 'forbidden');
    expect((await withdraw(G, r2.id, SUP)).status).toBe('WITHDRAWN');
    expect((await listRequests({ guildId: G, status: 'PENDING' })).items.map((x) => x.id)).toEqual([r3.id]);
    expect((await listRequests({ guildId: G, userId: A })).items).toHaveLength(2);
    expect((await getByNumber(G, 3)).id).toBe(r3.id);
    await err(getByNumber(G, 99), 'not-found');
  });

  it('Kandidaten: automatische Prüfung des nächsten Dienstgrads', async () => {
    await prisma.personnelRecord.updateMany({ where: { guildId: G, userId: B }, data: { joinedAt: new Date() } });
    const c = await eligibleCandidates(G);
    expect(c.map((x) => [x.rpName, x.toRank])).toEqual([['Anna', 'Oberkommissar']]);
    await requestPromotion({ guildId: G, userId: A, toRankId: rk.ok, requestedBy: SUP });
    expect((await eligibleCandidates(G))[0]!.hasOpenRequest).toBe(true);
  });
});
