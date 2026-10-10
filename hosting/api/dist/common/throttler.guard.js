"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BotAwareThrottlerGuard = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const env_1 = require("../config/env");
/**
 * Anfragelimit je IP – außer für den eigenen Discord-Bot (gültiges Bot-Token): Er ist ein einzelner Client für alle
 * Discord-Nutzer und liefe sonst bei vielen gleichzeitigen Klicks (z. B. Team-Chance) ins allgemeine Limit.
 * Endpunkte mit eigenem `@Throttle` behalten ihr Limit auch für den Bot.
 */
let BotAwareThrottlerGuard = class BotAwareThrottlerGuard extends throttler_1.ThrottlerGuard {
    botHash = (0, env_1.loadEnv)().BOT_API_TOKEN ? (0, node_crypto_1.createHash)('sha256').update((0, env_1.loadEnv)().BOT_API_TOKEN).digest() : null;
    async shouldSkip(ctx) {
        if (await super.shouldSkip(ctx))
            return true;
        if (ctx.getType() !== 'http' || !this.botHash)
            return false;
        const header = ctx.switchToHttp().getRequest().headers.authorization;
        if (typeof header !== 'string' || !header.startsWith('Bot '))
            return false;
        if (!(0, node_crypto_1.timingSafeEqual)((0, node_crypto_1.createHash)('sha256').update(header.slice(4)).digest(), this.botHash))
            return false;
        const own = this.reflector.getAllAndOverride('THROTTLER:LIMITdefault', [ctx.getHandler(), ctx.getClass()]);
        return own === undefined;
    }
};
exports.BotAwareThrottlerGuard = BotAwareThrottlerGuard;
exports.BotAwareThrottlerGuard = BotAwareThrottlerGuard = __decorate([
    (0, common_1.Injectable)()
], BotAwareThrottlerGuard);
//# sourceMappingURL=throttler.guard.js.map