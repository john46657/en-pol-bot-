import { PermissionContext } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
/** Lädt Rechte-Kontext aus DB; die Entscheidungslogik liegt zentral in @enrp/shared. */
export declare class PermissionService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    contextFor(userId: string): Promise<PermissionContext>;
    check(userId: string, permission: string): Promise<import("@enrp/shared").Resolution>;
    has(userId: string, permission: string): Promise<boolean>;
    assert(userId: string, permission: string): Promise<void>;
    effective(userId: string): Promise<import("@enrp/shared").PermissionKey[]>;
}
