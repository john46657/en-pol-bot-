import { auditRepository } from '@nexus/database';
import {
  DiscordApiError,
  addGuildMemberRole,
  getGuildMember,
  removeGuildMemberRole,
} from '@nexus/discord';

/**
 * Automatische Rollenänderungen mit lückenloser Protokollierung.
 *
 * Grundsatz: Es wird **nie** Erfolg gemeldet, den Discord nicht bestätigt hat. Schlägt eine Änderung fehl,
 * ist das Ergebnis `partial` bzw. `failed`, der Grund steht verständlich im Ergebnis und im Audit-Log.
 */
export interface RoleDriver {
  /** Aktuelle Rollen-IDs des Mitglieds (leer, wenn es nicht (mehr) auf dem Server ist). */
  getRoleIds(userId: string): Promise<string[]>;
  add(userId: string, roleId: string, reason: string): Promise<void>;
  remove(userId: string, roleId: string, reason: string): Promise<void>;
}

export interface RoleChangeRequest {
  guildId: string;
  userId: string;
  add?: string[];
  remove?: string[];
  /** Auslöser, z. B. „Beförderung“, „Ausbildung bestanden“, „Teamwechsel“. */
  trigger: string;
  /** Name/ID der Automation, falls eine Automation auslöst. */
  automation?: string;
  /** Handelnder Benutzer (falls ein Mensch die Aktion ausgelöst hat). */
  actorId?: string;
  /** Betroffener Datensatz (z. B. Beförderungs-ID). */
  resourceType?: string;
  resourceId?: string;
  /** Berechtigung, auf deren Grundlage gehandelt wurde. */
  permission?: string;
  /** Anzeigenamen für Protokoll und Meldungen (roleId → Name). */
  roleNames?: Record<string, string>;
}

export interface RoleChangeOutcome {
  roleId: string;
  roleName: string;
  action: 'add' | 'remove';
  ok: boolean;
  /** Verständlicher Grund bei Fehlern. */
  error?: string;
}

export interface RoleChangeResult {
  status: 'success' | 'partial' | 'failed';
  changes: RoleChangeOutcome[];
  rolesBefore: string[];
  rolesAfter: string[];
  /** Meldung für Oberfläche/Benachrichtigung (nie ein falsches „erfolgreich“). */
  message: string;
}

/** Übersetzt Discord-Fehler in verständliche Texte. */
export function describeRoleError(error: unknown): string {
  if (error instanceof DiscordApiError) {
    if (error.status === 403) {
      return 'Der Bot besitzt keine ausreichende Discord-Rollenposition oder das Recht „Rollen verwalten“. Bitte die Bot-Rolle überprüfen.';
    }
    if (error.status === 404) return 'Rolle oder Mitglied wurde auf dem Server nicht gefunden.';
    if (error.status === 429)
      return 'Discord hat die Anfrage wegen Rate-Limits abgelehnt. Bitte später erneut versuchen.';
    return `Discord hat die Änderung abgelehnt (Status ${error.status}).`;
  }
  return 'Die Rollenänderung ist unerwartet fehlgeschlagen.';
}

export async function applyRoleChanges(
  req: RoleChangeRequest,
  driver: RoleDriver,
): Promise<RoleChangeResult> {
  const name = (id: string) => req.roleNames?.[id] ?? id;
  const reason = `NEXUS: ${req.trigger}${req.automation ? ` (${req.automation})` : ''}`;
  const rolesBefore = await driver.getRoleIds(req.userId).catch(() => [] as string[]);
  const have = new Set(rolesBefore);

  const wanted = [
    ...(req.remove ?? []).map((roleId) => ({ roleId, action: 'remove' as const })),
    ...(req.add ?? []).map((roleId) => ({ roleId, action: 'add' as const })),
  ];
  const changes: RoleChangeOutcome[] = [];
  for (const w of wanted) {
    const base = { roleId: w.roleId, roleName: name(w.roleId), action: w.action };
    // Bereits im Zielzustand: nichts zu tun, aber auch kein Fehler.
    if ((w.action === 'add') === have.has(w.roleId)) {
      changes.push({ ...base, ok: true });
      continue;
    }
    try {
      await (w.action === 'add' ? driver.add : driver.remove).call(
        driver,
        req.userId,
        w.roleId,
        reason,
      );
      changes.push({ ...base, ok: true });
    } catch (error) {
      changes.push({ ...base, ok: false, error: describeRoleError(error) });
    }
  }

  const failed = changes.filter((c) => !c.ok);
  const status: RoleChangeResult['status'] =
    failed.length === 0 ? 'success' : failed.length === changes.length ? 'failed' : 'partial';

  // Nachher-Stand wird bei Discord nachgelesen, nicht aus der Absicht abgeleitet.
  const rolesAfter = await driver.getRoleIds(req.userId).catch(() => [] as string[]);

  const message =
    status === 'success'
      ? 'Rollenänderung durchgeführt.'
      : `⚠️ Rollenänderung ${status === 'partial' ? 'teilweise ' : ''}fehlgeschlagen. Grund: ${[...new Set(failed.map((f) => f.error))].join(' ')}`;

  await auditRepository.create({
    guildId: req.guildId,
    actorType: req.actorId ? 'USER' : 'AUTOMATION',
    actorId: req.actorId ?? null,
    action: 'role.change',
    resourceType: req.resourceType ?? 'Member',
    resourceId: req.resourceId ?? req.userId,
    before: { roles: rolesBefore },
    after: { roles: rolesAfter },
    metadata: {
      userId: req.userId,
      trigger: req.trigger,
      changes: changes.map((c) => ({ ...c })),
    } as never,
    result: status,
    ...(req.permission ? { permission: req.permission } : {}),
    ...(req.automation ? { automation: req.automation } : {}),
    ...(failed.length ? { reason: message } : { reason: req.trigger }),
  });

  return { status, changes, rolesBefore, rolesAfter, message };
}

/** Treiber über die Discord-REST-API (Bot-Token). */
export function restRoleDriver(botToken: string, guildId: string): RoleDriver {
  return {
    async getRoleIds(userId) {
      return (await getGuildMember(botToken, guildId, userId))?.roles ?? [];
    },
    add: (userId, roleId, reason) => addGuildMemberRole(botToken, guildId, userId, roleId, reason),
    remove: (userId, roleId, reason) =>
      removeGuildMemberRole(botToken, guildId, userId, roleId, reason),
  };
}
