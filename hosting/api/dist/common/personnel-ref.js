"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onePersonnel = void 0;
/**
 * Personalakte in verschachtelten Abfragen (Benutzer → Akte): `personnel: { ...onePersonnel(), select: {…} }` und danach
 * `user.personnel[0]`. Maßgeblich ist die Akte des Bestands; nur falls es (aus der früheren Multi-Server-Zeit) zusätzlich eine
 * separat belassene Akte gibt, kommt diese erst danach.
 */
const onePersonnel = () => ({ orderBy: { serverId: { sort: 'asc', nulls: 'first' } }, take: 1 });
exports.onePersonnel = onePersonnel;
//# sourceMappingURL=personnel-ref.js.map