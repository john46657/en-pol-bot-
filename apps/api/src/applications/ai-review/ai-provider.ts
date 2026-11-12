import { AI_PROVIDERS, AI_REVIEW_RESPONSE_SCHEMA, type AiProviderName } from '@enrp/shared';

/**
 * Anbindung an einen KI-Anbieter für die Bewerbungsprüfung – modular: Google Gemini (REST `models.generateContent`,
 * https://ai.google.dev/api/generate-content) und OpenAI-kompatible Chat-Completions (Groq, OpenRouter, Mistral, Ollama).
 * Welcher Anbieter genutzt wird, steht ausschließlich in der Server-Umgebung (`AI_PROVIDER`, `*_API_KEY`).
 * Schlüssel werden nie geloggt, gespeichert, an das Frontend oder an Discord gegeben.
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

interface ProviderDef { keyEnv: string | null; base: string; model: string }
/** Standardwerte je Anbieter. Modelle lassen sich mit `AI_MODEL` überschreiben (Gemini zusätzlich `GEMINI_MODEL`). */
export const PROVIDER_DEFAULTS: Record<AiProviderName, ProviderDef> = {
  gemini: { keyEnv: 'GEMINI_API_KEY', base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-3.8-flash' },
  groq: { keyEnv: 'GROQ_API_KEY', base: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { keyEnv: 'OPENROUTER_API_KEY', base: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free' },
  mistral: { keyEnv: 'MISTRAL_API_KEY', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
  ollama: { keyEnv: null, base: 'http://localhost:11434/v1', model: 'llama3.1' },
};
export const DEFAULT_GEMINI_MODEL = PROVIDER_DEFAULTS.gemini.model;

/** Einstellungen aus der Umgebung – ungültige Werte fallen auf sichere Standards zurück (die API startet trotzdem). */
export interface AiConfig {
  provider: AiProviderName; apiKey: string | null; baseUrl: string; model: string; configured: boolean;
  timeoutMs: number; maxRetries: number; maxConcurrent: number; dailyLimit: number; maxInputChars: number;
}
const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : d;
};
const keyOf = (env: NodeJS.ProcessEnv, name: string | null) => { const k = name ? env[name]?.trim() : undefined; return k && k.length >= 10 ? k : null; };
const validModel = (m: string | undefined) => (m && /^[a-z0-9][a-z0-9.\-_:/]{1,120}$/i.test(m) ? m : null);
const validUrl = (u: string | undefined) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.toString().replace(/\/$/, '') : null; } catch { return null; } };

/**
 * Anbieter wählen: `AI_PROVIDER` (gemini | groq | openrouter | mistral | ollama). Ohne Angabe der erste Anbieter, für den
 * ein Schlüssel hinterlegt ist (Reihenfolge wie oben) – so funktionieren bestehende Installationen mit nur `GEMINI_API_KEY` weiter.
 * Ollama braucht keinen Schlüssel und wird deshalb nur bei ausdrücklichem `AI_PROVIDER=ollama` verwendet.
 */
export function aiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const wanted = env.AI_PROVIDER?.trim().toLowerCase();
  const explicit = AI_PROVIDERS.find((p) => p === wanted);
  const provider: AiProviderName = explicit ?? AI_PROVIDERS.find((p) => p !== 'ollama' && keyOf(env, PROVIDER_DEFAULTS[p].keyEnv)) ?? 'gemini';
  const def = PROVIDER_DEFAULTS[provider];
  const apiKey = keyOf(env, def.keyEnv);
  const model = validModel(env.AI_MODEL?.trim()) ?? (provider === 'gemini' ? validModel(env.GEMINI_MODEL?.trim()) : null) ?? def.model;
  const baseUrl = (provider === 'ollama' ? validUrl(env.OLLAMA_BASE_URL) : null) ?? def.base;
  return {
    provider, apiKey, baseUrl, model,
    configured: provider === 'ollama' ? explicit === 'ollama' : !!apiKey,
    timeoutMs: int(env.AI_REVIEW_TIMEOUT_MS, 45_000, 5_000, 120_000),
    maxRetries: int(env.AI_REVIEW_MAX_RETRIES, 1, 0, 3),
    maxConcurrent: int(env.AI_REVIEW_MAX_CONCURRENT, 2, 1, 10),
    dailyLimit: int(env.AI_REVIEW_DAILY_LIMIT, 50, 1, 10_000),
    maxInputChars: int(env.AI_REVIEW_MAX_INPUT_CHARS, 12_000, 2_000, 50_000),
  };
}
/** Ist ein KI-Anbieter eingerichtet? (für Discord-Button „KI-Prüfung“ – der Schlüssel selbst wird nie weitergegeben) */
export const aiConfigured = () => !!createAiProvider(aiConfig());
/** Name der Umgebungsvariable für den Schlüssel (für verständliche Hinweise). */
export const aiKeyHint = (c: AiConfig) => PROVIDER_DEFAULTS[c.provider].keyEnv ?? 'AI_PROVIDER=ollama + OLLAMA_BASE_URL';

