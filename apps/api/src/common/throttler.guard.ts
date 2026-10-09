import { createHash, timingSafeEqual } from 'node:crypto';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { loadEnv } from '../config/env';

/**
 * Anfragelimit je IP – außer für den eigenen Discord-Bot (gültiges Bot-Token): Er ist ein einzelner Client für alle
 * Discord-Nutzer und liefe sonst bei vielen gleichzeitigen Klicks (z. B. Team-Chance) ins allgemeine Limit.
 * Endpunkte mit eigenem `@Throttle` behalten ihr Limit auch für den Bot.
 */
@Injectable()
export class BotAwareThrottlerGuard extends ThrottlerGuard {
  private readonly botHash = loadEnv().BOT_API_TOKEN ? createHash('sha256').update(loadEnv().BOT_API_TOKEN!).digest() : null;

  protected override async shouldSkip(ctx: ExecutionContext): Promise<boolean> {
    if (await super.shouldSkip(ctx)) return true;
    if (ctx.getType() !== 'http' || !this.botHash) return false;
    const header = ctx.switchToHttp().getRequest<{ headers: Record<string, unknown> }>().headers.authorization;
    if (typeof header !== 'string' || !header.startsWith('Bot ')) return false;
    if (!timingSafeEqual(createHash('sha256').update(header.slice(4)).digest(), this.botHash)) return false;
    const own = this.reflector.getAllAndOverride<number | undefined>('THROTTLER:LIMITdefault', [ctx.getHandler(), ctx.getClass()]);
    return own === undefined;
  }
}
