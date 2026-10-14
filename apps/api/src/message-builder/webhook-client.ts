import { Injectable } from '@nestjs/common';
import { describeDiscordError } from '@enrp/shared';

/** Discord-Webhook-URL (nur offizielle Discord-Hosts). Das Token in der URL ist geheim. */
export const WEBHOOK_URL = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d{1,2})?\/webhooks\/(\d{15,25})\/([\w-]{20,200})\/?$/;

type FetchFn = (url: string, init: { method: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;
export class DiscordHttpError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Direkter Aufruf von Discord-Webhooks aus der API (der Bot-Token wird dafür nicht gebraucht).
 * Beachtet Discord-Rate-Limits: bei 429 wird `retry_after` abgewartet (höchstens 3 Versuche, je max. 30 s).
 * Fehlermeldungen enthalten nie die Webhook-URL.
 */
@Injectable()
export class WebhookClient {
  /** In Tests ersetzbar. */
  fetch: FetchFn = (url, init) => fetch(url, init) as never;
  /** In Tests verkürzbar. */
  sleep = sleep;

  private async call(url: string, method: 'GET' | 'POST', body?: unknown): Promise<Record<string, unknown>> {
    for (let attempt = 1; ; attempt++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15_000);
      let res: Awaited<ReturnType<FetchFn>>;
      try {
        res = await this.fetch(url, { method, signal: ctl.signal, headers: { 'content-type': 'application/json', 'user-agent': 'EN-Polizei-MessageBuilder/1.0' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      } catch {
        throw new DiscordHttpError('Discord ist nicht erreichbar (Netzwerkfehler oder Zeitüberschreitung).', 0);
      } finally { clearTimeout(timer); }
      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { json = {}; }
      if (res.status === 429 && attempt < 3) {
        const wait = Number(json.retry_after ?? res.headers.get('retry-after') ?? 1);
        await this.sleep(Math.min(30, Math.max(0.1, Number.isFinite(wait) ? wait : 1)) * 1000);
        continue;
      }
      if (res.status >= 400) throw new DiscordHttpError(describeDiscordError({ status: res.status, code: typeof json.code === 'number' ? json.code : undefined, message: typeof json.message === 'string' ? json.message : undefined }), res.status);
      // Bucket leer: bis zum Zurücksetzen warten, damit die nächste Nachricht nicht abgewiesen wird
      if (res.headers.get('x-ratelimit-remaining') === '0') {
        const after = Number(res.headers.get('x-ratelimit-reset-after') ?? 0);
        if (after > 0) await this.sleep(Math.min(30, after) * 1000);
      }
      return json;
    }
  }

  /** Webhook-Daten (Server, Kanal, Name) – prüft, dass die URL gültig ist. */
  async info(url: string) {
    const j = await this.call(url, 'GET');
    return { id: String(j.id ?? ''), guildId: typeof j.guild_id === 'string' ? j.guild_id : null, channelId: typeof j.channel_id === 'string' ? j.channel_id : null, name: typeof j.name === 'string' ? j.name : null };
  }

  /** Nachricht senden (`wait=true` → Discord liefert die Nachricht samt ID; `with_components=true` → Link-Buttons erlaubt). */
  async execute(url: string, body: Record<string, unknown>): Promise<{ messageId: string }> {
    const base = url.replace(/\/$/, '');
    const j = await this.call(`${base}?wait=true&with_components=true`, 'POST', body);
    return { messageId: String(j.id ?? '') };
  }
}
