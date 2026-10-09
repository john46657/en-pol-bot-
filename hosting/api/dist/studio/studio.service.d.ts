import { PrismaService } from '../prisma/prisma.service';
import { CustomEntity, CustomFieldDef } from './custom-fields';
/** Vorgaben (Namen); zusätzlich ist jede eigene Farbe `#rrggbb` erlaubt (Studio → Design). */
export declare const ACCENTS: readonly ["blue", "green", "amber", "red", "cyan", "violet", "orange", "pink", "indigo", "teal", "lime", "sky", "rose", "emerald", "gold", "slate"];
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
            customAccents: {
                name: string;
                hex: string;
            }[];
        };
        customFields: {
            vehicles: {
                type: "number" | "select" | "text" | "date";
                key: string;
                label: string;
                required: boolean;
                options?: string[] | undefined;
            }[];
            persons: {
                type: "number" | "select" | "text" | "date";
                key: string;
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
