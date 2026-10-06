import { renderApplicationText } from '@enrp/shared';
import type { AppSettings } from './qualifications.config';

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && /^\d{15,25}$/.test(x)))];

/** Rollen bei der Entscheidung: angenommen → Annahme-Rollen (+ Rolle der Einheit, Rollen-Auswahl), abgelehnt → Ablehnungs-Rollen; „ausstehend“-Rollen fallen weg. */
export function decisionRoles(s: AppSettings, accepted: boolean, extra: (string | null | undefined)[] = []) {
  const add = accepted ? uniq([...extra, ...s.roles.accepted]) : uniq(s.roles.denied);
  const remove = uniq([...(accepted ? s.roles.acceptedRemove : s.roles.deniedRemove), ...s.roles.pending]).filter((r) => !add.includes(r));
  return { add, remove };
}

/** Rollen beim Einreichen: „ausstehend“ geben, „beim Einreichen entfernen“ nehmen. */
export const submitRoles = (s: AppSettings) => ({ add: uniq(s.roles.pending), remove: uniq(s.roles.removeOnSubmit) });

/** Entscheidungs-DM aus dem eingestellten Text (Variablen wie bei Appy). */
export function decisionMessage(s: AppSettings, accepted: boolean, v: { applicationName: string; number: string; decider: string; applicantId: string | null; reason?: string | null }) {
  return renderApplicationText(accepted ? s.messages.accepted : s.messages.denied, {
    '{applicationName}': v.applicationName, '{number}': v.number, '{user}': v.decider, '{applicant}': v.applicantId ? `<@${v.applicantId}>` : '', '{reason}': v.reason ?? '',
  }, true);
}

/** Wartezeit (Minuten) bis zur nächsten Bewerbung – `null`, wenn keine Wartezeit mehr. */
export function cooldownLeft(s: AppSettings, last: Date | null | undefined, now = Date.now()) {
  if (!s.cooldownMinutes || !last) return null;
  const left = last.getTime() + s.cooldownMinutes * 60_000 - now;
  return left > 0 ? Math.ceil(left / 60_000) : null;
}
