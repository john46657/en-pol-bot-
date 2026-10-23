import { AI_REVIEW_RESPONSE_SCHEMA } from '@enrp/shared';

/**
 * Anbindung an einen KI-Anbieter für die Bewerbungsprüfung. Zurzeit Google Gemini (REST `models.generateContent`,
 * https://ai.google.dev/api/generate-content); weitere Anbieter implementieren dieselbe Schnittstelle.
 * Der Schlüssel wird nur serverseitig aus der Umgebung gelesen und nie geloggt, gespeichert oder zurückgegeben.
 */
export interface AiGenerateRequest { system: string; user: string }
export interface AiGenerateResult { text: string; model: string }
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult>;
}

export type AiErrorKind = 'NOT_CONFIGURED' | 'INVALID_KEY' | 'MODEL' | 'RATE_LIMIT' | 'TIMEOUT' | 'UNAVAILABLE' | 'BLOCKED' | 'BAD_RESPONSE';
/** Fehler mit verständlicher, unbedenklicher Meldung (kein Schlüssel, kein Bewerbungstext, keine Rohantwort des Anbieters). */
export class AiProviderError extends Error {
  constructor(public readonly kind: AiErrorKind, message: string, public readonly retryable = false) { super(message); }
}

/** Einstellungen aus der Umgebung – ungültige Werte fallen auf sichere Standards zurück (die API startet trotzdem). */
export interface AiConfig { provider: 'gemini'; apiKey: string | null; model: string; timeoutMs: number; maxRetries: number; maxConcurrent: number; dailyLimit: number; maxInputChars: number }
const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : d;
};
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  return {
    provider: 'gemini',
    apiKey: key && key.length >= 10 ? key : null,
    model: model && /^[a-z0-9][a-z0-9.\-_]{1,80}$/i.test(model) ? model : DEFAULT_GEMINI_MODEL,
    timeoutMs: int(env.AI_REVIEW_TIMEOUT_MS, 45_000, 5_000, 120_000),
    maxRetries: int(env.AI_REVIEW_MAX_RETRIES, 1, 0, 3),
    maxConcurrent: int(env.AI_REVIEW_MAX_CONCURRENT, 2, 1, 10),
    dailyLimit: int(env.AI_REVIEW_DAILY_LIMIT, 50, 1, 10_000),
    maxInputChars: int(env.AI_REVIEW_MAX_INPUT_CHARS, 12_000, 2_000, 50_000),
  };
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string }[] };
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  constructor(private readonly apiKey: string, readonly model: string) {}

  async generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult> {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(this.model)}:generateContent`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: AI_REVIEW_RESPONSE_SCHEMA, temperature: 0.2, maxOutputTokens: 8192 },
        }),
      });
    } catch {
      if (signal.aborted) throw new AiProviderError('TIMEOUT', 'Die KI hat nicht rechtzeitig geantwortet (Zeitüberschreitung).', true);
      throw new AiProviderError('UNAVAILABLE', 'Der KI-Dienst ist nicht erreichbar (Netzwerkfehler).', true);
    }
    let body: GeminiResponse = {};
    try { body = (await res.json()) as GeminiResponse; } catch { /* leere/kaputte Antwort → unten behandelt */ }
    if (!res.ok) throw geminiError(res.status, body);
    if (body.promptFeedback?.blockReason) throw new AiProviderError('BLOCKED', 'Der KI-Dienst hat die Anfrage aus Sicherheitsgründen abgelehnt. Bitte die Bewerbung manuell prüfen.');
    const c = body.candidates?.[0];
    if (!c) throw new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat kein Ergebnis geliefert.', true);
    if (c.finishReason === 'MAX_TOKENS') throw new AiProviderError('BAD_RESPONSE', 'Die KI-Antwort wurde abgeschnitten (zu lang).');
    if (c.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(c.finishReason)) throw new AiProviderError('BLOCKED', `Der KI-Dienst hat die Antwort abgebrochen (${c.finishReason}). Bitte die Bewerbung manuell prüfen.`);
    const text = (c.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
    if (!text.trim()) throw new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat eine leere Antwort geliefert.', true);
    return { text, model: body.modelVersion || this.model };
  }
}

/** HTTP-Fehler von Gemini → verständliche Meldung. Die Rohmeldung des Anbieters wird bewusst nicht weitergegeben. */
function geminiError(status: number, body: GeminiResponse): AiProviderError {
  const reason = body.error?.details?.map((d) => d.reason).find(Boolean) ?? '';
  const msg = body.error?.message ?? '';
  if (status === 400 && (reason === 'API_KEY_INVALID' || /api key/i.test(msg))) return new AiProviderError('INVALID_KEY', 'Der hinterlegte Gemini-API-Schlüssel ist ungültig. Bitte GEMINI_API_KEY auf dem Server prüfen.');
  if (status === 401 || status === 403) return new AiProviderError('INVALID_KEY', 'Der Gemini-API-Schlüssel wurde abgelehnt (keine Berechtigung). Bitte GEMINI_API_KEY und die Freigaben im Google-Projekt prüfen.');
  if (status === 404) return new AiProviderError('MODEL', 'Das eingestellte KI-Modell ist nicht verfügbar. Bitte GEMINI_MODEL prüfen.');
  if (status === 429) return new AiProviderError('RATE_LIMIT', 'Das Nutzungslimit des KI-Dienstes ist erreicht (z. B. Anfragen pro Minute oder pro Tag in der kostenlosen Stufe). Bitte später erneut versuchen.');
  if (status === 400) return new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat die Anfrage als ungültig abgelehnt. Bitte später erneut versuchen oder GEMINI_MODEL prüfen.');
  if (status >= 500) return new AiProviderError('UNAVAILABLE', 'Der KI-Dienst ist gerade überlastet oder nicht verfügbar. Bitte später erneut versuchen.', true);
  return new AiProviderError('UNAVAILABLE', `Der KI-Dienst hat mit Fehler ${status} geantwortet.`);
}

/** Für Tests: eigenen Anbieter einsetzen (null = wieder aus der Umgebung). */
let override: ((cfg: AiConfig) => AiProvider | null) | null = null;
export const setAiProviderFactory = (f: ((cfg: AiConfig) => AiProvider | null) | null) => { override = f; };
export function createAiProvider(cfg: AiConfig): AiProvider | null {
  if (override) return override(cfg);
  return cfg.apiKey ? new GeminiProvider(cfg.apiKey, cfg.model) : null;
}
