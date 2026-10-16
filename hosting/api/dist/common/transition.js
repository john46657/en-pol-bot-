"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextStatus = nextStatus;
exports.changedFields = changedFields;
const shared_1 = require("@enrp/shared");
const errors_1 = require("./errors");
function nextStatus(map, from, to) {
    if (!(from in map))
        throw new errors_1.AppError('INVALID_TRANSITION', `Unbekannter Status „${from}“.`);
    (0, shared_1.assertTransition)(map, from, to);
    return to;
}
/** Nur Felder, deren Wert sich wirklich ändert (Datumswerte nach Zeitpunkt verglichen) – für Verlauf und Audit. */
function changedFields(before, data) {
    const norm = (v) => (v instanceof Date ? v.getTime() : v ?? null);
    return Object.fromEntries(Object.entries(data).filter(([k, v]) => norm(v) !== norm(before[k])));
}
//# sourceMappingURL=transition.js.map