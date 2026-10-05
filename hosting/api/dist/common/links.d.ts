import { Tx } from '../prisma/prisma.service';
/** Dedupe-sichere Verknüpfung (Unique-Constraint + upsert). */
export declare function linkPerson(tx: Tx, personId: string, entityType: string, entityId: string, role?: string): Promise<void>;
export declare function linkVehicle(tx: Tx, vehicleId: string, entityType: string, entityId: string, role?: string): Promise<void>;
