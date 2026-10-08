import { Injectable } from '@nestjs/common';
import { Prisma, type HrTrainingSession } from '@prisma/client';
import type { MessageSpec } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import type { Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { makeNumber } from '../common/numbering';
import { webUrl } from '../common/web-url';
import { HrCoreService } from './hr-core.service';
import { HrTrainingService } from './hr-training.service';

export interface Signup { discordId: string; userId?: string | null; name: string; at: string }
export interface SessionInput { trainingId?: string | null; title: string; startsAt: string; forRank?: string | null; duration?: string | null; location?: string | null; notes?: string | null; channelId?: string | null; guildId?: string | null; promoteRankId?: string | null; maxSignups?: number | null }

const unix = (d: Date) => Math.floor(d.getTime() / 1000);
const mentions = (ids: string[]) => (ids.length ? ids.map((i) => `<@${i}>`).join(' ') : '—');

/**
 * Ausbildungstermine (wie bisher in Discord: „Ausbildung – Wann / Für den Rang / Dauer“ und danach die „Auswertung“):
 * ankündigen mit Anmelde-Button und Thread, Anmeldungen live in der Nachricht, Auswertung (erschienen/bestanden/Dauer)
 * als eigene Nachricht und in den Personalakten – Bestandene werden auf Wunsch automatisch befördert.
 */
@Injectable()
export class HrTrainingSessionsService {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly core: HrCoreService, private readonly trainings: HrTrainingService) {}

  async list(f: { scope?: 'upcoming' | 'past' | 'all' }) {
    const now = new Date(Date.now() - 6 * 3_600_000); // laufende Termine des Tages bleiben „anstehend“
    const scope = f.scope ?? 'upcoming';
    const rows = await this.prisma.hrTrainingSession.findMany({ where: scope === 'upcoming' ? { status: 'PLANNED', startsAt: { gte: now } } : scope === 'past' ? { OR: [{ status: { not: 'PLANNED' } }, { startsAt: { lt: now } }] } : {}, orderBy: { startsAt: scope === 'upcoming' ? 'asc' : 'desc' }, take: 200 });
    return Promise.all(rows.map((r) => this.view(r)));
  }
  async get(id: string) { return this.view(await this.row(id)); }
  private async row(id: string) {
    const r = await this.prisma.hrTrainingSession.findUnique({ where: { id } });
    if (!r) throw new AppError('NOT_FOUND', 'Ausbildungstermin nicht gefunden.');
    return r;
  }
  private async view(r: HrTrainingSession) {
    const [training, rank, instructor] = await Promise.all([
      r.trainingId ? this.prisma.hrTraining.findUnique({ where: { id: r.trainingId }, select: { id: true, name: true } }) : null,
      r.promoteRankId ? this.prisma.hrRank.findUnique({ where: { id: r.promoteRankId }, select: { id: true, name: true } }) : null,
      r.instructorId ? this.prisma.user.findUnique({ where: { id: r.instructorId }, select: { displayName: true } }) : null,
    ]);
    return { ...r, signups: r.signups as unknown as Signup[], training, promoteRank: rank, instructorName: instructor?.displayName ?? null };
  }

  private async assertCan(actor: Actor) { await this.perms.assert(actor.userId!, 'training.create'); }

  async create(actor: Actor, d: SessionInput) {
    await this.assertCan(actor);
    await this.check(d);
    const r = await this.prisma.$transaction(async (tx) => {
      const row = await tx.hrTrainingSession.create({ data: { number: makeNumber('AB'), ...this.data(d), instructorId: actor.userId, createdById: actor.userId } });
      await this.core.audit.record(actor, { action: 'training.session.create', module: 'training', entityType: 'HrTrainingSession', entityId: row.id, after: { title: row.title, startsAt: row.startsAt } }, tx);
      return row;
    });
    await this.publish(r.id, true);
    return this.get(r.id);
  }
  async update(actor: Actor, id: string, d: SessionInput) {
    await this.assertCan(actor);
    const before = await this.row(id);
    if (before.status !== 'PLANNED') throw new AppError('CONFLICT', 'Der Termin ist schon ausgewertet oder abgesagt.');
    await this.check(d);
    await this.prisma.hrTrainingSession.update({ where: { id }, data: this.data(d) });
    await this.core.audit.record(actor, { action: 'training.session.update', module: 'training', entityType: 'HrTrainingSession', entityId: id, before: { title: before.title, startsAt: before.startsAt }, after: { title: d.title, startsAt: d.startsAt } });
    await this.publish(id, false);
    return this.get(id);
  }
  async cancel(actor: Actor, id: string, reason?: string) {
    await this.assertCan(actor);
    const r = await this.row(id);
    if (r.status !== 'PLANNED') throw new AppError('CONFLICT', 'Der Termin ist schon ausgewertet oder abgesagt.');
    await this.prisma.hrTrainingSession.update({ where: { id }, data: { status: 'CANCELLED', evaluationNote: reason?.trim() || null } });
    await this.core.audit.record(actor, { action: 'training.session.cancel', module: 'training', entityType: 'HrTrainingSession', entityId: id, ...(reason ? { reason } : {}) });
    await this.publish(id, false);
    return this.get(id);
  }
  private data(d: SessionInput) {
    return { trainingId: d.trainingId ?? null, title: d.title.trim(), startsAt: new Date(d.startsAt), forRank: d.forRank?.trim() || null, duration: d.duration?.trim() || null, location: d.location?.trim() || null, notes: d.notes?.trim() || null, channelId: d.channelId ?? null, guildId: d.guildId ?? null, promoteRankId: d.promoteRankId ?? null, maxSignups: d.maxSignups ?? null };
  }
  private async check(d: SessionInput) {
    if (Number.isNaN(new Date(d.startsAt).getTime())) throw new AppError('VALIDATION_FAILED', 'Ungültiger Zeitpunkt.');
    if (d.trainingId && !(await this.prisma.hrTraining.findUnique({ where: { id: d.trainingId } }))) throw new AppError('NOT_FOUND', 'Ausbildung nicht gefunden.');
    if (d.promoteRankId && !(await this.prisma.hrRank.findUnique({ where: { id: d.promoteRankId } }))) throw new AppError('NOT_FOUND', 'Rang nicht gefunden.');
  }

  /** An-/Abmelden – aus Discord (Button) auch ohne Dashboard-Konto, aus dem Dashboard über die eigene Discord-Verknüpfung. */
  async signupById(id: string, d: { discordId: string; name: string; join: boolean }) { return this.signupRow(await this.row(id), d); }
  async signupSelf(actor: Actor, id: string, join: boolean) {
    const [link, user] = await Promise.all([this.prisma.discordLink.findUnique({ where: { userId: actor.userId! } }), this.prisma.user.findUnique({ where: { id: actor.userId! }, select: { displayName: true } })]);
    if (!link) throw new AppError('VALIDATION_FAILED', 'Verknüpfe zuerst dein Konto mit Discord.');
    return this.signupRow(await this.row(id), { discordId: link.discordId, name: user?.displayName ?? link.discordId, join });
  }
  private async signupRow(r: HrTrainingSession, d: { discordId: string; name: string; join: boolean }) {
    if (r.status !== 'PLANNED') throw new AppError('CONFLICT', r.status === 'CANCELLED' ? 'Dieser Termin wurde abgesagt.' : 'Dieser Termin ist schon vorbei.');
    const list = r.signups as unknown as Signup[];
    const has = list.some((s) => s.discordId === d.discordId);
    if (d.join && has) return { ok: true, message: 'Du bist schon angemeldet.', count: list.length };
    if (!d.join && !has) return { ok: true, message: 'Du warst nicht angemeldet.', count: list.length };
    if (d.join && r.maxSignups && list.length >= r.maxSignups) throw new AppError('CONFLICT', 'Der Termin ist leider voll.');
    const link = await this.prisma.discordLink.findUnique({ where: { discordId: d.discordId } });
    const next = d.join ? [...list, { discordId: d.discordId, userId: link?.userId ?? null, name: d.name.slice(0, 64), at: new Date().toISOString() }] : list.filter((s) => s.discordId !== d.discordId);
    await this.prisma.hrTrainingSession.update({ where: { id: r.id }, data: { signups: next as unknown as Prisma.InputJsonValue } });
    await this.publish(r.id, false);
    return { ok: true, message: d.join ? `Angemeldet für „${r.title}“ am ${r.startsAt.toLocaleDateString('de-DE')}.` : 'Abgemeldet.', count: next.length };
  }

  /**
   * Auswertung: wer war da, wer hat bestanden, wie lange hat es gedauert. Bestandene bekommen den Ausbildungsnachweis
   * (Personalakte) und – falls eingestellt – den neuen Rang inkl. Discord-Rollen.
   */
  async evaluate(actor: Actor, id: string, d: { attended: string[]; passed: string[]; actualDuration?: string | null; note?: string | null }) {
    await this.assertCan(actor);
    const r = await this.row(id);
    if (r.status === 'CANCELLED') throw new AppError('CONFLICT', 'Der Termin wurde abgesagt.');
    const attended = [...new Set(d.attended)];
    const passed = [...new Set(d.passed)].filter((x) => attended.includes(x));
    await this.prisma.hrTrainingSession.update({ where: { id }, data: { status: 'DONE', attended, passed, actualDuration: d.actualDuration?.trim() || null, evaluationNote: d.note?.trim() || null, evaluatedAt: new Date(), evaluatedById: actor.userId } });
    await this.core.audit.record(actor, { action: 'training.session.evaluate', module: 'training', entityType: 'HrTrainingSession', entityId: id, after: { attended: attended.length, passed: passed.length } });
    const results: { discordId: string; promoted: boolean; problem?: string }[] = [];
    const rank = r.promoteRankId ? await this.prisma.hrRank.findUnique({ where: { id: r.promoteRankId } }) : null;
    const ranks = rank ? await this.prisma.hrRank.findMany() : [];
    for (const discordId of passed) {
      const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
      const p = link ? await this.prisma.personnel.findUnique({ where: { userId: link.userId } }) : null;
      if (!p) { results.push({ discordId, promoted: false, problem: 'keine Personalakte' }); continue; }
      // Ausbildungsnachweis: über die Ausbildung (Fortschritt + Zertifikat), sonst als Eintrag in der Personalakte
      const viaTraining = r.trainingId ? await this.trainings.setProgress(actor, { trainingId: r.trainingId, personnelId: p.id, status: 'PASSED', note: `Termin ${r.number}` }).then(() => true, () => false) : false;
      const already = await this.prisma.personnelRecord.findFirst({ where: { personnelId: p.id, type: 'TRAINING', data: { path: ['sessionId'], equals: r.id } } });
      if (!viaTraining && !already) await this.prisma.personnelRecord.create({ data: { personnelId: p.id, type: 'TRAINING', summary: `Ausbildung bestanden: ${r.title}`, data: { sessionId: r.id, number: r.number }, createdById: actor.userId! } });
      if (rank && p.rank !== rank.name) {
        const current = ranks.find((x) => x.name === p.rank);
        await this.prisma.$transaction(async (tx) => {
          await tx.personnel.update({ where: { id: p.id }, data: { rank: rank.name, rankSince: new Date() } });
          await tx.personnelRecord.create({ data: { personnelId: p.id, type: 'PROMOTION', summary: `${p.rank ?? '—'} → ${rank.name} (Ausbildung ${r.number})`, data: { from: p.rank, to: rank.name, sessionId: r.id }, createdById: actor.userId! } });
          await this.core.syncDiscordRoles(p.userId, rank.discordRoleIds, current?.discordRoleIds.filter((x) => !rank.discordRoleIds.includes(x)) ?? [], `Ausbildung ${r.number} bestanden`, tx);
          await this.core.audit.record(actor, { action: 'personnel.promote', module: 'personnel', entityType: 'Personnel', entityId: p.id, before: { rank: p.rank }, after: { rank: rank.name, session: r.number } }, tx);
        });
        results.push({ discordId, promoted: true });
      } else if (!results.some((x) => x.discordId === discordId)) results.push({ discordId, promoted: false });
    }
    await this.publish(id, false);
    // Auswertung als eigene Nachricht (wie bisher von Hand)
    const ch = r.channelId;
    if (ch) {
      const signups = (r.signups as unknown as Signup[]).map((s) => s.discordId);
      const failed = attended.filter((x) => !passed.includes(x));
      const missing = signups.filter((x) => !attended.includes(x));
      const lines = [`**Angemeldet und erschienen:** ${mentions(attended)}`, `**Bestanden:** ${mentions(passed)}`, ...(failed.length ? [`**Nicht bestanden:** ${mentions(failed)}`] : []), ...(missing.length ? [`**Angemeldet, nicht erschienen:** ${mentions(missing)}`] : []), `**Dauer war:** ${d.actualDuration?.trim() || '—'}`, ...(rank && results.some((x) => x.promoted) ? [`**Befördert zu:** ${rank.name}`] : []), ...(d.note?.trim() ? [`\n${d.note.trim()}`] : [])];
      const message: MessageSpec = { embeds: [{ title: `📋 Auswertung – ${r.title}`, description: lines.join('\n').slice(0, 4000), color: 0x22c55e, footer: `${r.number} · ${r.startsAt.toLocaleDateString('de-DE')}`, timestamp: new Date().toISOString() }] };
      await this.core.discord.postMessage(`training-eval-${r.id.slice(0, 8)}`, ch, message, { forceNew: true });
    }
    return { session: await this.get(id), results };
  }

  /** Ankündigung posten bzw. aktualisieren (Anmeldungen, Status). */
  private async publish(id: string, isNew: boolean) {
    const r = await this.row(id);
    if (!r.channelId) return;
    const posted = await this.core.discord.posted(`training-${r.id}`);
    if (!isNew && !posted) return;
    const v = await this.view(r);
    const instructor = r.instructorId ? await this.prisma.discordLink.findUnique({ where: { userId: r.instructorId } }) : null;
    const signups = v.signups;
    const lines = [
      `**Wann:** <t:${unix(r.startsAt)}:F> (<t:${unix(r.startsAt)}:R>)`,
      ...(r.forRank ? [`**Für den Rang:** ${r.forRank}`] : []), ...(r.duration ? [`**Ungefähre Dauer:** ${r.duration}`] : []), ...(r.location ? [`**Ort:** ${r.location}`] : []),
      ...(instructor || v.instructorName ? [`**Ausbilder:** ${instructor ? `<@${instructor.discordId}>` : v.instructorName}`] : []),
      ...(v.promoteRank ? [`**Bei Bestehen:** Beförderung zu ${v.promoteRank.name}`] : []),
      ...(r.notes ? [`\n${r.notes}`] : []),
      r.status === 'DONE' ? '\n✅ **Abgeschlossen** – die Auswertung steht darunter.' : r.status === 'CANCELLED' ? `\n❌ **Abgesagt**${r.evaluationNote ? `: ${r.evaluationNote}` : ''}` : '',
    ].filter(Boolean);
    const message: MessageSpec = {
      embeds: [{ title: `📚 ${r.title}`.slice(0, 256), description: lines.join('\n').slice(0, 4000), color: r.status === 'DONE' ? 0x22c55e : r.status === 'CANCELLED' ? 0x64748b : 0x3b82f6,
        fields: [{ name: `Angemeldet (${signups.length}${r.maxSignups ? `/${r.maxSignups}` : ''})`, value: signups.length ? signups.map((s) => `<@${s.discordId}>`).join(' ').slice(0, 1024) : 'noch niemand' }], footer: r.number, timestamp: new Date().toISOString() }],
      buttons: [
        ...(r.status === 'PLANNED' ? [{ id: `trn:join:${r.id}`, label: 'Anmelden', emoji: '✅', style: 'success' as const }, { id: `trn:leave:${r.id}`, label: 'Abmelden', emoji: '✖️', style: 'secondary' as const }] : []),
        { id: 'link', label: 'Im Dashboard', style: 'secondary', url: webUrl(`/trainings?session=${r.id}`) },
      ],
      ...(isNew ? { thread: `${r.title} – ${r.startsAt.toLocaleDateString('de-DE')}` } : {}),
    };
    await this.core.discord.postMessage(`training-${r.id}`, posted?.channelId ?? r.channelId, message, isNew ? { forceNew: true } : {});
  }
}
