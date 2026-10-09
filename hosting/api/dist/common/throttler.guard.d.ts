import { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
/**
 * Anfragelimit je IP – außer für den eigenen Discord-Bot (gültiges Bot-Token): Er ist ein einzelner Client für alle
 * Discord-Nutzer und liefe sonst bei vielen gleichzeitigen Klicks (z. B. Team-Chance) ins allgemeine Limit.
 * Endpunkte mit eigenem `@Throttle` behalten ihr Limit auch für den Bot.
 */
export declare class BotAwareThrottlerGuard extends ThrottlerGuard {
    private readonly botHash;
    protected shouldSkip(ctx: ExecutionContext): Promise<boolean>;
}
