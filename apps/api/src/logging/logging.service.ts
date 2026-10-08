import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LOG_CATEGORIES, LOG_DEFAULT_OFF, LOG_TYPES, logCategoryOf, logChannelFor, logTypeLabel, loggingConfigSchema, type LoggingConfig } from '@enrp/shared';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { AuditService, setAuditSink, type Actor, type AuditEntry } from '../audit/audit.service';
import { AppError } from '../common/errors';

const KEY = 'logging.config';
const CAT = (k: string) => LOG_CATEGORIES.find((c) => c.key === k);
const short = (v: unknown) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return (s ?? '—').length > 120 ? `${(s ?? '').slice(0, 117)}…` : s ?? '—'; };

/** Änderungen als Felder: bei vorher/nachher nur, was sich geändert hat (höchstens 8). */
function changeFields(before: unknown, after: unknown) {
  const obj = (x: unknown) => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
  const b = obj(before), a = obj(after);
  if (!a && !b) return [];
  if (!a) return [{ name: 'Vorher', value: short(before) }];
  const keys = Object.keys(a).filter((k) => !b || JSON.stringify(b[k]) !== JSON.stringify(a[k])).slice(0, 8);
  return keys.map((k) => ({ name: k.slice(0, 256), value: b && k in b ? `${short(b[k])} → ${short(a[k])}` : short(a[k]), inline: true }));
}

/**
 * Logging: jede Aktion aus dem Audit-Log kann je Kategorie bzw. Typ in einen Discord-Kanal gemeldet werden.
 * Die Meldung entsteht in derselben Transaktion wie der Audit-Eintrag (Outbox → Bot).
 */
@Injectable()
export class LoggingService implements OnModuleInit {
  private cfg: LoggingConfig = loggingConfigSchema.parse({});
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async onModuleInit() {
    await this.reload();
    setAuditSink((db, actor, entry) => this.onAudit(db, actor, entry));
  }
  async reload() {
    const v = (await this.prisma.systemSetting.findUnique({ where: { key: KEY } }))?.value;
    const p = loggingConfigSchema.safeParse(v ?? {});
    this.cfg = p.success ? p.data : loggingConfigSchema.parse({});
  }
  get() { return this.cfg; }

  async save(actor: Actor, input: LoggingConfig) {
    const value = loggingConfigSchema.parse(input);
    const json = value as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: json }, update: { value: json } });
      await this.audit.record(actor, { action: 'logging.config', module: 'settings', entityType: 'SystemSetting', entityId: KEY, after: json }, tx);
    });
    this.cfg = value;
    return value;
  }

  /** Kategorien mit allen Typen: bekannte Aktionen plus alles, was schon im Audit-Log steht. */
  async types() {
    const seen = await this.prisma.auditLog.groupBy({ by: ['module', 'action'], _count: { _all: true }, _max: { createdAt: true } });
    const all = new Map<string, { module: string; count: number; last: Date | null }>();
    for (const [action, module] of Object.entries(LOG_TYPES)) all.set(action, { module, count: 0, last: null });
    for (const s of seen) all.set(s.action, { module: s.module, count: s._count._all, last: s._max.createdAt });
    const cats = [...LOG_CATEGORIES.map((c) => ({ key: c.key as string, label: c.label, emoji: c.emoji as string })), { key: 'sonstiges', label: 'Sonstiges', emoji: '📦' }];
    return cats.map((c) => ({
      ...c,
      types: [...all].filter(([, x]) => logCategoryOf(x.module) === c.key).map(([action, x]) => ({ action, module: x.module, label: logTypeLabel(action), count: x.count, lastAt: x.last, defaultOff: LOG_DEFAULT_OFF.has(action) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'de')),
    })).filter((c) => c.types.length);
  }

  /** Test-Meldung in den Kanal einer Kategorie. */
  async test(actor: Actor, category: string) {
    const ch = this.cfg.categories[category];
    if (!ch) throw new AppError('VALIDATION_FAILED', 'Für diese Kategorie ist kein Kanal gesetzt.');
    const c = CAT(category);
    await this.prisma.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId: ch, forceNew: true, message: { embeds: [{ title: `${c?.emoji ?? '📦'} Test – ${c?.label ?? 'Sonstiges'}`, description: 'So sehen die Meldungen dieser Kategorie aus. Hier landen ab jetzt die eingestellten Aktionen.', color: 0x3b82f6, footer: 'Logging-Test', timestamp: new Date().toISOString() }] } } as Prisma.InputJsonValue } });
    return { queued: true };
  }

  private async onAudit(db: Tx | PrismaService, actor: Actor, e: AuditEntry) {
    const channelId = logChannelFor(this.cfg, e.module, e.action);
    if (!channelId) return;
    const c = CAT(logCategoryOf(e.module));
    const [user, link] = actor.userId ? await Promise.all([db.user.findUnique({ where: { id: actor.userId }, select: { displayName: true } }), db.discordLink.findUnique({ where: { userId: actor.userId } })]) : [null, null];
    const who = link ? `<@${link.discordId}>${user ? ` (${user.displayName})` : ''}` : user?.displayName ?? 'System';
    const lines = [`**Von:** ${who}`, ...(e.entityType ? [`**Objekt:** ${e.entityType}${e.entityId ? ` \`${e.entityId.slice(0, 40)}\`` : ''}`] : []), ...(e.reason ? [`**Grund:** ${e.reason.slice(0, 500)}`] : [])];
    const message = { embeds: [{ title: `${c?.emoji ?? '📦'} ${logTypeLabel(e.action)}`.slice(0, 256), description: lines.join('\n'), color: e.action.endsWith('delete') || e.action.endsWith('remove') ? 0xef4444 : e.action.endsWith('create') ? 0x22c55e : 0x3b82f6, fields: changeFields(e.before, e.after), footer: `${c?.label ?? 'Sonstiges'} · ${e.action}`, timestamp: new Date().toISOString() }] };
    await db.discordOutbox.create({ data: { type: 'message.post', channelKey: 'announcements', payload: { channelId, forceNew: true, message } as unknown as Prisma.InputJsonValue } });
  }
}
