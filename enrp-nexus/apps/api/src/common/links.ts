import { Tx } from '../prisma/prisma.service';

/** Dedupe-sichere Verknüpfung (Unique-Constraint + upsert). */
export async function linkPerson(tx: Tx, personId: string, entityType: string, entityId: string, role = 'SUBJECT') {
  await tx.recordLink.upsert({
    where: { personId_entityType_entityId_role: { personId, entityType, entityId, role } },
    create: { personId, entityType, entityId, role },
    update: {},
  });
}

export async function linkVehicle(tx: Tx, vehicleId: string, entityType: string, entityId: string, role = 'SUBJECT') {
  const exists = await tx.recordLink.findFirst({ where: { vehicleId, entityType, entityId, role } });
  if (!exists) await tx.recordLink.create({ data: { vehicleId, entityType, entityId, role } });
}
