import { type ZodErrorMap } from 'zod';
/**
 * Deutsche Standardmeldungen für Zod (Details in VALIDATION_FAILED-Antworten).
 * Eigene Meldungen aus `.refine(…, 'Text')`, `.min(1, 'Text')` usw. haben weiterhin Vorrang.
 */
export declare const germanZodErrorMap: ZodErrorMap;
/** Einmalig global setzen (betrifft nur diesen API-Prozess). */
export declare function installGermanZodErrors(): void;
