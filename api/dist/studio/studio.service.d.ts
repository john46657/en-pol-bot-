import { PrismaService } from '../prisma/prisma.service';
import { CustomEntity, CustomFieldDef } from './custom-fields';
export declare const ACCENTS: readonly ["blue", "green", "amber", "red", "cyan", "violet"];
export declare class StudioService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private setting;
    config(): Promise<{
        org: {
            name: string;
        };
        theme: {
            accent: string;
        };
        customFields: {
            persons: {
                key: string;
                type: "number" | "select" | "text" | "date";
                label: string;
                required: boolean;
                options?: string[] | undefined;
            }[];
            vehicles: {
                key: string;
                type: "number" | "select" | "text" | "date";
                label: string;
                required: boolean;
                options?: string[] | undefined;
            }[];
        };
    }>;
    defs(entity: CustomEntity): Promise<CustomFieldDef[]>;
    /** Liefert bereinigte Custom-Werte oder wirft 400 mit allen Fehlern. */
    check(entity: CustomEntity, values: Record<string, unknown> | undefined, existing?: Record<string, unknown> | null): Promise<Record<string, string | number> | undefined>;
}
