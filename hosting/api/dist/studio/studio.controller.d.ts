import { StudioService } from './studio.service';
/** Für alle angemeldeten Benutzer lesbar (Branding, Theme, Feld-Definitionen); enthält keine sensiblen Daten. Änderungen laufen über PUT /admin/settings/:key. */
export declare class StudioController {
    private readonly s;
    constructor(s: StudioService);
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
}
