import { type LoggingConfig } from '@enrp/shared';
import { LoggingService } from './logging.service';
import type { Actor } from '../audit/audit.service';
/** Administration → Logging: welche Aktionen in welchen Discord-Kanal gemeldet werden. */
export declare class LoggingController {
    private readonly s;
    constructor(s: LoggingService);
    get(): {
        enabled: boolean;
        categories: Record<string, string>;
        types: Record<string, string>;
    };
    types(): Promise<{
        types: {
            action: string;
            module: string;
            label: string;
            count: number;
            lastAt: Date | null;
            defaultOff: boolean;
        }[];
        key: string;
        label: string;
        emoji: string;
    }[]>;
    save(a: Actor, b: LoggingConfig): Promise<{
        enabled: boolean;
        categories: Record<string, string>;
        types: Record<string, string>;
    }>;
    test(a: Actor, b: {
        category: string;
    }): Promise<{
        queued: boolean;
    }>;
}
