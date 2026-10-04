import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * GuildId aus der Route (URL: /api/v1/guilds/:guildId/...).
 *
 * Guild-Context ist bei JEDER Query Pflicht (§113). Decorator extrahiert
 * nur den Rohwert – Validierung und Isolation passieren serverseitig
 * im GuildContextInterceptor/Guard.
 */
export const GuildId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{
    params: { guildId?: string };
  }>();
  const guildId = request.params['guildId'];
  if (!guildId) {
    throw new Error('GuildId fehlt in der Route – jede Query muss Guild-Context haben (§113).');
  }
  return guildId;
});
