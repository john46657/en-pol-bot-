import { type FormField } from '@enrp/shared';
import { ApplicationsService } from '../applications/applications.service';
import { QualificationsService } from './qualifications.service';
/** Schlüssel der Polizei-Bewerbung (wie im Bot); alles andere ist eine Einheit aus der Qualifikations-Konfiguration. */
export declare const POLICE_KEY = "@polizei";
export interface WebApplyInput {
    unit: string;
    discordId: string;
    discordName: string;
    guildId?: string;
    joinedAt?: Date;
}
/**
 * Bewerbungsart „Web“: Der Bot stellt einen signierten, zeitlich begrenzten Link aus, die Person füllt die Fragen
 * im Browser aus. Kein Konto nötig – die Discord-Identität steckt im Link. Geprüft wird beim Absenden genauso wie bei
 * einer Bewerbung per Direktnachricht (gleiche Service-Methoden).
 */
export declare class WebApplyService {
    private readonly q;
    private readonly apps;
    private readonly secret;
    constructor(q: QualificationsService, apps: ApplicationsService);
    private sign;
    private verify;
    /** Name, Einstellungen und Fragen einer Bewerbung (Polizei oder Einheit). */
    private flow;
    /** Vom Bot: Link für eine Person ausstellen; gültig so lange wie das Zeitlimit der Bewerbung. */
    link(d: WebApplyInput): Promise<{
        url: string;
        expiresAt: string;
        timeLimit: string;
    }>;
    /** Öffentlich: Formular zum Link. */
    open(token: string): Promise<{
        title: string;
        name: string;
        discordName: string;
        expiresAt: string;
        questions: FormField[];
        robloxField: boolean;
    }>;
    /** Öffentlich: Antworten absenden – gleiche Prüfungen wie bei der Bewerbung per Direktnachricht. */
    submit(token: string, b: {
        answers: Record<string, string | string[]>;
        robloxUsername?: string;
    }): Promise<{
        number: string;
        message: string;
    }>;
}