// ───────────── Google Gemini ─────────────
interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; status?: string; message?: string; details?: { reason?: string }[] };
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  constructor(private readonly apiKey: string, readonly model: string, private readonly base = PROVIDER_DEFAULTS.gemini.base) {}

  async generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/models/${encodeURIComponent(this.model)}:generateContent`, {
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
  if (status === 404) return new AiProviderError('MODEL', 'Das eingestellte KI-Modell ist nicht verfügbar. Bitte AI_MODEL bzw. GEMINI_MODEL prüfen.');
  if (status === 429) return new AiProviderError('RATE_LIMIT', 'Das Nutzungslimit des KI-Dienstes ist erreicht (z. B. Anfragen pro Minute oder pro Tag in der kostenlosen Stufe). Bitte später erneut versuchen.');
  if (status === 400) return new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat die Anfrage als ungültig abgelehnt. Bitte später erneut versuchen oder das Modell prüfen.');
  if (status >= 500) return new AiProviderError('UNAVAILABLE', 'Der KI-Dienst ist gerade überlastet oder nicht verfügbar. Bitte später erneut versuchen.', true);
  return new AiProviderError('UNAVAILABLE', `Der KI-Dienst hat mit Fehler ${status} geantwortet.`);
}

// ───────────── OpenAI-kompatibel (Groq, OpenRouter, Mistral, Ollama) ─────────────
interface ChatResponse {
  choices?: { message?: { content?: string | null }; finish_reason?: string | null }[];
  model?: string;
  error?: { message?: string; code?: string | number; type?: string };
}
/** Diese Schnittstelle erzwingt kein Schema – es wird deshalb im Prompt mitgegeben und das Ergebnis serverseitig geprüft. */
const SCHEMA_HINT = `\n\n## Antwortformat\nAntworte ausschließlich mit einem JSON-Objekt nach diesem Schema (Typnamen in Großbuchstaben = JSON-Typen):\n${JSON.stringify(AI_REVIEW_RESPONSE_SCHEMA)}`;

export class OpenAiCompatibleProvider implements AiProvider {
  constructor(readonly name: Exclude<AiProviderName, 'gemini'>, private readonly apiKey: string | null, readonly model: string, private readonly base: string) {}

  async generate(req: AiGenerateRequest, signal: AbortSignal): Promise<AiGenerateResult> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/chat/completions`, {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json', ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.model, temperature: 0.2, max_tokens: 4096, response_format: { type: 'json_object' },
          messages: [{ role: 'system', content: req.system + SCHEMA_HINT }, { role: 'user', content: req.user }],
        }),
      });
    } catch {
      if (signal.aborted) throw new AiProviderError('TIMEOUT', 'Die KI hat nicht rechtzeitig geantwortet (Zeitüberschreitung).', true);
      throw new AiProviderError('UNAVAILABLE', 'Der KI-Dienst ist nicht erreichbar (Netzwerkfehler).', true);
    }
    let body: ChatResponse = {};
    try { body = (await res.json()) as ChatResponse; } catch { /* unten behandelt */ }
    if (!res.ok) throw chatError(this.name, res.status);
    const c = body.choices?.[0];
    if (!c) throw new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat kein Ergebnis geliefert.', true);
    if (c.finish_reason === 'length') throw new AiProviderError('BAD_RESPONSE', 'Die KI-Antwort wurde abgeschnitten (zu lang).');
    if (c.finish_reason === 'content_filter') throw new AiProviderError('BLOCKED', 'Der KI-Dienst hat die Antwort aus Sicherheitsgründen abgebrochen. Bitte die Bewerbung manuell prüfen.');
    const text = typeof c.message?.content === 'string' ? c.message.content : '';
    if (!text.trim()) throw new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat eine leere Antwort geliefert.', true);
    return { text, model: body.model || this.model };
  }
}

function chatError(name: string, status: number): AiProviderError {
  const env = PROVIDER_DEFAULTS[name as AiProviderName]?.keyEnv ?? 'den Schlüssel';
  if (status === 401 || status === 403) return new AiProviderError('INVALID_KEY', `Der KI-Schlüssel wurde abgelehnt. Bitte ${env} auf dem Server prüfen.`);
  if (status === 404) return new AiProviderError('MODEL', 'Das eingestellte KI-Modell ist nicht verfügbar. Bitte AI_MODEL prüfen.');
  if (status === 429) return new AiProviderError('RATE_LIMIT', 'Das Nutzungslimit des KI-Dienstes ist erreicht (z. B. in der kostenlosen Stufe). Bitte später erneut versuchen.');
  if (status === 400 || status === 422) return new AiProviderError('BAD_RESPONSE', 'Der KI-Dienst hat die Anfrage als ungültig abgelehnt. Bitte das Modell (AI_MODEL) prüfen.');
  if (status >= 500) return new AiProviderError('UNAVAILABLE', 'Der KI-Dienst ist gerade überlastet oder nicht verfügbar. Bitte später erneut versuchen.', true);
  return new AiProviderError('UNAVAILABLE', `Der KI-Dienst hat mit Fehler ${status} geantwortet.`);
}

/** Für Tests: eigenen Anbieter einsetzen (null = wieder aus der Umgebung). */
let override: ((cfg: AiConfig) => AiProvider | null) | null = null;
export const setAiProviderFactory = (f: ((cfg: AiConfig) => AiProvider | null) | null) => { override = f; };
export function createAiProvider(cfg: AiConfig): AiProvider | null {
  if (override) return override(cfg);
  if (!cfg.configured) return null;
  if (cfg.provider === 'gemini') return cfg.apiKey ? new GeminiProvider(cfg.apiKey, cfg.model) : null;
  return new OpenAiCompatibleProvider(cfg.provider, cfg.apiKey, cfg.model, cfg.baseUrl);
}
