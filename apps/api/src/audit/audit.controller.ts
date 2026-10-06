import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermission } from '../authz/decorators';
import { zodBody } from '../common/zod.pipe';
import { pageQuery, pageResult, skipTake } from '../common/pagination';

const q = pageQuery.extend({ module: z.string().optional(), entityType: z.string().optional(), entityId: z.string().optional(), action: z.string().max(60).optional() });

type J = Record<string, unknown> | null;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const EFFECT: Record<string, string> = { ALLOW: 'erlaubt', DENY: 'verweigert' };

/** Lesbarer Satz für Rechteänderungen („Max hat der Rolle Moderator die Berechtigung ticket.delete entzogen.“). */
export function auditSummary(e: { action: string; before: unknown; after: unknown }, actor: string, target?: string | null): string | null {
  const b = obj(e.before), a = obj(e.after);
  const role = String(a?.role ?? b?.role ?? b?.name ?? a?.name ?? '');
  const perm = String(a?.permission ?? b?.permission ?? '');
  switch (e.action) {
    case 'role.permission.allow': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} erteilt${b?.effect ? ` (vorher ${EFFECT[String(b.effect)] ?? b.effect})` : ''}.`;
    case 'role.permission.deny': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} ausdrücklich verweigert.`;
    case 'role.permission.remove': return `${actor} hat der Rolle „${role}“ die Berechtigung ${perm} entzogen (vorher ${EFFECT[String(b?.effect)] ?? '—'}).`;
    case 'role.create': return `${actor} hat die Rolle „${role}“ erstellt.`;
    case 'role.delete': return `${actor} hat die Rolle „${role}“ gelöscht.`;
    case 'role.duplicate': return `${actor} hat die Rolle „${String(a?.from ?? '')}“ als „${role}“ dupliziert.`;
    case 'role.enable': return `${actor} hat die Rolle „${role}“ aktiviert.`;
    case 'role.disable': return `${actor} hat die Rolle „${role}“ deaktiviert.`;
    case 'role.discord_roles': return `${actor} hat die Discord-Verknüpfung der Rolle „${role}“ geändert.`;
    case 'role.update': return `${actor} hat die Rolle „${role}“ bearbeitet.`;
    case 'role.reorder': return `${actor} hat die Reihenfolge der Rollen geändert.`;
    case 'user.roles.set': return `${actor} hat die Rollen von ${target ?? 'einem Benutzer'} geändert.`;
    case 'user.override.add': return `${actor} hat ${target ?? 'einem Benutzer'} die Berechtigung ${String(a?.permissionKey ?? '')} ${a?.effect === 'DENY' ? 'ausdrücklich verweigert' : 'zusätzlich erteilt'}.`;
    case 'user.override.remove': return `${actor} hat die individuelle Berechtigung ${String(b?.permissionKey ?? '')} von ${target ?? 'einem Benutzer'} entfernt.`;
    case 'auth.discord.roles_synced': return `Discord-Abgleich: Rollen von ${target ?? 'einem Benutzer'} angepasst.`;
    case 'auth.discord.access_revoked': return `Discord-Abgleich: Zugriff von ${target ?? 'einem Benutzer'} entzogen (keine freigeschaltete Discord-Rolle mehr).`;
    default: return null;
  }
}

/** Nur lesend. Es gibt bewusst keine Schreib-/Lösch-Endpunkte für Audit-Logs. */
@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get() @RequirePermission('audit.view')
  async list(@Query(zodBody(q)) f: z.infer<typeof q>) {
    const where = { ...(f.module ? { module: f.module } : {}), ...(f.entityType ? { entityType: f.entityType } : {}), ...(f.entityId ? { entityId: f.entityId } : {}), ...(f.action ? { action: { startsWith: f.action } } : {}) };
    const [items, total] = await Promise.all([this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(f) }), this.prisma.auditLog.count({ where })]);
    // Handelnde Person und betroffener Benutzer mit Name und Discord-ID
    const ids = [...new Set(items.flatMap((i) => [i.actorUserId, i.entityType === 'User' ? i.entityId : null]).filter((x): x is string => !!x && /^[0-9a-f-]{36}$/i.test(x)))];
    const [users, links] = ids.length ? await Promise.all([this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }), this.prisma.discordLink.findMany({ where: { userId: { in: ids } } })]) : [[], []];
    const who = (id: string | null) => (id ? { id, name: users.find((u) => u.id === id)?.displayName ?? null, discordId: links.find((l) => l.userId === id)?.discordId ?? null } : null);
    return pageResult(items.map((i) => {
      const actor = who(i.actorUserId), target = i.entityType === 'User' ? who(i.entityId) : null;
      return { ...i, actor, target, summary: auditSummary(i, actor?.name ?? 'System', target?.name) };
    }), total, f);
  }
}
