"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkPerson = linkPerson;
exports.linkVehicle = linkVehicle;
/** Dedupe-sichere Verknüpfung (Unique-Constraint + upsert). */
async function linkPerson(tx, personId, entityType, entityId, role = 'SUBJECT') {
    await tx.recordLink.upsert({
        where: { personId_entityType_entityId_role: { personId, entityType, entityId, role } },
        create: { personId, entityType, entityId, role },
        update: {},
    });
}
async function linkVehicle(tx, vehicleId, entityType, entityId, role = 'SUBJECT') {
    const exists = await tx.recordLink.findFirst({ where: { vehicleId, entityType, entityId, role } });
    if (!exists)
        await tx.recordLink.create({ data: { vehicleId, entityType, entityId, role } });
}
//# sourceMappingURL=links.js.map