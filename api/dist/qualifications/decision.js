"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitRoles = void 0;
exports.decisionRoles = decisionRoles;
exports.decisionMessage = decisionMessage;
exports.cooldownLeft = cooldownLeft;
const shared_1 = require("@enrp/shared");
const uniq = (xs) => [...new Set(xs.filter((x) => !!x && /^\d{15,25}$/.test(x)))];
/** Rollen bei der Entscheidung: angenommen → Annahme-Rollen (+ Rolle der Einheit, Rollen-Auswahl), abgelehnt → Ablehnungs-Rollen; „ausstehend“-Rollen fallen weg. */
function decisionRoles(s, accepted, extra = []) {
    const add = accepted ? uniq([...extra, ...s.roles.accepted]) : uniq(s.roles.denied);
    const remove = uniq([...(accepted ? s.roles.acceptedRemove : s.roles.deniedRemove), ...s.roles.pending]).filter((r) => !add.includes(r));
    return { add, remove };
}
/** Rollen beim Einreichen: „ausstehend“ geben, „beim Einreichen entfernen“ nehmen. */
const submitRoles = (s) => ({ add: uniq(s.roles.pending), remove: uniq(s.roles.removeOnSubmit) });
exports.submitRoles = submitRoles;
/** Entscheidungs-DM aus dem eingestellten Text (Variablen wie bei Appy). */
function decisionMessage(s, accepted, v) {
    return (0, shared_1.renderApplicationText)(accepted ? s.messages.accepted : s.messages.denied, {
        '{applicationName}': v.applicationName, '{number}': v.number, '{user}': v.decider, '{applicant}': v.applicantId ? `<@${v.applicantId}>` : '', '{reason}': v.reason ?? '',
    }, true);
}
/** Wartezeit (Minuten) bis zur nächsten Bewerbung – `null`, wenn keine Wartezeit mehr. */
function cooldownLeft(s, last, now = Date.now()) {
    if (!s.cooldownMinutes || !last)
        return null;
    const left = last.getTime() + s.cooldownMinutes * 60_000 - now;
    return left > 0 ? Math.ceil(left / 60_000) : null;
}
//# sourceMappingURL=decision.js.map