import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type RadioGrant, type RadioRequest } from '@prisma/client';
import {
  DEFAULT_RADIO_ROLE_RULES, RADIO_CSV_COLUMNS, csvCell, effectiveRadioStatus, isRadioAuthorized, parseCsv, radioRoleSyncAction,
  type RadioRoleRules,
} from '@enrp/shared';
import { PrismaService, Tx } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { NotifyService } from '../notifications/notify.service';
import { AppError } from '../common/errors';
import { onePersonnel, unscoped } from '../common/guild-context';
import { decryptSecret, encryptSecret } from '../cad/erlc-crypto';
import { ZelloError, ZelloWorkClient, zelloBaseUrl, type ZelloCredentials } from './zello-work.client';

const MODULE = 'radiowhitelist';
const CONFIG_KEY = 'radiowhitelist.config';
const ROLESYNC_STATUS_KEY = 'radiowhitelist.rolesync.status';
const SYSTEM: Actor = { userId: null };
const DISCORD_ID = /^\d{15,25}$/;

export interface RadioWhitelistConfig {
  roleSync: RadioRoleRules;
  /** Discord-Rolle(n), die Mitglieder mit aktiver Freigabe tragen (leer = Funkrolle aus Einstellungen → Discord). */
  radioRoleIds: string[];
  /** `approveRoleIds`: Discord-Rollen, die das Mitglied zusätzlich bekommt, wenn sein Antrag genehmigt wird (bleiben danach bestehen). */
  requests: { enabled: boolean; preventDuplicates: boolean; notifyChannelId: string | null; approveRoleIds: string[]; panel: RequestPanel; form: RequestForm };
  /** Mitglieder per Discord-DM über Änderungen informieren (Antragsentscheidungen immer). */
  notifyMembers: boolean;
}
/** Antrags-Panel in Discord: Nachricht mit Button „Funkfreigabe beantragen“ (öffnet das Formular). */
export interface RequestPanel { channelId: string | null; title: string; text: string; buttonLabel: string; color: string }
export const DEFAULT_PANEL: RequestPanel = { channelId: null, title: '🎙️ Funkfreigabe beantragen', text: 'Du brauchst Zugang zum Funk? Klicke unten auf den Button, begründe kurz deinen Antrag – die Leitung entscheidet und du bekommst eine Direktnachricht.', buttonLabel: 'Funkfreigabe beantragen', color: '#3b82f6' };
/**
 * Antragsformular in Discord (Modal, höchstens 5 Felder). `reason` ist immer dabei und Pflicht; `rank`/`department` landen in
 * eigenen Spalten, alle anderen Felder als Antworten (`answers`).
 */
