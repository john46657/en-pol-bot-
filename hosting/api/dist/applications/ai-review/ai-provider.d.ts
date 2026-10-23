/**
 * Anbindung an einen KI-Anbieter für die Bewerbungsprüfung. Zurzeit Google Gemini (REST `models.generateContent`,
 * https://ai.google.dev/api/generate-content); weitere Anbieter implementieren dieselbe Schnittstelle.
 * Der Schlüssel wird nur serverseitig aus der Umgebung gelesen und nie geloggt, gespeichert oder zurückgegeben.
 */
export interface AiGenerateRequest {
    system: string;
    user: string;
}
export interface AiGenerateResult {
    text: string;
    model: string;
}
export interface AiProvider {
    readonly name: string;
    readonly model: string;
    generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult>;
}
export type AiErrorKind = 'NOT_CONFIGURED' | 'INVALID_KEY' | 'MODEL' | 'RATE_LIMIT' | 'TIMEOUT' | 'UNAVAILABLE' | 'BLOCKED' | 'BAD_RESPONSE';
/** Fehler mit verständlicher, unbedenklicher Meldung (kein Schlüssel, kein Bewerbungstext, keine Rohantwort des Anbieters). */
export declare class AiProviderError extends Error {
    readonly kind: AiErrorKind;
    readonly retryable: boolean;
    constructor(kind: AiErrorKind, message: string, retryable?: boolean);
}
/** Einstellungen aus der Umgebung – ungültige Werte fallen auf sichere Standards zurück (die API startet trotzdem). */
export interface AiConfig {
    provider: 'gemini';
    apiKey: string | null;
    model: string;
    timeoutMs: number;
    maxRetries: number;
    maxConcurrent: number;
    dailyLimit: number;
    maxInputChars: number;
}
export declare const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
export declare function aiConfig(env?: NodeJS.ProcessEnv): AiConfig;
export declare class GeminiProvider implements AiProvider {
    private readonly apiKey;
    readonly model: string;
    readonly name = "gemini";
    constructor(apiKey: string, model: string);
    generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult>;
}
export declare const setAiProviderFactory: (f: ((cfg: AiConfig) => AiProvider | null) | null) => void;
export declare function createAiProvider(cfg: AiConfig): AiProvider | null;
