import { type AiProviderName } from '@enrp/shared';
/**
 * Anbindung an einen KI-Anbieter für die Bewerbungsprüfung – modular: Google Gemini (REST `models.generateContent`,
 * https://ai.google.dev/api/generate-content) und OpenAI-kompatible Chat-Completions (Groq, OpenRouter, Mistral, Ollama).
 * Welcher Anbieter genutzt wird, steht ausschließlich in der Server-Umgebung (`AI_PROVIDER`, `*_API_KEY`).
 * Schlüssel werden nie geloggt, gespeichert, an das Frontend oder an Discord gegeben.
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
interface ProviderDef {
    keyEnv: string | null;
    base: string;
    model: string;
}
/** Standardwerte je Anbieter. Modelle lassen sich mit `AI_MODEL` überschreiben (Gemini zusätzlich `GEMINI_MODEL`). */
export declare const PROVIDER_DEFAULTS: Record<AiProviderName, ProviderDef>;
export declare const DEFAULT_GEMINI_MODEL: string;
/** Einstellungen aus der Umgebung – ungültige Werte fallen auf sichere Standards zurück (die API startet trotzdem). */
export interface AiConfig {
    provider: AiProviderName;
    apiKey: string | null;
    baseUrl: string;
    model: string;
    configured: boolean;
    timeoutMs: number;
    maxRetries: number;
    maxConcurrent: number;
    dailyLimit: number;
    maxInputChars: number;
}
/**
 * Anbieter wählen: `AI_PROVIDER` (gemini | groq | openrouter | mistral | ollama). Ohne Angabe der erste Anbieter, für den
 * ein Schlüssel hinterlegt ist (Reihenfolge wie oben) – so funktionieren bestehende Installationen mit nur `GEMINI_API_KEY` weiter.
 * Ollama braucht keinen Schlüssel und wird deshalb nur bei ausdrücklichem `AI_PROVIDER=ollama` verwendet.
 */
export declare function aiConfig(env?: NodeJS.ProcessEnv): AiConfig;
/** Ist ein KI-Anbieter eingerichtet? (für Discord-Button „KI-Prüfung“ – der Schlüssel selbst wird nie weitergegeben) */
export declare const aiConfigured: () => boolean;
/** Name der Umgebungsvariable für den Schlüssel (für verständliche Hinweise). */
export declare const aiKeyHint: (c: AiConfig) => string;
export declare class GeminiProvider implements AiProvider {
    private readonly apiKey;
    readonly model: string;
    private readonly base;
    readonly name = "gemini";
    constructor(apiKey: string, model: string, base?: string);
    generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult>;
}
export declare class OpenAiCompatibleProvider implements AiProvider {
    readonly name: Exclude<AiProviderName, 'gemini'>;
    private readonly apiKey;
    readonly model: string;
    private readonly base;
    constructor(name: Exclude<AiProviderName, 'gemini'>, apiKey: string | null, model: string, base: string);
    generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult>;
}
export declare const setAiProviderFactory: (f: ((cfg: AiConfig) => AiProvider | null) | null) => void;
export declare function createAiProvider(cfg: AiConfig): AiProvider | null;
export {};