export interface RequestFormField { key: string; label: string; placeholder: string; paragraph: boolean; required: boolean; maxLength: number }
export interface RequestForm { title: string; fields: RequestFormField[] }
export const DEFAULT_FORM: RequestForm = { title: 'Antrag auf Funkfreigabe', fields: [
  { key: 'reason', label: 'Begründung', placeholder: 'Warum brauchst du Zugang zum Funk?', paragraph: true, required: true, maxLength: 1000 },
  { key: 'rank', label: 'Dienstgrad (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
  { key: 'department', label: 'Abteilung (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
] };
/** Formular immer gültig halten: Begründung vorhanden und Pflicht, höchstens 5 Felder, Schlüssel eindeutig. */
export function normalizeForm(f: Partial<RequestForm> | undefined): RequestForm {
  const seen = new Set<string>();
  const fields = (Array.isArray(f?.fields) ? f!.fields : DEFAULT_FORM.fields).filter((x) => x && typeof x.key === 'string' && !seen.has(x.key) && seen.add(x.key)).slice(0, 5);
  if (!fields.some((x) => x.key === 'reason')) fields.unshift(DEFAULT_FORM.fields[0]!);
  return { title: (f?.title || DEFAULT_FORM.title).slice(0, 45), fields: fields.slice(0, 5).map((x) => (x.key === 'reason' ? { ...x, required: true, maxLength: Math.max(10, Math.min(x.maxLength, 1000)) } : x)) };
}
export const DEFAULT_CONFIG: RadioWhitelistConfig = { roleSync: DEFAULT_RADIO_ROLE_RULES, radioRoleIds: [], requests: { enabled: true, preventDuplicates: true, notifyChannelId: null, approveRoleIds: [], panel: DEFAULT_PANEL, form: DEFAULT_FORM }, notifyMembers: true };
const PANEL_STATE_KEY = 'radio-request-panel';
/** Beschriftungen, an denen das eingebaute Dienstgrad-/Abteilungsfeld noch erkennbar ist. */
const BUILT_IN_LABEL = { rank: /dienstgrad|rang/i, department: /abteilung|einheit|dienststelle/i } as const;
const requestStateKey = (id: string) => `rwreq-${id}`;
const hexColor = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : 0x3b82f6);

/** Funkdienste, für die die Anbindung angeboten wird – mit ehrlicher Angabe, was per API möglich ist. */
export const RADIO_PROVIDERS = [
  { key: 'NONE', name: 'Kein Funkdienst angebunden', apiSupported: false, note: 'Die Whitelist wird nur im Dashboard und in Discord geführt.' },
  {
    key: 'ZELLO_WORK', name: 'Zello Work (Server-API)', apiSupported: true,
    note: 'Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.',
    verified: 'Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.',
  },
  {
    key: 'ZELLO_APP', name: 'Zello (kostenlose App, Kanal)', apiSupported: false,
    note: 'Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.',
  },
  { key: 'OTHER_MANUAL', name: 'Anderer Funkdienst (manuell)', apiSupported: false, note: 'Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.' },
] as const;
export type RadioProvider = (typeof RADIO_PROVIDERS)[number]['key'];

type StatusFilter = 'active' | 'suspended' | 'expired' | 'pending' | 'disabled' | 'revoked' | 'all' | 'open';
export interface GrantInput { discordId: string; discordName?: string | null; rank?: string | null; department?: string | null; externalName?: string | null; reason: string; expiresAt?: Date | null; status?: 'ACTIVE' | 'PENDING' }

const clip = (s: string | null | undefined, n: number) => (s ? s.slice(0, n) : null);
const errMsg = (e: unknown) => (e instanceof ZelloError ? e.message : e instanceof Error ? e.message.slice(0, 200) : 'Unbekannter Fehler');

/**
 * Funk-Whitelist für einen externen Funkdienst – genau ein fest konfigurierter Discord-Server (keine Multi-Server-Logik).
 * Alle Berechtigungsprüfungen laufen im Backend; jede Änderung landet im (unveränderlichen) Audit-Log.
 */
@Injectable()
export class RadioWhitelistService {
  private readonly log = new Logger('RadioWhitelist');
  private syncing = false;
  /** In Tests ersetzbar (gemockter Funkdienst). */
  zelloFactory: (c: ZelloCredentials) => Pick<ZelloWorkClient, 'login' | 'logout' | 'channelExists' | 'addToChannel' | 'removeFromChannel'> = (c) => new ZelloWorkClient(c);

  constructor(
    private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly discord: DiscordService,
    private readonly live: DiscordLiveService, private readonly notify: NotifyService,
  ) {}

  // ================= Einstellungen =================
  async config(): Promise<RadioWhitelistConfig> {
    const v = (await unscoped(() => this.prisma.systemSetting.findUnique({ where: { key: CONFIG_KEY } })))?.value as Partial<RadioWhitelistConfig> | undefined;
    return { ...DEFAULT_CONFIG, ...v, roleSync: { ...DEFAULT_CONFIG.roleSync, ...v?.roleSync }, requests: { ...DEFAULT_CONFIG.requests, ...v?.requests, panel: { ...DEFAULT_PANEL, ...v?.requests?.panel }, form: normalizeForm(v?.requests?.form) } };
  }
  private async saveConfig(actor: Actor, next: RadioWhitelistConfig, action: string, before: unknown, after: unknown) {
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: CONFIG_KEY }, create: { key: CONFIG_KEY, value: next as unknown as Prisma.InputJsonValue }, update: { value: next as unknown as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action, module: MODULE, entityType: 'RadioWhitelistConfig', before, after, serverId: null }, tx);
    });
    return next;
  }
  async updateRoleConfig(actor: Actor, b: { roleSync: RadioRoleRules; radioRoleIds: string[] }) {
    const cur = await this.config();
    return this.saveConfig(actor, { ...cur, roleSync: b.roleSync, radioRoleIds: b.radioRoleIds }, 'radio.config.roles', { roleSync: cur.roleSync, radioRoleIds: cur.radioRoleIds }, b);
  }
  async updateRequestConfig(actor: Actor, b: { requests: RadioWhitelistConfig['requests']; notifyMembers: boolean }) {
    const cur = await this.config();
    return this.saveConfig(actor, { ...cur, requests: { ...b.requests, form: normalizeForm(b.requests.form) }, notifyMembers: b.notifyMembers }, 'radio.config.requests', { requests: cur.requests, notifyMembers: cur.notifyMembers }, b);
  }

  /** Antrags-Panel in den eingestellten Kanal setzen bzw. dort aktualisieren (gleiche Nachricht, kein Doppel). */
  async postRequestPanel(actor: Actor) {
    const cfg = await this.config();
    const p = cfg.requests.panel;
    if (!p.channelId) throw new AppError('VALIDATION_FAILED', 'Bitte zuerst einen Kanal für das Antrags-Panel wählen und speichern.');
    if (!cfg.requests.enabled) throw new AppError('VALIDATION_FAILED', 'Anträge über Discord sind ausgeschaltet – das Panel hätte keine Funktion.');
    await this.prisma.$transaction(async (tx) => {
      await tx.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId: p.channelId, stateKey: PANEL_STATE_KEY, message: {
        embeds: [{ title: p.title.slice(0, 256), description: p.text.slice(0, 4000), color: hexColor(p.color) }],
        buttons: [{ id: 'rwreq:open', label: p.buttonLabel.slice(0, 80), style: 'primary', emoji: '🎙️' }],
      } } as Prisma.InputJsonValue } });
      await this.audit.record(actor, { action: 'radio.panel.posted', module: MODULE, entityType: 'RadioWhitelistConfig', after: { channelId: p.channelId }, serverId: null }, tx);
    });
    return { queued: true };
  }

  /** Meldung eines Antrags für die Leitung: offen mit Buttons Genehmigen/Ablehnen, nach der Entscheidung ohne Buttons. */
  private requestMessage(r: RadioRequest, decidedBy?: string | null) {
    const answers = Array.isArray(r.answers) ? (r.answers as { label: string; value: string }[]) : [];
    const lines = [`**Mitglied:** <@${r.discordId}> (${r.discordId})`, ...(r.rank ? [`**Dienstgrad:** ${r.rank}`] : []), ...(r.department ? [`**Abteilung:** ${r.department}`] : []), `**Begründung:** ${r.reason}`, ...answers.map((a) => `**${a.label}:** ${a.value}`)];
    if (r.status === 'PENDING') {
      return {
        embeds: [{ title: '🎙️ Antrag auf Funkfreigabe', description: lines.join('\n').slice(0, 3900), color: 0x3b82f6 }],
        buttons: [{ id: `rwreq:approve:${r.id}`, label: 'Genehmigen', style: 'success', emoji: '✅' }, { id: `rwreq:reject:${r.id}`, label: 'Ablehnen', style: 'danger', emoji: '❌' }],
      };
    }
    const ok = r.status === 'APPROVED';
    const head = `${ok ? '✅ Genehmigt' : '❌ Abgelehnt'}${decidedBy ? ` von ${decidedBy}` : ''}${r.decisionReason ? `\n**Grund:** ${r.decisionReason}` : ''}${ok && r.grantExpiresAt ? `\n**Gültig bis:** ${this.day(r.grantExpiresAt)}` : ''}`;
    return { embeds: [{ title: '🎙️ Antrag auf Funkfreigabe', description: `${lines.join('\n')}\n\n${head}`.slice(0, 3900), color: ok ? 0x22c55e : 0xef4444 }], buttons: [] };
  }

  /** Der eine fest konfigurierte Discord-Server: DISCORD_GUILD_ID, sonst Einstellungen → Discord, sonst der einzige gemeldete Server. */
  async mainGuildId(): Promise<string | null> {
    const env = (process.env.DISCORD_GUILD_ID ?? '').split(/[\s,;]+/).find((g) => DISCORD_ID.test(g));
    if (env) return env;
    return unscoped(async () => {
      const ch = (await this.prisma.systemSetting.findUnique({ where: { key: 'discord.channels' } }))?.value as { guildId?: string } | undefined;
      if (ch?.guildId && DISCORD_ID.test(ch.guildId)) return ch.guildId;
      const reported = await this.discord.reportedGuilds().catch(() => []);
      return reported.length === 1 ? reported[0]!.id : null;
    });
  }
  private async radioRoleIds(cfg?: RadioWhitelistConfig): Promise<string[]> {
    const c = cfg ?? (await this.config());
    if (c.radioRoleIds.length) return c.radioRoleIds;
    const ch = await unscoped(() => this.discord.channels());
    return (ch.radioRole ?? '').split(/[\s,;]+/).filter((r) => DISCORD_ID.test(r));
  }

  // ================= Lesen =================
  private where(status: StatusFilter, q?: string): Prisma.RadioGrantWhereInput {
    const now = new Date();
    const notArchived = { archivedAt: null };
    const byStatus: Record<StatusFilter, Prisma.RadioGrantWhereInput> = {
      active: { ...notArchived, status: 'ACTIVE', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      expired: { ...notArchived, OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiresAt: { lte: now } }] },
      suspended: { ...notArchived, status: 'SUSPENDED' },
      pending: { ...notArchived, status: 'PENDING' },
      disabled: { ...notArchived, status: 'DISABLED' },
      revoked: { OR: [{ status: 'REVOKED' }, { archivedAt: { not: null } }] },
      open: notArchived,
      all: {},
    };
    const and: Prisma.RadioGrantWhereInput[] = [byStatus[status]];
    const s = q?.trim();
    if (s) {
      const like = { contains: s, mode: 'insensitive' as const };
      and.push({ OR: [{ discordId: { contains: s } }, { discordName: like }, { rank: like }, { department: like }, { externalName: like }, { reason: like }] });
    }
    return { AND: and };
  }

  async list(f: { status?: StatusFilter; q?: string; page: number; pageSize: number }) {
    const where = this.where(f.status ?? 'open', f.q);
    const [rows, total] = await Promise.all([
      this.prisma.radioGrant.findMany({ where, orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { updatedAt: 'desc' }], skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.prisma.radioGrant.count({ where }),
    ]);
    return { items: await this.views(rows), total, page: f.page, pageSize: f.pageSize };
  }

  async counts() {
    const keys: StatusFilter[] = ['active', 'suspended', 'expired', 'pending', 'disabled', 'revoked'];
    const [values, requests, manual] = await Promise.all([
      Promise.all(keys.map((k) => this.prisma.radioGrant.count({ where: this.where(k) }))),
      this.prisma.radioRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.radioGrant.count({ where: { externalStatus: 'MANUAL' } }),
    ]);
    return { ...Object.fromEntries(keys.map((k, i) => [k, values[i]])), openRequests: requests, manualTodo: manual };
  }

  async get(id: string) {
    const g = await this.prisma.radioGrant.findUnique({ where: { id } });
    if (!g) throw new AppError('NOT_FOUND', 'Freigabe nicht gefunden.');
    const [view] = await this.views([g]);
    const history = await this.prisma.auditLog.findMany({ where: { entityType: 'RadioGrant', entityId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, reason: true, createdAt: true, actorUserId: true, result: true } });
    const names = await this.userNames(history.map((h) => h.actorUserId));
    const requests = g.discordId ? await this.prisma.radioRequest.findMany({ where: { discordId: g.discordId }, orderBy: { createdAt: 'desc' }, take: 20 }) : [];
    return { ...view!, history: history.map((h) => ({ ...h, actorName: h.actorUserId ? names.get(h.actorUserId) ?? 'Unbekannt' : 'System' })), requests: await this.requestViews(requests) };
  }

  private async userNames(ids: (string | null | undefined)[]) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    const users = list.length ? await this.prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private async views(rows: RadioGrant[]) {
    const names = await this.userNames(rows.flatMap((r) => [r.userId, r.grantedById]));
    const now = new Date();
    return rows.map((g) => ({
      id: g.id, discordId: g.discordId, discordName: g.discordName, userId: g.userId, userName: g.userId ? names.get(g.userId) ?? null : null,
      rank: g.rank, department: g.department, externalName: g.externalName, status: g.status, effectiveStatus: g.archivedAt ? 'REVOKED' : effectiveRadioStatus(g, now),
      authorized: !g.archivedAt && isRadioAuthorized(g, now), source: g.source, reason: g.reason, expiresAt: g.expiresAt, suspendedUntil: g.suspendedUntil,
      suspendReason: g.suspendReason, roleRevoked: g.roleRevoked, grantedAt: g.grantedAt, grantedByName: g.grantedById ? names.get(g.grantedById) ?? null : null,
      archivedAt: g.archivedAt, externalStatus: g.externalStatus, externalSyncedAt: g.externalSyncedAt, externalError: g.externalError,
      version: g.version, createdAt: g.createdAt, updatedAt: g.updatedAt,
    }));
  }

  // ================= Freigaben ändern =================
  /** Vorbelegung aus vorhandenen Daten (Dashboard-Konto, Leitstellen-Teamdaten mit Zello-Namen, Discord-Livedaten). */
  private async prefill(discordId: string) {
    const link = await this.prisma.discordLink.findUnique({ where: { discordId } });
    const member = await unscoped(() => this.prisma.cadMember.findFirst({ where: { discordId }, orderBy: { updatedAt: 'desc' } }));
    const personnel = link ? await this.prisma.user.findUnique({ where: { id: link.userId }, select: { displayName: true, personnel: { ...onePersonnel(), select: { rank: true } } } }) : null;
    const liveName = this.live.getMembers().members.find((m) => m.id === discordId)?.displayName;
    return {
      userId: link?.userId ?? null, discordName: liveName ?? member?.discordName ?? personnel?.displayName ?? null,
      rank: member?.rank ?? personnel?.personnel[0]?.rank ?? null, department: member?.department ?? null, externalName: member?.zelloName ?? null,
    };
  }

  /** Neue Freigabe oder Wiederherstellung einer archivierten (gleiche Discord-ID = gleicher Eintrag, Historie bleibt). */
  private async upsertGrant(tx: Tx, actor: Actor, b: GrantInput & { source: string; userId?: string | null }, opts: { allowExisting?: boolean } = {}) {
    const pre = await this.prefill(b.discordId);
    const existing = await tx.radioGrant.findUnique({ where: { discordId: b.discordId } });
    const status = b.status ?? 'ACTIVE';
    const data = {
      discordName: clip(b.discordName, 100) ?? existing?.discordName ?? pre.discordName, userId: b.userId ?? existing?.userId ?? pre.userId,
      // per Antrag: Dienstgrad/Abteilung aus Personalakte bzw. Leitstelle, dann bisheriger Eintrag – die Formularangabe nur als letzte Möglichkeit
      ...(b.source === 'REQUEST'
        ? { rank: pre.rank ?? existing?.rank ?? clip(b.rank, 80), department: pre.department ?? existing?.department ?? clip(b.department, 80) }
        : { rank: clip(b.rank, 80) ?? existing?.rank ?? pre.rank, department: clip(b.department, 80) ?? existing?.department ?? pre.department }),
      externalName: clip(b.externalName, 100) ?? existing?.externalName ?? pre.externalName,
      status, source: b.source, reason: clip(b.reason, 1000), expiresAt: b.expiresAt ?? null, suspendedUntil: null, suspendReason: null, statusBeforeSuspend: null,
      roleRevoked: false, archivedAt: null, grantedById: status === 'ACTIVE' ? actor.userId : null, grantedAt: status === 'ACTIVE' ? new Date() : null,
    };
    if (existing && !existing.archivedAt && existing.status !== 'REVOKED' && !opts.allowExisting) {
      throw new AppError('CONFLICT', `Für ${existing.discordName ?? existing.discordId} gibt es bereits einen Eintrag (Status: ${effectiveRadioStatus(existing)}). Bitte dort aktivieren, verlängern oder entsperren.`);
    }
    const before = existing;
    const row = existing
      ? await tx.radioGrant.update({ where: { id: existing.id }, data: { ...data, version: { increment: 1 } } })
      : await tx.radioGrant.create({ data: { ...data, discordId: b.discordId } });
    await this.audit.record(actor, {
      action: existing ? 'radio.grant.restored' : 'radio.grant.created', module: MODULE, entityType: 'RadioGrant', entityId: row.id, reason: b.reason, serverId: null,
      before: before ? this.summary(before) : undefined, after: this.summary(row),
    }, tx);
    return { row, before };
  }

  private summary(g: RadioGrant) {
    return { discordId: g.discordId, discordName: g.discordName, status: g.status, source: g.source, expiresAt: g.expiresAt, suspendedUntil: g.suspendedUntil, externalName: g.externalName, rank: g.rank, department: g.department, archived: !!g.archivedAt };
  }

  async create(actor: Actor, b: GrantInput) {
    if (b.expiresAt && b.expiresAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Das Ablaufdatum muss in der Zukunft liegen.');
    const { row, before } = await this.prisma.$transaction((tx) => this.upsertGrant(tx, actor, { ...b, source: 'MANUAL' }));
    await this.afterChange(row, before, row.status === 'ACTIVE' ? `✅ Du wurdest für den Funkdienst freigeschaltet${row.expiresAt ? ` (bis ${this.day(row.expiresAt)})` : ''}.` : null, b.reason);
    return (await this.views([row]))[0]!;
  }

  /**
   * Zustandswechsel mit optimistischer Sperre (version). `from` = erlaubte tatsächliche Ausgangsstatus.
   */
  private async transition(actor: Actor, id: string, o: { from: string[]; action: string; reason?: string | null; version?: number; data: (g: RadioGrant) => Prisma.RadioGrantUpdateManyMutationInput; dm?: (g: RadioGrant) => string | null; fromError?: string }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const g = await tx.radioGrant.findUnique({ where: { id } });
      if (!g) throw new AppError('NOT_FOUND', 'Freigabe nicht gefunden.');
      if (o.version !== undefined && o.version !== g.version) throw new AppError('CONFLICT', 'Der Eintrag wurde inzwischen geändert. Bitte neu laden.');
      const eff = g.archivedAt ? 'REVOKED' : effectiveRadioStatus(g);
      if (!o.from.includes(eff)) throw new AppError('INVALID_TRANSITION', o.fromError ?? `Nicht möglich bei Status „${eff}“.`);
      const r = await tx.radioGrant.updateMany({ where: { id, version: g.version }, data: { ...o.data(g), version: g.version + 1 } });
      if (r.count === 0) throw new AppError('CONFLICT', 'Der Eintrag wurde gleichzeitig geändert. Bitte neu laden.');
      const after = (await tx.radioGrant.findUnique({ where: { id } }))!;
      await this.audit.record(actor, { action: o.action, module: MODULE, entityType: 'RadioGrant', entityId: id, reason: o.reason ?? undefined, before: this.summary(g), after: this.summary(after), serverId: null }, tx);
      return { before: g, after };
    });
    await this.afterChange(result.after, result.before, o.dm?.(result.after) ?? null, o.reason ?? null);
    return (await this.views([result.after]))[0]!;
  }

  update(actor: Actor, id: string, b: { version: number; discordName?: string | null; rank?: string | null; department?: string | null; externalName?: string | null; reason?: string | null }) {
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'EXPIRED', 'REVOKED'], action: 'radio.grant.updated', version: b.version,
      data: (g) => ({
        ...(b.discordName !== undefined ? { discordName: clip(b.discordName, 100) } : {}), ...(b.rank !== undefined ? { rank: clip(b.rank, 80) } : {}),
        ...(b.department !== undefined ? { department: clip(b.department, 80) } : {}), ...(b.reason !== undefined ? { reason: clip(b.reason, 1000) } : {}),
        ...(b.externalName !== undefined ? { externalName: clip(b.externalName, 100), ...(b.externalName !== g.externalName && g.externalStatus === 'SYNCED' ? { externalStatus: 'PENDING' } : {}) } : {}),
      }),
    });
  }

  activate(actor: Actor, id: string, b: { reason?: string | null; expiresAt?: Date | null; version?: number }) {
    if (b.expiresAt && b.expiresAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Das Ablaufdatum muss in der Zukunft liegen.');
    return this.transition(actor, id, {
      from: ['PENDING', 'DISABLED', 'EXPIRED'], action: 'radio.grant.activated', reason: b.reason, version: b.version,
      fromError: 'Nur ausstehende, deaktivierte oder abgelaufene Freigaben können aktiviert werden (Sperren über „Entsperren“, entzogene über „Erneut freischalten“).',
      data: (g) => ({ status: 'ACTIVE', roleRevoked: false, grantedById: actor.userId, grantedAt: new Date(), expiresAt: b.expiresAt !== undefined ? b.expiresAt : g.expiresAt && g.expiresAt.getTime() > Date.now() ? g.expiresAt : null }),
      dm: (g) => `✅ Deine Funkfreigabe ist aktiv${g.expiresAt ? ` (bis ${this.day(g.expiresAt)})` : ''}.`,
    });
  }

  deactivate(actor: Actor, id: string, b: { reason: string; version?: number }) {
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'EXPIRED'], action: 'radio.grant.deactivated', reason: b.reason, version: b.version,
      data: () => ({ status: 'DISABLED', roleRevoked: false }), dm: () => '⏸️ Deine Funkfreigabe wurde deaktiviert.',
    });
  }

  extend(actor: Actor, id: string, b: { expiresAt: Date | null; reason?: string | null; version?: number }) {
    if (b.expiresAt && b.expiresAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Das neue Ablaufdatum muss in der Zukunft liegen.');
    return this.transition(actor, id, {
      from: ['ACTIVE', 'EXPIRED', 'PENDING'], action: 'radio.grant.extended', reason: b.reason, version: b.version,
      fromError: 'Verlängern geht nur bei aktiven, abgelaufenen oder ausstehenden Freigaben.',
      data: (g) => ({ expiresAt: b.expiresAt, ...(effectiveRadioStatus(g) === 'EXPIRED' ? { status: 'ACTIVE' } : {}) }),
      dm: (g) => (g.status === 'ACTIVE' ? `⏳ Deine Funkfreigabe gilt jetzt ${g.expiresAt ? `bis ${this.day(g.expiresAt)}` : 'unbefristet'}.` : null),
    });
  }

  suspend(actor: Actor, id: string, b: { reason: string; until?: Date | null; version?: number }) {
    if (b.until && b.until.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Das Ende der Sperre muss in der Zukunft liegen.');
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'DISABLED', 'EXPIRED'], action: 'radio.grant.suspended', reason: b.reason, version: b.version,
      data: (g) => ({ status: 'SUSPENDED', statusBeforeSuspend: effectiveRadioStatus(g), suspendedUntil: b.until ?? null, suspendReason: clip(b.reason, 500) }),
      dm: (g) => `⛔ Deine Funkfreigabe wurde gesperrt${g.suspendedUntil ? ` bis ${this.day(g.suspendedUntil)}` : ''}.\n**Grund:** ${b.reason}`,
    });
  }

  unsuspend(actor: Actor, id: string, b: { reason?: string | null; version?: number }) {
    return this.transition(actor, id, {
      from: ['SUSPENDED'], action: 'radio.grant.unsuspended', reason: b.reason, version: b.version, fromError: 'Der Eintrag ist nicht gesperrt.',
      data: (g) => ({ status: g.statusBeforeSuspend === 'EXPIRED' ? 'EXPIRED' : g.statusBeforeSuspend ?? 'ACTIVE', statusBeforeSuspend: null, suspendedUntil: null, suspendReason: null }),
      dm: (g) => (g.status === 'ACTIVE' ? '✅ Die Sperre deiner Funkfreigabe wurde aufgehoben.' : null),
    });
  }

  /** Freigabe entziehen = archivieren (nie löschen). */
  revoke(actor: Actor, id: string, b: { reason: string; version?: number }, action = 'radio.grant.revoked') {
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'EXPIRED'], action, reason: b.reason, version: b.version, fromError: 'Die Freigabe ist bereits entzogen.',
      data: () => ({ status: 'REVOKED', archivedAt: new Date(), roleRevoked: false, suspendedUntil: null, statusBeforeSuspend: null }),
      dm: () => `❌ Deine Funkfreigabe wurde entzogen.\n**Grund:** ${b.reason}`,
    });
  }

  /** Archivierte/entzogene Freigabe erneut erteilen (gleicher Eintrag, Historie bleibt). */
  async restore(actor: Actor, id: string, b: { reason: string; expiresAt?: Date | null }) {
    const g = await this.prisma.radioGrant.findUnique({ where: { id } });
    if (!g) throw new AppError('NOT_FOUND', 'Freigabe nicht gefunden.');
    if (!g.discordId) throw new AppError('VALIDATION_FAILED', 'Bitte zuerst die Discord-ID eintragen.');
    if (!g.archivedAt && g.status !== 'REVOKED') throw new AppError('INVALID_TRANSITION', 'Die Freigabe ist nicht entzogen.');
    return this.create(actor, { discordId: g.discordId, reason: b.reason, expiresAt: b.expiresAt ?? null });
  }

  /** Discord-ID bei übernommenen Alt-Einträgen nachtragen. */
  async setDiscordId(actor: Actor, id: string, discordId: string) {
    if (await this.prisma.radioGrant.findUnique({ where: { discordId } })) throw new AppError('CONFLICT', 'Für diese Discord-ID gibt es bereits einen Eintrag.');
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'EXPIRED', 'REVOKED'], action: 'radio.grant.discord_id_set',
      data: (g) => { if (g.discordId) throw new AppError('CONFLICT', 'Die Discord-ID ist bereits gesetzt und kann nicht geändert werden.'); return { discordId }; },
    });
  }

  /** Manueller Funkdienst: Änderung im Funkdienst erledigt (z. B. in der Zello-App als vertrauenswürdig markiert). */
  async markExternalDone(actor: Actor, id: string) {
    return this.transition(actor, id, {
      from: ['PENDING', 'ACTIVE', 'DISABLED', 'SUSPENDED', 'EXPIRED', 'REVOKED'], action: 'radio.grant.external_done', reason: 'Im Funkdienst manuell erledigt',
      data: (g) => { if (g.externalStatus !== 'MANUAL') throw new AppError('INVALID_TRANSITION', 'Für diesen Eintrag ist im Funkdienst nichts zu erledigen.'); return { externalStatus: 'MANUAL_DONE', externalSyncedAt: new Date(), externalError: null }; },
    });
  }

  private day(d: Date) { return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }); }

  /**
   * Folgen einer Änderung (nach dem Commit, Fehler stören den Fachprozess nicht): Discord-Funkrolle, Funkdienst, DM an das Mitglied.
   */
  private async afterChange(after: RadioGrant, before: RadioGrant | null, dm: string | null, reason?: string | null, opts: { forceDm?: boolean } = {}) {
    // „vorher berechtigt“ ohne Blick auf das Ablaufdatum: eine abgelaufene, noch als ACTIVE gespeicherte Freigabe hat Rolle/Kanal noch
    const was = !!before && !before.archivedAt && before.status === 'ACTIVE', now = !after.archivedAt && isRadioAuthorized(after);
    try {
      const cfg = await this.config();
      if (after.discordId && was !== now) {
        const roles = await this.radioRoleIds(cfg);
        if (roles.length) await this.prisma.discordOutbox.create({ data: { type: 'member.roles', channelKey: 'announcements', payload: { discordId: after.discordId, add: now ? roles : [], remove: now ? [] : roles } } });
      }
      if (dm && after.discordId && (cfg.notifyMembers || opts.forceDm)) {
        await this.prisma.discordOutbox.create({ data: { type: 'bot.dm', channelKey: 'announcements', payload: { discordId: after.discordId, message: { embeds: [{ title: '🎙️ Funk-Whitelist', description: dm.slice(0, 3900), color: now ? 0x22c55e : 0xef4444 }] } } as Prisma.InputJsonValue } });
      }
      const ext = await this.integrationRow();
      const extChanged = was !== now || (before && before.externalName !== after.externalName);
      if (extChanged && (after.externalName || before?.externalName)) {
        if (ext.provider === 'ZELLO_WORK') {
          await this.prisma.radioGrant.update({ where: { id: after.id }, data: { externalStatus: 'PENDING' } });
          if (ext.autoSync && ext.status === 'CONNECTED') void this.runSync(null, [after.id]).catch((e) => this.log.warn(`auto sync failed: ${errMsg(e)}`));
        } else if (ext.provider === 'ZELLO_APP' || ext.provider === 'OTHER_MANUAL') {
          await this.prisma.radioGrant.update({ where: { id: after.id }, data: { externalStatus: 'MANUAL', externalError: null } });
        }
      } else if (extChanged && was !== now && (ext.provider === 'ZELLO_APP' || ext.provider === 'OTHER_MANUAL')) {
        await this.prisma.radioGrant.update({ where: { id: after.id }, data: { externalStatus: 'MANUAL', externalError: null } });
      }
    } catch (e) {
      this.log.warn(`follow-up for ${after.id}${reason ? ` (${reason.slice(0, 40)})` : ''} failed: ${errMsg(e)}`);
    }
  }

  // ================= Ablauf (Hintergrund) =================
  /** Abgelaufene Freigaben und abgelaufene Sperren speichern (jede Minute; mehrere Instanzen sicher über version). */
  async tick(now = new Date()) {
    const due = await this.prisma.radioGrant.findMany({ where: { archivedAt: null, OR: [{ status: 'ACTIVE', expiresAt: { lte: now } }, { status: 'SUSPENDED', suspendedUntil: { lte: now } }] }, take: 200 });
    let expired = 0, unsuspended = 0;
    for (const g of due) {
      const next = g.status === 'ACTIVE' ? 'EXPIRED' : effectiveRadioStatus(g, now);
      const action = g.status === 'ACTIVE' ? 'radio.grant.expired' : 'radio.grant.unsuspended';
      const done = await this.prisma.$transaction(async (tx) => {
        const r = await tx.radioGrant.updateMany({ where: { id: g.id, version: g.version }, data: { status: next, version: g.version + 1, ...(g.status === 'SUSPENDED' ? { suspendedUntil: null, suspendReason: null, statusBeforeSuspend: null } : {}) } });
        if (!r.count) return null;
        const after = (await tx.radioGrant.findUnique({ where: { id: g.id } }))!;
        await this.audit.record(SYSTEM, { action, module: MODULE, entityType: 'RadioGrant', entityId: g.id, reason: g.status === 'ACTIVE' ? 'Ablaufdatum erreicht (automatisch)' : 'Sperrfrist abgelaufen (automatisch)', before: this.summary(g), after: this.summary(after), serverId: null }, tx);
        return after;
      });
      if (!done) continue;
      if (g.status === 'ACTIVE') expired++; else unsuspended++;
      await this.afterChange(done, g, g.status === 'ACTIVE' ? '⌛ Deine befristete Funkfreigabe ist abgelaufen.' : next === 'ACTIVE' ? '✅ Deine Funk-Sperre ist abgelaufen – die Freigabe ist wieder aktiv.' : null);
    }
    return { expired, unsuspended };
  }

  // ================= Anträge =================
  private async requestViews(rows: RadioRequest[]) {
    const names = await this.userNames(rows.map((r) => r.decidedById));
    return rows.map((r) => ({ ...r, decidedByName: r.decidedById ? names.get(r.decidedById) ?? null : null }));
  }

  async listRequests(f: { status: 'PENDING' | 'DONE' | 'ALL'; q?: string; page: number; pageSize: number }) {
    const s = f.q?.trim();
    const where: Prisma.RadioRequestWhereInput = {
      ...(f.status === 'PENDING' ? { status: 'PENDING' } : f.status === 'DONE' ? { status: { not: 'PENDING' } } : {}),
      ...(s ? { OR: [{ discordId: { contains: s } }, { discordName: { contains: s, mode: 'insensitive' } }, { rank: { contains: s, mode: 'insensitive' } }, { department: { contains: s, mode: 'insensitive' } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.radioRequest.findMany({ where, orderBy: f.status === 'PENDING' ? { createdAt: 'asc' } : { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize }),
      this.prisma.radioRequest.count({ where }),
    ]);
    return { items: await this.requestViews(rows), total, page: f.page, pageSize: f.pageSize };
  }

  /** Antrag über Discord (Bot-Dienst; Identität = Discord-ID der Interaktion). */
  async createRequest(b: { guildId: string | null; discordId: string; discordName?: string | null; rank?: string | null; department?: string | null; reason: string; answers?: Record<string, string> }) {
    const cfg = await this.config();
    if (!cfg.requests.enabled) throw new AppError('CAPABILITY_UNAVAILABLE', 'Anträge auf Funkfreigabe sind derzeit deaktiviert.');
    const main = await this.mainGuildId();
    if (main && b.guildId && b.guildId !== main) throw new AppError('PERMISSION_DENIED', 'Anträge sind nur auf dem Hauptserver möglich.');
    const req = await this.prisma.$transaction(async (tx) => {
      // gleichzeitige Anträge desselben Mitglieds nacheinander prüfen
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'radio-request:' + b.discordId}))`;
      const grant = await tx.radioGrant.findUnique({ where: { discordId: b.discordId } });
      if (grant && !grant.archivedAt) {
        const eff = effectiveRadioStatus(grant);
        if (eff === 'ACTIVE') throw new AppError('CONFLICT', 'Du bist bereits für den Funk freigegeben.');
        if (eff === 'SUSPENDED') throw new AppError('CONFLICT', `Deine Funkfreigabe ist gesperrt${grant.suspendedUntil ? ` bis ${this.day(grant.suspendedUntil)}` : ''} – ein Antrag ist derzeit nicht möglich.`);
      }
      if (cfg.requests.preventDuplicates) {
        const open = await tx.radioRequest.findFirst({ where: { discordId: b.discordId, status: 'PENDING' } });
        if (open) throw new AppError('CONFLICT', `Du hast bereits einen offenen Antrag (seit ${this.day(open.createdAt)}).`);
      }
      // eigene Felder nur so, wie sie im Formular eingestellt sind (Beschriftung zum Zeitpunkt des Antrags gespeichert)
      const custom = cfg.requests.form.fields.filter((f) => !['reason', 'rank', 'department'].includes(f.key));
      for (const f of custom) if (f.required && !(b.answers?.[f.key] ?? '').trim()) throw new AppError('VALIDATION_FAILED', `Bitte „${f.label}“ ausfüllen.`);
      const answers = custom.map((f) => ({ key: f.key, label: f.label, value: (b.answers?.[f.key] ?? '').trim().slice(0, f.maxLength) })).filter((a) => a.value);
      // Dienstgrad-/Abteilungsfeld umbenannt (fragt etwas anderes, z. B. den Discord-Namen) → normale Antwort, nicht Dienstgrad/Abteilung
      const builtIn = (key: 'rank' | 'department', value: string | null | undefined) => {
        const f = cfg.requests.form.fields.find((x) => x.key === key);
        const v = clip(value?.trim() || null, 80);
        if (!f || !v || BUILT_IN_LABEL[key].test(f.label)) return v;
        answers.push({ key, label: f.label, value: v });
        return null;
      };
      const rank = builtIn('rank', b.rank), department = builtIn('department', b.department);
      const r = await tx.radioRequest.create({ data: { discordId: b.discordId, discordName: clip(b.discordName, 100), guildId: b.guildId, rank, department, reason: b.reason.slice(0, 1000), ...(answers.length ? { answers } : {}) } });
      await this.audit.record(SYSTEM, { action: 'radio.request.created', module: MODULE, entityType: 'RadioRequest', entityId: r.id, after: { discordId: r.discordId, discordName: r.discordName, rank: r.rank, department: r.department }, reason: r.reason, serverId: null }, tx);
      return r;
    });
    void this.notify.notifyPermission('radiowhitelist.requests', { type: 'RADIO_REQUEST', title: `🎙️ Neuer Antrag auf Funkfreigabe: ${req.discordName ?? req.discordId}`, body: req.reason.slice(0, 200), entityType: 'RadioRequest', entityId: req.id }).catch(() => undefined);
    if (cfg.requests.notifyChannelId) {
      await this.prisma.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId: cfg.requests.notifyChannelId, stateKey: requestStateKey(req.id), message: this.requestMessage(req) } as Prisma.InputJsonValue } }).catch(() => undefined);
    }
    return { id: req.id, status: req.status, createdAt: req.createdAt };
  }

  async decide(actor: Actor, id: string, b: { decision: 'APPROVE' | 'REJECT'; reason?: string | null; expiresAt?: Date | null }) {
    if (b.decision === 'REJECT' && (b.reason ?? '').trim().length < 3) throw new AppError('VALIDATION_FAILED', 'Bitte eine Begründung für die Ablehnung angeben.');
    if (b.expiresAt && b.expiresAt.getTime() <= Date.now()) throw new AppError('VALIDATION_FAILED', 'Das Ablaufdatum muss in der Zukunft liegen.');
    const out = await this.prisma.$transaction(async (tx) => {
      const status = b.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      const r = await tx.radioRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status, decidedById: actor.userId, decidedAt: new Date(), decisionReason: clip(b.reason?.trim() || null, 1000), grantExpiresAt: b.decision === 'APPROVE' ? b.expiresAt ?? null : null } });
      if (!r.count) {
        if (!(await tx.radioRequest.findUnique({ where: { id } }))) throw new AppError('NOT_FOUND', 'Antrag nicht gefunden.');
        throw new AppError('CONFLICT', 'Der Antrag wurde bereits bearbeitet.');
      }
      const req = (await tx.radioRequest.findUnique({ where: { id } }))!;
      let grant: { row: RadioGrant; before: RadioGrant | null } | null = null;
      if (b.decision === 'APPROVE') {
        const existing = await tx.radioGrant.findUnique({ where: { discordId: req.discordId } });
        if (existing && !existing.archivedAt && effectiveRadioStatus(existing) === 'SUSPENDED') throw new AppError('CONFLICT', 'Das Mitglied ist gesperrt – bitte zuerst die Sperre aufheben.');
        grant = await this.upsertGrant(tx, actor, { discordId: req.discordId, discordName: req.discordName, rank: req.rank, department: req.department, reason: b.reason?.trim() || `Antrag: ${req.reason}`.slice(0, 1000), expiresAt: b.expiresAt ?? null, source: 'REQUEST' }, { allowExisting: true });
        await tx.radioRequest.update({ where: { id }, data: { grantId: grant.row.id } });
      }
      await this.audit.record(actor, { action: b.decision === 'APPROVE' ? 'radio.request.approved' : 'radio.request.rejected', module: MODULE, entityType: 'RadioRequest', entityId: id, reason: b.reason ?? undefined, after: { discordId: req.discordId, grantId: grant?.row.id ?? null }, serverId: null }, tx);
      return { req, grant };
    });
    const text = b.decision === 'APPROVE'
      ? `✅ Dein Antrag auf Funkfreigabe wurde **genehmigt**${out.grant?.row.expiresAt ? ` (gültig bis ${this.day(out.grant.row.expiresAt)})` : ''}.${b.reason?.trim() ? `\n**Begründung:** ${b.reason.trim()}` : ''}`
      : `❌ Dein Antrag auf Funkfreigabe wurde **abgelehnt**.\n**Begründung:** ${(b.reason ?? '').trim()}`;
    if (out.grant) await this.afterChange(out.grant.row, out.grant.before, text, b.reason, { forceDm: true });
    // zusätzliche Rollen bei Genehmigung (Einstellungen für Anträge)
    const extra = b.decision === 'APPROVE' ? (await this.config()).requests.approveRoleIds.filter((r) => DISCORD_ID.test(r)) : [];
    if (extra.length) await this.prisma.discordOutbox.create({ data: { type: 'member.roles', channelKey: 'announcements', payload: { discordId: out.req.discordId, add: extra, remove: [] } } }).catch((e) => this.log.warn(`approve roles not queued: ${errMsg(e)}`));
    else await this.prisma.discordOutbox.create({ data: { type: 'bot.dm', channelKey: 'announcements', payload: { discordId: out.req.discordId, message: { embeds: [{ title: '🎙️ Funk-Whitelist', description: text.slice(0, 3900), color: 0xef4444 }] } } as Prisma.InputJsonValue } }).catch(() => undefined);
    const final = (await this.prisma.radioRequest.findUnique({ where: { id } }))!;
    const [view] = await this.requestViews([final]);
    // Meldung im Leitungskanal anpassen (Entscheidung eintragen, Buttons weg) – egal ob im Dashboard oder in Discord entschieden
    const cfg = await this.config();
    if (cfg.requests.notifyChannelId) {
      const link = actor.userId ? await this.prisma.discordLink.findUnique({ where: { userId: actor.userId } }) : null;
      const by = link ? `<@${link.discordId}>${view!.decidedByName ? ` (${view!.decidedByName})` : ''}` : view!.decidedByName;
      await this.prisma.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId: cfg.requests.notifyChannelId, stateKey: requestStateKey(id), message: this.requestMessage(final, by) } as Prisma.InputJsonValue } }).catch(() => undefined);
    }
    return view!;
  }

  /** Status für das Mitglied selbst (Bot: `/funkantrag status`). */
  async memberStatus(discordId: string) {
    const [grant, pending, cfg] = await Promise.all([
      this.prisma.radioGrant.findUnique({ where: { discordId } }),
      this.prisma.radioRequest.findFirst({ where: { discordId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } }),
      this.config(),
    ]);
    return {
      status: grant ? (grant.archivedAt ? 'REVOKED' : effectiveRadioStatus(grant)) : null, authorized: !!grant && !grant.archivedAt && isRadioAuthorized(grant),
      expiresAt: grant?.expiresAt ?? null, suspendedUntil: grant?.suspendedUntil ?? null, pendingSince: pending?.createdAt ?? null, requestsEnabled: cfg.requests.enabled, form: cfg.requests.form,
    };
  }

  // ================= Discord-Rollenabgleich =================
  async syncTargets() {
    const cfg = await this.config();
    const r = cfg.roleSync;
    if (!r.enabled) return { enabled: false, guildId: null, roleIds: [], discordIds: [] };
    const grants = await this.prisma.radioGrant.findMany({ where: { discordId: { not: null }, OR: [{ archivedAt: null }, { roleRevoked: true }] }, select: { discordId: true }, take: 5000 });
    return { enabled: true, guildId: await this.mainGuildId(), roleIds: [...new Set([...r.grantRoleIds, ...r.requiredRoleIds])], discordIds: grants.map((g) => g.discordId!) };
  }

  async requestRoleSync(actor: Actor) {
    const cfg = await this.config();
    if (!cfg.roleSync.enabled) throw new AppError('VALIDATION_FAILED', 'Der Rollenabgleich ist ausgeschaltet.');
    const guildId = await this.mainGuildId();
    if (!guildId) throw new AppError('VALIDATION_FAILED', 'Kein Discord-Server konfiguriert (DISCORD_GUILD_ID bzw. Einstellungen → Discord).');
    await this.prisma.$transaction(async (tx) => {
      await tx.discordOutbox.create({ data: { type: 'bot.radio.rolesync', channelKey: 'announcements', payload: { guildId } } });
      await this.audit.record(actor, { action: 'radio.rolesync.requested', module: MODULE, entityType: 'RadioWhitelistConfig', serverId: null }, tx);
    });
    return { queued: true };
  }

  async roleSyncStatus() {
    // nie `null` zurückgeben – eine leere Antwort versteht das Dashboard nicht als JSON
    return ((await unscoped(() => this.prisma.systemSetting.findUnique({ where: { key: ROLESYNC_STATUS_KEY } })))?.value as Record<string, unknown> | undefined) ?? {};
  }

  /**
   * Rollenstand von Mitgliedern (vom Bot gemeldet) anwenden. Die Entscheidung trifft allein der Server anhand der Regeln.
   * `roleIds: null` = nicht (mehr) auf dem Server.
   */
  async applyRoleSnapshot(guildId: string, members: { discordId: string; name?: string | null; roleIds: string[] | null }[], full = false) {
    const cfg = await this.config();
    if (!cfg.roleSync.enabled) return { enabled: false, checked: 0, changed: 0, failed: 0 };
    const main = await this.mainGuildId();
    if (main && guildId !== main) throw new AppError('PERMISSION_DENIED', 'Rollen werden nur vom konfigurierten Discord-Server übernommen.');
    let changed = 0, failed = 0;
    const errors: string[] = [];
    for (const m of members) {
      try {
        if (await this.applyMember(cfg.roleSync, m)) changed++;
      } catch (e) {
        failed++;
        const msg = e instanceof AppError ? e.message : errMsg(e);
        errors.push(`${m.discordId}: ${msg}`);
        await this.audit.record(SYSTEM, { action: 'radio.rolesync.failed', module: MODULE, entityType: 'DiscordMember', entityId: m.discordId, reason: msg, result: 'FAILED', serverId: null }).catch(() => undefined);
      }
    }
    const status = { at: new Date().toISOString(), full, checked: members.length, changed, failed, ok: failed === 0, errors: errors.slice(0, 20) };
    const prev = await this.roleSyncStatus();
    const value = { ...prev, last: status, ...(failed === 0 ? { lastSuccessAt: status.at } : { lastErrorAt: status.at }) };
    await unscoped(() => this.prisma.systemSetting.upsert({ where: { key: ROLESYNC_STATUS_KEY }, create: { key: ROLESYNC_STATUS_KEY, value }, update: { value } }));
    if (full) await this.audit.record(SYSTEM, { action: failed ? 'radio.rolesync.failed' : 'radio.rolesync.completed', module: MODULE, entityType: 'RadioWhitelistConfig', after: { checked: members.length, changed, failed }, result: failed ? 'FAILED' : 'SUCCESS', serverId: null });
    return { enabled: true, checked: members.length, changed, failed };
  }

  private async applyMember(rules: RadioRoleRules, m: { discordId: string; name?: string | null; roleIds: string[] | null }): Promise<boolean> {
    const grant = await this.prisma.radioGrant.findUnique({ where: { discordId: m.discordId } });
    if (grant && m.name && grant.discordName !== m.name) await this.prisma.radioGrant.update({ where: { id: grant.id }, data: { discordName: m.name.slice(0, 100) } });
    const action = radioRoleSyncAction(rules, m.roleIds, grant ? { ...grant, archived: !!grant.archivedAt } : null);
    const reason = 'Discord-Rollenabgleich';
    switch (action.kind) {
      case 'none': return false;
      case 'create': {
        const { row, before } = await this.prisma.$transaction((tx) => this.upsertGrant(tx, SYSTEM, { discordId: m.discordId, discordName: m.name ?? null, reason: 'Über Discord-Rolle', status: action.status, source: 'ROLE' }));
        await this.afterChange(row, before, action.status === 'ACTIVE' ? '✅ Du wurdest über deine Discord-Rolle für den Funkdienst freigeschaltet.' : null, reason);
        return true;
      }
      case 'reactivate': {
        await this.transition(SYSTEM, grant!.id, {
          from: ['REVOKED', 'DISABLED'], action: 'radio.grant.role_restored', reason,
          data: () => ({ status: action.status, archivedAt: null, roleRevoked: false, ...(action.status === 'ACTIVE' ? { grantedAt: new Date(), grantedById: null } : {}) }),
          dm: () => (action.status === 'ACTIVE' ? '✅ Deine Funkfreigabe ist über deine Discord-Rolle wieder aktiv.' : null),
        });
        return true;
      }
      case 'disable':
        await this.transition(SYSTEM, grant!.id, { from: ['PENDING', 'ACTIVE', 'EXPIRED'], action: 'radio.grant.role_disabled', reason, data: () => ({ status: 'DISABLED', roleRevoked: true }), dm: () => '⏸️ Deine Funkfreigabe wurde deaktiviert, weil dir die erforderliche Discord-Rolle fehlt.' });
        return true;
      case 'revoke':
        await this.transition(SYSTEM, grant!.id, { from: ['PENDING', 'ACTIVE', 'EXPIRED', 'DISABLED'], action: 'radio.grant.role_revoked', reason, data: () => ({ status: 'REVOKED', archivedAt: new Date(), roleRevoked: true }), dm: () => '❌ Deine Funkfreigabe wurde entzogen, weil dir die erforderliche Discord-Rolle fehlt.' });
        return true;
    }
  }

  // ================= Externer Funkdienst =================
  private async integrationRow() {
    return unscoped(() => this.prisma.radioIntegration.upsert({ where: { id: 'default' }, create: { id: 'default' }, update: {} }));
  }

  async integration() {
    const r = await this.integrationRow();
    let endpoint: string | null = null;
    if (r.provider === 'ZELLO_WORK' && r.network) { try { endpoint = zelloBaseUrl(r.network); } catch { endpoint = null; } }
    const provider = RADIO_PROVIDERS.find((p) => p.key === r.provider) ?? RADIO_PROVIDERS[0];
    return {
      provider: r.provider, displayName: r.displayName, network: r.network, channel: r.channel, endpoint, adminUsername: r.adminUsername,
      hasPassword: !!r.passwordEnc, hasApiKey: !!r.apiKeyEnc, autoSync: r.autoSync, status: r.status, apiSupported: provider.apiSupported,
      lastTestAt: r.lastTestAt, lastSuccessAt: r.lastSuccessAt, lastSyncAt: r.lastSyncAt, lastSyncStatus: r.lastSyncStatus, lastError: r.lastError, version: r.version,
      providers: RADIO_PROVIDERS,
    };
  }

  async updateIntegration(actor: Actor, b: { provider: RadioProvider; displayName: string; network?: string | null; channel?: string | null; adminUsername?: string | null; password?: string; apiKey?: string; clearCredentials?: boolean; autoSync: boolean; version: number }) {
    const cur = await this.integrationRow();
    if (b.version !== cur.version) throw new AppError('CONFLICT', 'Die Einstellungen wurden inzwischen geändert. Bitte neu laden.');
    if (b.provider === 'ZELLO_WORK' && b.network) { try { zelloBaseUrl(b.network); } catch (e) { throw new AppError('VALIDATION_FAILED', errMsg(e)); } }
    if (b.autoSync && b.provider !== 'ZELLO_WORK') throw new AppError('VALIDATION_FAILED', 'Automatische Synchronisierung gibt es nur für Funkdienste mit unterstützter API (Zello Work).');
    const credsChanged = !!b.password || !!b.apiKey || !!b.clearCredentials || b.network !== cur.network || b.adminUsername !== cur.adminUsername || b.provider !== cur.provider;
    const data: Prisma.RadioIntegrationUpdateInput = {
      provider: b.provider, displayName: b.displayName.slice(0, 80), network: b.provider === 'ZELLO_WORK' ? b.network?.trim().toLowerCase() || null : null,
      channel: b.provider === 'ZELLO_WORK' ? b.channel?.trim() || null : null, adminUsername: b.provider === 'ZELLO_WORK' ? b.adminUsername?.trim() || null : null,
      ...(b.clearCredentials || b.provider !== 'ZELLO_WORK' ? { passwordEnc: null, apiKeyEnc: null } : {}),
      ...(b.password && b.provider === 'ZELLO_WORK' ? { passwordEnc: encryptSecret(b.password) } : {}),
      ...(b.apiKey && b.provider === 'ZELLO_WORK' ? { apiKeyEnc: encryptSecret(b.apiKey) } : {}),
      autoSync: b.autoSync, version: { increment: 1 },
      status: b.provider === 'NONE' ? 'NOT_CONFIGURED' : b.provider === 'ZELLO_WORK' ? (credsChanged ? 'NOT_CONFIGURED' : cur.status) : 'MANUAL',
      ...(credsChanged ? { lastError: null } : {}),
    };
    const pub = (x: { provider: string; displayName: string; network: string | null; channel: string | null; adminUsername: string | null; autoSync: boolean }) => ({ provider: x.provider, displayName: x.displayName, network: x.network, channel: x.channel, adminUsername: x.adminUsername, autoSync: x.autoSync });
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.radioIntegration.updateMany({ where: { id: 'default', version: cur.version }, data: { ...(data as Prisma.RadioIntegrationUpdateManyMutationInput), version: cur.version + 1 } });
      if (!r.count) throw new AppError('CONFLICT', 'Die Einstellungen wurden gleichzeitig geändert. Bitte neu laden.');
      const after = (await tx.radioIntegration.findUnique({ where: { id: 'default' } }))!;
      // Zugangsdaten nie ins Protokoll – nur, DASS sie geändert wurden
      await this.audit.record(actor, { action: 'radio.integration.updated', module: MODULE, entityType: 'RadioIntegration', entityId: 'default', before: pub(cur), after: { ...pub(after), changedCredentials: [b.password ? 'Passwort' : null, b.apiKey ? 'API-Schlüssel' : null, b.clearCredentials ? 'gelöscht' : null].filter(Boolean) }, serverId: null }, tx);
    });
    return this.integration();
  }

  private async credentials(): Promise<{ row: Awaited<ReturnType<RadioWhitelistService['integrationRow']>>; creds: ZelloCredentials }> {
    const row = await this.integrationRow();
    if (row.provider !== 'ZELLO_WORK') throw new AppError('CAPABILITY_UNAVAILABLE', 'Für den gewählten Funkdienst gibt es keine unterstützte API – automatische Synchronisierung ist nicht verfügbar.');
    if (!row.network || !row.channel || !row.adminUsername || !row.passwordEnc || !row.apiKeyEnc) throw new AppError('VALIDATION_FAILED', 'Bitte Netzwerk, Kanal, Administrator, Passwort und API-Schlüssel hinterlegen.');
    const password = decryptSecret(row.passwordEnc), apiKey = decryptSecret(row.apiKeyEnc);
    if (!password || !apiKey) throw new AppError('VALIDATION_FAILED', 'Die gespeicherten Zugangsdaten lassen sich nicht mehr entschlüsseln (Server-Schlüssel geändert?). Bitte neu eingeben.');
    return { row, creds: { network: row.network, username: row.adminUsername, password, apiKey } };
  }

  async testConnection(actor: Actor) {
    const { row, creds } = await this.credentials();
    const client = this.zelloFactory(creds);
    let ok = false, message: string;
    try {
      await client.login();
      ok = await client.channelExists(row.channel!);
      message = ok ? `Verbindung erfolgreich, Kanal „${row.channel}“ gefunden.` : `Anmeldung erfolgreich, aber der Kanal „${row.channel}“ existiert nicht.`;
    } catch (e) { message = errMsg(e); } finally { await client.logout().catch(() => undefined); }
    const now = new Date();
    await unscoped(() => this.prisma.radioIntegration.update({ where: { id: 'default' }, data: { status: ok ? 'CONNECTED' : 'ERROR', lastTestAt: now, ...(ok ? { lastSuccessAt: now, lastError: null } : { lastError: message }) } }));
    await this.audit.record(actor, { action: 'radio.integration.tested', module: MODULE, entityType: 'RadioIntegration', entityId: 'default', reason: message, result: ok ? 'SUCCESS' : 'FAILED', serverId: null });
    return { ok, message };
  }

  /**
   * Abgleich mit Zello Work: freigegebene Mitglieder (mit Zello-Benutzernamen) in den Kanal, alle anderen hinaus.
   * `ids` = nur diese Einträge. Läuft nie doppelt parallel.
   */
  async runSync(actor: Actor | null, ids?: string[]) {
    if (this.syncing) throw new AppError('CONFLICT', 'Eine Synchronisierung läuft bereits.');
    const { row, creds } = await this.credentials();
    this.syncing = true;
    const channel = row.channel!;
    const now = new Date();
    const grants = await this.prisma.radioGrant.findMany({ where: { ...(ids ? { id: { in: ids } } : {}), OR: [{ archivedAt: null }, { externalStatus: { in: ['SYNCED', 'PENDING', 'FAILED'] } }] } });
    const add = grants.filter((g) => !g.archivedAt && isRadioAuthorized(g, now));
    const remove = grants.filter((g) => !add.includes(g) && g.externalName && ['SYNCED', 'PENDING', 'FAILED'].includes(g.externalStatus));
    const result = new Map<string, { status: string; error: string | null }>();
    for (const g of add.filter((x) => !x.externalName)) result.set(g.id, { status: 'FAILED', error: 'Benutzername beim Funkdienst fehlt.' });
    const client = this.zelloFactory(creds);
    let fatal: string | null = null;
    try {
      await client.login();
      const batch = async (list: RadioGrant[], fn: (logins: string[]) => Promise<void>, okStatus: string, ignore404: boolean) => {
        if (!list.length) return;
        try { await fn(list.map((g) => g.externalName!)); for (const g of list) result.set(g.id, { status: okStatus, error: null }); }
        catch (e) {
          if (!(e instanceof ZelloError) || e.code !== '404') throw e;
          for (const g of list) { // einzeln, damit klar ist, wer fehlt
            try { await fn([g.externalName!]); result.set(g.id, { status: okStatus, error: null }); }
            catch (x) { if (ignore404 && x instanceof ZelloError && x.code === '404') result.set(g.id, { status: okStatus, error: null }); else if (x instanceof ZelloError && x.code === '404') result.set(g.id, { status: 'FAILED', error: 'Zello-Benutzer existiert im Netzwerk nicht.' }); else throw x; }
          }
        }
      };
      await batch(add.filter((g) => g.externalName), (l) => client.addToChannel(channel, l), 'SYNCED', false);
      await batch(remove, (l) => client.removeFromChannel(channel, l), 'NONE', true);
    } catch (e) { fatal = errMsg(e); } finally { await client.logout().catch(() => undefined); this.syncing = false; }
    if (fatal) for (const g of [...add, ...remove]) if (!result.has(g.id)) result.set(g.id, { status: 'FAILED', error: fatal });
    for (const [id, r] of result) await this.prisma.radioGrant.update({ where: { id }, data: { externalStatus: r.status, externalError: r.error, ...(r.error ? {} : { externalSyncedAt: new Date() }) } });
    const failed = [...result.values()].filter((r) => r.error).length;
    const ok = !fatal && failed === 0;
    const summary = fatal ? `Synchronisierung fehlgeschlagen: ${fatal}` : `${add.length - failed} hinzugefügt/bestätigt, ${remove.length} entfernt, ${failed} fehlgeschlagen.`;
    await unscoped(() => this.prisma.radioIntegration.update({ where: { id: 'default' }, data: { lastSyncAt: new Date(), lastSyncStatus: ok ? 'OK' : fatal ? 'ERROR' : 'PARTIAL', ...(ok ? { lastSuccessAt: new Date(), lastError: null, status: 'CONNECTED' } : { lastError: fatal ?? summary, ...(fatal ? { status: 'ERROR' } : {}) }) } }));
    await this.audit.record(actor ?? SYSTEM, { action: ok ? 'radio.sync.success' : 'radio.sync.failed', module: MODULE, entityType: 'RadioIntegration', entityId: 'default', reason: summary, after: { added: add.length, removed: remove.length, failed, scope: ids ? 'einzeln' : 'alle' }, result: ok ? 'SUCCESS' : 'FAILED', serverId: null });
    return { ok, message: summary, added: add.length, removed: remove.length, failed };
  }

  // ================= Export / Import =================
  async exportCsv(status: StatusFilter) {
    const rows = await this.prisma.radioGrant.findMany({ where: this.where(status), orderBy: { createdAt: 'asc' }, take: 10_000 });
    const now = new Date();
    const lines = [RADIO_CSV_COLUMNS.join(','), ...rows.map((g) => [g.discordId, g.discordName, g.externalName, g.archivedAt ? 'REVOKED' : effectiveRadioStatus(g, now), g.rank, g.department, g.expiresAt, g.reason].map(csvCell).join(','))];
    return `﻿${lines.join('\r\n')}\r\n`;
  }

  /**
   * CSV-Import (dokumentiert in docs/radio-whitelist.md): neue Discord-IDs werden als aktive manuelle Freigabe angelegt,
   * vorhandene nur um Name/Zello-Name/Dienstgrad/Abteilung ergänzt – Status werden NIE per Import geändert, nichts wird gelöscht.
   */
  async importCsv(actor: Actor, text: string, dryRun: boolean) {
    const { header, rows } = parseCsv(text);
    if (!header.includes('discord_id')) throw new AppError('VALIDATION_FAILED', 'Die CSV braucht eine Spalte „discord_id“ (Kopfzeile wie beim Export).');
    if (rows.length > 2000) throw new AppError('VALIDATION_FAILED', 'Höchstens 2000 Zeilen je Import.');
    const report = { created: 0, updated: 0, unchanged: 0, errors: [] as { line: number; message: string }[], dryRun };
    const seen = new Set<string>();
    const created: RadioGrant[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const { line, cells } of rows) {
        const id = cells.discord_id ?? '';
        if (!DISCORD_ID.test(id)) { report.errors.push({ line, message: `Ungültige Discord-ID „${id.slice(0, 30)}“.` }); continue; }
        if (seen.has(id)) { report.errors.push({ line, message: 'Discord-ID doppelt in der Datei.' }); continue; }
        seen.add(id);
        let expiresAt: Date | null = null;
        if (cells.expires_at) {
          const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(cells.expires_at) ? `${cells.expires_at}T23:59:59` : cells.expires_at);
          if (Number.isNaN(d.getTime())) { report.errors.push({ line, message: 'Ungültiges Ablaufdatum (JJJJ-MM-TT).' }); continue; }
          expiresAt = d;
        }
        const existing = await tx.radioGrant.findUnique({ where: { discordId: id } });
        if (existing) {
          const patch: Record<string, string> = {};
          for (const [col, field] of [['discord_name', 'discordName'], ['external_name', 'externalName'], ['rank', 'rank'], ['department', 'department']] as const) {
            const v = cells[col]?.slice(0, 100);
            if (v && v !== existing[field]) patch[field] = v;
          }
          if (!Object.keys(patch).length) { report.unchanged++; continue; }
          report.updated++;
          if (!dryRun) {
            await tx.radioGrant.update({ where: { id: existing.id }, data: { ...patch, version: { increment: 1 }, ...(patch.externalName && existing.externalStatus === 'SYNCED' ? { externalStatus: 'PENDING' } : {}) } });
            await this.audit.record(actor, { action: 'radio.grant.updated', module: MODULE, entityType: 'RadioGrant', entityId: existing.id, reason: `CSV-Import (Zeile ${line})`, before: this.summary(existing), after: patch, serverId: null }, tx);
          }
          continue;
        }
        if (expiresAt && expiresAt.getTime() <= Date.now()) { report.errors.push({ line, message: 'Ablaufdatum liegt in der Vergangenheit.' }); continue; }
        report.created++;
        if (!dryRun) created.push((await this.upsertGrant(tx, actor, { discordId: id, discordName: cells.discord_name || null, externalName: cells.external_name || null, rank: cells.rank || null, department: cells.department || null, reason: cells.reason || 'CSV-Import', expiresAt, source: 'MANUAL' })).row);
      }
      if (!dryRun) await this.audit.record(actor, { action: 'radio.import', module: MODULE, entityType: 'RadioWhitelistConfig', after: { created: report.created, updated: report.updated, errors: report.errors.length }, serverId: null }, tx);
    }, { timeout: 60_000 });
    for (const g of created) await this.afterChange(g, null, null);
    return report;
  }

  // ================= Protokoll =================
  async logs(f: { page: number; pageSize: number; q?: string }) {
    const s = f.q?.trim();
    const where: Prisma.AuditLogWhereInput = { AND: [{ OR: [{ module: MODULE }, { action: { in: ['radio.add', 'radio.remove'] } }] }, ...(s ? [{ OR: [{ action: { contains: s } }, { reason: { contains: s, mode: 'insensitive' as const } }, { entityId: { contains: s } }] }] : [])] };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (f.page - 1) * f.pageSize, take: f.pageSize, select: { id: true, action: true, entityType: true, entityId: true, reason: true, before: true, after: true, result: true, createdAt: true, actorUserId: true } }),
      this.prisma.auditLog.count({ where }),
    ]);
    const names = await this.userNames(rows.map((r) => r.actorUserId));
    return { items: rows.map((r) => ({ ...r, actorName: r.actorUserId ? names.get(r.actorUserId) ?? 'Unbekannt' : 'System' })), total, page: f.page, pageSize: f.pageSize };
  }

  // ================= Bisherige Schnittstelle (/radio-whitelist, Bot-Befehl /funkfreigabe) =================
  private async resolveTarget(t: { userId?: string; discordId?: string }) {
    if (t.discordId) {
      const user = await this.discord.resolveUser(t.discordId);
      return { discordId: t.discordId, user };
    }
    const user = await this.prisma.user.findUnique({ where: { id: t.userId! } });
    if (!user?.active) throw new AppError('NOT_FOUND', 'Benutzer nicht gefunden.');
    const link = await this.prisma.discordLink.findUnique({ where: { userId: user.id } });
    return { discordId: link?.discordId ?? null, user };
  }
  private async findByTarget(t: { discordId: string | null; user: { id: string } | null }) {
    if (t.discordId) return this.prisma.radioGrant.findUnique({ where: { discordId: t.discordId } });
    return t.user ? this.prisma.radioGrant.findFirst({ where: { userId: t.user.id, discordId: null } }) : null;
  }

  async legacyList() {
    const rows = await this.prisma.radioGrant.findMany({ where: this.where('active'), orderBy: { createdAt: 'asc' }, take: 1000 });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true, personnel: { ...onePersonnel(), select: { callsign: true, rank: true } } } });
    return rows.map((r) => { const u = users.find((x) => x.id === r.userId); return { id: r.id, userId: r.userId, discordId: r.discordId, displayName: r.discordName ?? u?.displayName ?? r.discordId ?? '—', callsign: u?.personnel[0]?.callsign ?? null, rank: r.rank ?? u?.personnel[0]?.rank ?? null, since: r.grantedAt ?? r.createdAt }; });
  }

  async legacyCheck(t: { userId?: string; discordId?: string }) {
    const target = await this.resolveTarget(t);
    const g = await this.findByTarget(target);
    return { whitelisted: !!g && !g.archivedAt && isRadioAuthorized(g), displayName: g?.discordName ?? target.user?.displayName ?? target.discordId ?? '—' };
  }

  async legacyAdd(actor: Actor, t: { userId?: string; discordId?: string }) {
    const target = await this.resolveTarget(t);
    if (!target.discordId) throw new AppError('VALIDATION_FAILED', `${target.user?.displayName ?? 'Dieses Konto'} ist nicht mit Discord verknüpft – bitte die Discord-ID angeben.`);
    const g = await this.findByTarget(target);
    const name = g?.discordName ?? target.user?.displayName ?? target.discordId;
    if (g && !g.archivedAt && isRadioAuthorized(g)) throw new AppError('CONFLICT', `${name} steht schon auf der Funk-Whitelist.`);
    if (g && !g.archivedAt && g.status !== 'REVOKED') {
      if (effectiveRadioStatus(g) === 'SUSPENDED') throw new AppError('CONFLICT', `${name} ist gesperrt – bitte die Sperre im Dashboard aufheben.`);
      await this.activate(actor, g.id, { reason: 'Über /funkfreigabe freigegeben', expiresAt: null });
    } else {
      await this.create(actor, { discordId: target.discordId, discordName: target.user?.displayName ?? null, reason: 'Über /funkfreigabe freigegeben' });
    }
    return { userId: target.user?.id ?? null, discordId: target.discordId, displayName: name, whitelisted: true };
  }

  async legacyRemove(actor: Actor, t: { userId?: string; discordId?: string }) {
    const target = await this.resolveTarget(t);
    const g = await this.findByTarget(target);
    const name = g?.discordName ?? target.user?.displayName ?? target.discordId ?? '—';
    if (!g || g.archivedAt || g.status === 'REVOKED') throw new AppError('NOT_FOUND', `${name} steht nicht auf der Funk-Whitelist.`);
    await this.revoke(actor, g.id, { reason: 'Über /funkfreigabe entfernt' });
    return { userId: target.user?.id ?? null, discordId: target.discordId, displayName: name, whitelisted: false };
  }
}
