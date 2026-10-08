import { ServerLinksService, type ServerLinks } from './server-links.service';
import type { Actor } from '../audit/audit.service';
/** Administration → Server-Verbund. */
export declare class ServerLinksController {
    private readonly s;
    constructor(s: ServerLinksService);
    get(): Promise<{
        counts: {
            shared: {
                persons: number;
                vehicles: number;
            } | undefined;
            groups: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
            own: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
        };
        groups: {
            name: string;
            guildIds: string[];
            shareRecords: boolean;
            shareSettings: boolean;
            id?: string | undefined;
        }[];
        sharedRecords: string[];
    }>;
    save(a: Actor, b: ServerLinks): Promise<{
        counts: {
            shared: {
                persons: number;
                vehicles: number;
            } | undefined;
            groups: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
            own: {
                [k: string]: {
                    persons: number;
                    vehicles: number;
                } | undefined;
            };
        };
        groups: {
            name: string;
            guildIds: string[];
            shareRecords: boolean;
            shareSettings: boolean;
            id?: string | undefined;
        }[];
        sharedRecords: string[];
    }>;
    move(a: Actor, b: {
        guildId: string;
    }): Promise<{
        persons: number;
        vehicles: number;
    }>;
}
