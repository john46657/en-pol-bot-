import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { BotAwareThrottlerGuard } from '../src/common/throttler.guard';

const TOKEN = 'test-bot-token-throttler-0123456789abcdefgh';
class Routes { plain() {} @Throttle({ default: { limit: 5, ttl: 60_000 } }) limited() {} }
const ctx = (handler: () => void, authorization?: string) => ({
  getType: () => 'http', getHandler: () => handler, getClass: () => Routes,
  switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
}) as unknown as ExecutionContext;

describe('Anfragelimit: eigener Bot ist vom allgemeinen IP-Limit ausgenommen', () => {
  let guard: BotAwareThrottlerGuard;
  beforeAll(() => {
    process.env.BOT_API_TOKEN = TOKEN;
    guard = new BotAwareThrottlerGuard({ throttlers: [{ ttl: 60_000, limit: 300 }] }, {} as never, new Reflector());
  });
  afterAll(() => { delete process.env.BOT_API_TOKEN; });
  const skip = (c: ExecutionContext) => (guard as unknown as { shouldSkip: (c: ExecutionContext) => Promise<boolean> }).shouldSkip(c);

  it('skips only for the valid bot token and only without an own @Throttle', async () => {
    expect(await skip(ctx(Routes.prototype.plain, `Bot ${TOKEN}`))).toBe(true);
    expect(await skip(ctx(Routes.prototype.plain, 'Bot falsches-token-0123456789abcdefghijklmn'))).toBe(false);
    expect(await skip(ctx(Routes.prototype.plain))).toBe(false);
    expect(await skip(ctx(Routes.prototype.limited, `Bot ${TOKEN}`))).toBe(false); // eigenes Limit gilt auch für den Bot
  });
});
