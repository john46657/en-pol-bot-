import { permissions, decide, type AccessContext, type Grant } from '@nexus/permissions';
import { prisma } from '@nexus/database';
import type { Permission } from '@nexus/types';

/**
 * Zugriff auf Personalakten: Berechtigungen gelten serverweit oder nur für das **eigene Team** (TEAM-Bereich).
 * „Eigenes Team“ = Team der eigenen Akte plus Teams, deren Leitung man ist.
 */
export interface PersonnelActor extends AccessContext {
  userId: string;
  teamIds: string[];
}

export async function teamIdsOf(guildId: string, userId: string): Promise<string[]> {
  const [record, led] = await Promise.all([
    prisma.personnelRecord.findUnique({
      where: { guildId_userId: { guildId, userId } },
      select: { teamId: true },
    }),
    prisma.team.findMany({
      where: { guildId, leaderUserId: userId, active: true },
      select: { id: true },
    }),
  ]);
  return [...new Set([...(record?.teamId ? [record.teamId] : []), ...led.map((t) => t.id)])];
}

export async function buildActor(base: {
  guildId: string;
  userId: string;
  roleIds: readonly string[];
  bypass: boolean;
}): Promise<PersonnelActor> {
  return { ...base, teamIds: await teamIdsOf(base.guildId, base.userId) };
}

type Target = { userId: string; teamId: string | null };

/** Darf der Handelnde diese Aktion auf **dieser** Akte ausführen? (Team-Bereich wird gegen das Team der Akte geprüft.) */
export function canOn(actor: PersonnelActor, key: Permission, record: Target): Promise<boolean> {
  return permissions.can(actor, key, record.teamId ? { teamId: record.teamId } : {});
}

export interface ListScope {
  /** Alle Akten (serverweites Recht oder Verwalter). */
  all: boolean;
  /** Sonst: nur Akten dieser Teams. */
  teamIds: string[];
}

/** Welche Akten darf der Handelnde mit diesem Recht überhaupt sehen? (für Listen) */
export async function scopeFor(actor: PersonnelActor, key: Permission): Promise<ListScope> {
  if (actor.bypass) return { all: true, teamIds: [] };
  const grants: Grant[] = await permissions.grants(actor);
  const subject = { teamIds: actor.teamIds };
  if (decide(grants, key, {}, subject).allowed) return { all: true, teamIds: [] };
  const candidates = new Set<string>(actor.teamIds);
  for (const g of grants) if (g.scope === 'TEAM' && g.scopeRef) candidates.add(g.scopeRef);
  const teamIds = [...candidates].filter(
    (teamId) => decide(grants, key, { teamId }, subject).allowed,
  );
  return { all: false, teamIds };
}

/** Sichtbare Bereiche einer Akte. */
export type Section = 'base' | 'awards' | 'discipline' | 'notes' | 'history';

export async function visibleSections(
  actor: PersonnelActor,
  record: Target,
): Promise<Set<Section>> {
  const out = new Set<Section>();
  const isOwner = record.userId === actor.userId;
  const base =
    (await canOn(actor, 'personnel.view', record)) ||
    (isOwner && (await permissions.can(actor, 'own.profile.view')));
  if (base) {
    out.add('base');
    out.add('awards');
  }
  if (await canOn(actor, 'personnel.discipline.view', record)) out.add('discipline');
  if (await canOn(actor, 'personnel.note.view', record)) out.add('notes');
  if (await canOn(actor, 'personnel.history.view', record)) out.add('history');
  return out;
}
