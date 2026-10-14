import { z } from 'zod';
import type { Actor } from '../audit/audit.service';
import { ModulesService } from './modules.service';
declare const patchModule: z.ZodObject<{
    enabled: z.ZodBoolean;
    version: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    version: number;
    enabled: boolean;
}, {
    version: number;
    enabled: boolean;
}>;
/** Administration → Module. */
export declare class ModulesController {
    private readonly s;
    constructor(s: ModulesService);
    list(): Promise<{
        version: number;
        modules: {
            key: string;
            name: string;
            description: string;
            system: boolean;
            dependsOn: string[];
            enabled: boolean;
        }[];
    }>;
    set(a: Actor, key: string, b: z.infer<typeof patchModule>): Promise<{
        version: number;
        modules: {
            key: string;
            name: string;
            description: string;
            system: boolean;
            dependsOn: string[];
            enabled: boolean;
        }[];
    }>;
}
/** Für den Bot: Discord-Server dieses Systems und abgeschaltete Module (danach registriert er die Befehle). Nur per Bot-Token. */
export declare class BotServerController {
    private readonly s;
    constructor(s: ModulesService);
    get(): Promise<{
        guildId: string | null;
        disabled: string[];
    }>;
}
export {};
