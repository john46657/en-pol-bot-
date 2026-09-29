import { RoleRuleType } from '@nexus/types';
import type { RoleRule } from '@nexus/types';

/**
 * Rollenregeln (§38) und Rollen-Automation (§39).
 *
 * RoleMatchMode:
 *   HAS_ALL  – User muss ALLE Rollen haben
 *   HAS_ANY  – User muss MINDESTENS EINE Rolle haben
 *   HAS_NONE – User darf KEINE der Rollen haben
 */

export function matchRoles(memberRoleIds: string[], rule: RoleRule): boolean {
  const required = [rule.roleId, ...(rule.additionalRoleIds ?? [])];
  const present = required.filter((id) => memberRoleIds.includes(id));

  switch (rule.matchMode) {
    case 'HAS_ALL':
      return present.length === required.length;
    case 'HAS_ANY':
      return present.length > 0;
    case 'HAS_NONE':
      return present.length === 0;
    default:
      return false;
  }
}

export interface RequirementCheckResult {
  ok: boolean;
  /** Meldungen für den Bewerber. */
  messages: string[];
}

/**
 * Required/Restricted Rollen (§70): darf der User überhaupt starten?
 */
export function checkRoleRequirements(
  memberRoleIds: string[],
  rules: RoleRule[],
): RequirementCheckResult {
  const messages: string[] = [];

  for (const rule of rules) {
    if (rule.type !== RoleRuleType.REQUIRED && rule.type !== RoleRuleType.RESTRICTED) continue;
    const matched = matchRoles(memberRoleIds, rule);
    if (rule.type === RoleRuleType.REQUIRED && !matched) {
      messages.push('Dir fehlt eine erforderliche Rolle, um dich zu bewerben.');
    }
    if (rule.type === RoleRuleType.RESTRICTED && matched) {
      messages.push('Du darfst dich mit deiner aktuellen Rolle nicht bewerben.');
    }
  }

  return { ok: messages.length === 0, messages };
}

/**
 * Rollen-Aktionen (§39) für einen Statusübergang.
 * Transaktional/fehlertolerante Ausführung erfolgt im Bot/Worker (§90).
 */
export interface RoleAction {
  type: 'ADD' | 'REMOVE';
  roleId: string;
  reason: string;
}

export function roleActionsForTransition(
  fromStatus: string,
  toStatus: string,
  rules: RoleRule[],
): RoleAction[] {
  const actions: RoleAction[] = [];
  const isAccept = toStatus === 'ACCEPTED';
  const isDeny = toStatus === 'DENIED';
  const isSubmit = toStatus === 'SUBMITTED';

  for (const rule of rules) {
    if (isSubmit && rule.type === RoleRuleType.PENDING) {
      actions.push({ type: 'ADD', roleId: rule.roleId, reason: 'Bewerbung eingereicht' });
    }
    if (isSubmit && rule.type === RoleRuleType.SUBMIT_REMOVAL) {
      actions.push({ type: 'REMOVE', roleId: rule.roleId, reason: 'Bewerbung eingereicht' });
    }
    if (isAccept) {
      if (rule.type === RoleRuleType.PENDING) {
        actions.push({ type: 'REMOVE', roleId: rule.roleId, reason: 'Bewerbung angenommen' });
      }
      if (rule.type === RoleRuleType.ACCEPTED) {
        actions.push({ type: 'ADD', roleId: rule.roleId, reason: 'Bewerbung angenommen' });
      }
      if (rule.type === RoleRuleType.ACCEPTED_REMOVAL) {
        actions.push({ type: 'REMOVE', roleId: rule.roleId, reason: 'Bewerbung angenommen' });
      }
    }
    if (isDeny) {
      if (rule.type === RoleRuleType.PENDING) {
        actions.push({ type: 'REMOVE', roleId: rule.roleId, reason: 'Bewerbung abgelehnt' });
      }
      if (rule.type === RoleRuleType.DENIED) {
        actions.push({ type: 'ADD', roleId: rule.roleId, reason: 'Bewerbung abgelehnt' });
      }
      if (rule.type === RoleRuleType.DENIED_REMOVAL) {
        actions.push({ type: 'REMOVE', roleId: rule.roleId, reason: 'Bewerbung abgelehnt' });
      }
    }
    // PING-Rollen werden nur genannt (Notify), nicht verwaltet
  }

  return deduplicateActions(actions);
}

function deduplicateActions(actions: RoleAction[]): RoleAction[] {
  const seen = new Set<string>();
  const result: RoleAction[] = [];
  for (const action of actions) {
    const key = `${action.type}:${action.roleId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(action);
  }
  return result;
}
