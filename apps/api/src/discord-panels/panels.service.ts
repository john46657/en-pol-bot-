import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { formPanelMessage, formPanelResult, formPanelSchema, staffListSchema, type FormPanel, type StaffList } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, type Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { AppError } from '../common/errors';
import { JsonListStore } from '../common/json-store';

/** Staff-Listen (Discord-Teamliste nach Rollen) und Formular-Panels – alles im Dashboard eingestellt, der Bot führt aus. */
@Injectable()
export class PanelsService {
  readonly staff: JsonListStore<StaffList>;
  readonly forms: JsonListStore<FormPanel>;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService, private readonly live: DiscordLiveService) {
    this.staff = new JsonListStore(prisma, 'discord.staffLists', staffListSchema as never, 50);
    this.forms = new JsonListStore(prisma, 'discord.formPanels', formPanelSchema as never, 50);
  }

  private visible<T extends { guildId: string | null }>(list: T[], g: string | null) { return g ? list.filter((x) => !x.guildId || x.guildId === g) : list; }

  // ---------------- Staff-Listen ----------------
  async staffLists(g: string | null) {
    const list = this.visible(await this.staff.all(), g);
    return Promise.all(list.map(async (l) => ({ ...l, posted: await this.discord.posted(`staff-${l.id}`) })));
  }
  async saveStaff(actor: Actor, doc: StaffList) {
    const [d, old] = await this.staff.upsert(staffListSchema.parse(doc));
    await this.audit.record(actor, { action: old ? 'stafflist.update' : 'stafflist.create', module: 'team', entityType: 'StaffList', entityId: d.id, after: { name: d.name, sections: d.sections.length } });
    return d;
  }
  async removeStaff(actor: Actor, id: string) {
    if (!(await this.staff.remove(id))) throw new AppError('NOT_FOUND', 'Liste nicht gefunden.');
    await this.audit.record(actor, { action: 'stafflist.delete', module: 'team', entityType: 'StaffList', entityId: id });
  }
  async duplicateStaff(actor: Actor, id: string) {
    const src = await this.staff.get(id);
    if (!src) throw new AppError('NOT_FOUND', 'Liste nicht gefunden.');
    return this.saveStaff(actor, { ...src, id: randomUUID(), name: `${src.name} (Kopie)`.slice(0, 80), channelId: null });
  }
  /** Vorschau mit den Teammitgliedern, die der Bot meldet (Teamrollen). Im Discord rechnet der Bot mit allen Mitgliedern der Rollen. */
  async previewStaff(guildId: string | null) {
    const l = { guildId };
    const members = this.live.getMembers().members.filter((m) => !l.guildId || m.guildId === l.guildId).map((m) => ({ id: m.id, name: m.displayName, roleIds: m.roleIds }));
    const byId = new Map<string, { id: string; name: string; roleIds: string[] }>();
    for (const m of members) byId.set(m.id, { ...m, roleIds: [...new Set([...(byId.get(m.id)?.roleIds ?? []), ...m.roleIds])] });
    return { members: [...byId.values()] };
  }
  /** Sofort senden/aktualisieren lassen (der Bot rechnet die Mitglieder selbst). */
  async sendStaff(actor: Actor, id: string, mode: 'update' | 'new') {
    const l = await this.staff.get(id);
    if (!l) throw new AppError('NOT_FOUND', 'Liste nicht gefunden.');
    if (!l.channelId) throw new AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal.');
    await this.prisma.discordOutbox.create({ data: { type: 'bot.stafflist', channelKey: 'announcements', payload: { id, forceNew: mode === 'new' } } });
    await this.audit.record(actor, { action: 'stafflist.send', module: 'team', entityType: 'StaffList', entityId: id, after: { channelId: l.channelId, mode } });
    return { queued: true };
  }

  // ---------------- Formular-Panels ----------------
  async formPanels(g: string | null) {
    const list = this.visible(await this.forms.all(), g);
    const counts = await this.prisma.panelSubmission.groupBy({ by: ['panelId'], _count: { _all: true }, where: { panelId: { in: list.map((p) => p.id) } } });
    const n = new Map(counts.map((c) => [c.panelId, c._count._all]));
    return Promise.all(list.map(async (p) => ({ ...p, posted: await this.discord.posted(`fpanel-${p.id}`), submissions: n.get(p.id) ?? 0 })));
  }
  async saveForm(actor: Actor, doc: FormPanel) {
    const p = formPanelSchema.parse(doc);
    const ids = p.fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) throw new AppError('VALIDATION_FAILED', 'Jedes Feld braucht ein eigenes Kürzel.');
    const [d, old] = await this.forms.upsert(p);
    await this.audit.record(actor, { action: old ? 'formpanel.update' : 'formpanel.create', module: 'settings', entityType: 'FormPanel', entityId: d.id, after: { name: d.name } });
    // Panel steht schon in Discord → Button/Text gleich mitziehen
    const posted = await this.discord.posted(`fpanel-${d.id}`);
    if (posted && d.channelId === posted.channelId && old && JSON.stringify(formPanelMessage(old)) !== JSON.stringify(formPanelMessage(d))) await this.discord.postMessage(`fpanel-${d.id}`, d.channelId, formPanelMessage(d));
    return d;
  }
  async removeForm(actor: Actor, id: string) {
    if (!(await this.forms.remove(id))) throw new AppError('NOT_FOUND', 'Panel nicht gefunden.');
    await this.audit.record(actor, { action: 'formpanel.delete', module: 'settings', entityType: 'FormPanel', entityId: id });
  }
  async sendForm(actor: Actor, id: string, mode: 'update' | 'new') {
    const p = await this.forms.get(id);
    if (!p) throw new AppError('NOT_FOUND', 'Panel nicht gefunden.');
    if (!p.channelId) throw new AppError('VALIDATION_FAILED', 'Wähle zuerst einen Kanal für das Panel.');
    await this.discord.postMessage(`fpanel-${p.id}`, p.channelId, formPanelMessage(p), { forceNew: mode === 'new' });
    await this.audit.record(actor, { action: 'formpanel.send', module: 'settings', entityType: 'FormPanel', entityId: id, after: { channelId: p.channelId, mode } });
    return { queued: true };
  }
  submissions(panelId: string) {
    return this.prisma.panelSubmission.findMany({ where: { panelId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }
  async removeSubmission(actor: Actor, id: string) {
    const s = await this.prisma.panelSubmission.findUnique({ where: { id } });
    if (!s) throw new AppError('NOT_FOUND', 'Eintrag nicht gefunden.');
    await this.prisma.panelSubmission.delete({ where: { id } });
    // Nachricht in Discord ebenfalls entfernen
    if (s.channelId && s.messageId) await this.prisma.discordOutbox.create({ data: { type: 'bot.delete', channelKey: 'announcements', payload: { channelId: s.channelId, messageId: s.messageId } } });
    await this.audit.record(actor, { action: 'formpanel.submission.delete', module: 'settings', entityType: 'PanelSubmission', entityId: id, before: { discordId: s.discordId } });
  }

  // ---------------- für den Bot ----------------
  async botStaffLists() { return this.staff.all(); }
  async botForm(id: string) {
    const p = await this.forms.get(id);
    if (!p || !p.active) throw new AppError('NOT_FOUND', 'Dieses Panel ist nicht mehr aktiv.');
    return p;
  }
  /** Einsendung speichern und die fertige Nachricht liefern; bei „einmal je Person“ den alten Ort zum Löschen mitgeben. */
  async botSubmit(id: string, d: { guildId: string | null; discordId: string; userName: string; avatar?: string; values: Record<string, string> }) {
    const p = await this.botForm(id);
    const values: Record<string, string> = {};
    for (const f of p.fields) {
      const v = (d.values[f.id] ?? '').trim().slice(0, f.maxLength);
      if (f.required && !v) throw new AppError('VALIDATION_FAILED', `„${f.label}“ fehlt.`);
      values[f.id] = v;
    }
    const prev = p.onePerUser ? await this.prisma.panelSubmission.findFirst({ where: { panelId: id, discordId: d.discordId }, orderBy: { createdAt: 'desc' } }) : null;
    const sub = prev
      ? await this.prisma.panelSubmission.update({ where: { id: prev.id }, data: { values, userName: d.userName, guildId: d.guildId } })
      : await this.prisma.panelSubmission.create({ data: { panelId: id, guildId: d.guildId, discordId: d.discordId, userName: d.userName, values } });
    return {
      submissionId: sub.id, channelId: p.targetChannelId ?? p.channelId, previous: prev?.channelId && prev.messageId ? { channelId: prev.channelId, messageId: prev.messageId } : null,
      message: formPanelResult(p, values, { id: d.discordId, name: d.userName, avatar: d.avatar }), asUser: p.asUser, confirmText: p.confirmText, grantRoleIds: p.grantRoleIds,
      modal: { title: p.modalTitle, fields: p.fields },
    };
  }
  async botSubmissionPosted(id: string, channelId: string, messageId: string) {
    await this.prisma.panelSubmission.updateMany({ where: { id }, data: { channelId, messageId } });
  }
}
