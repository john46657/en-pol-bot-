import { SetMetadata } from '@nestjs/common';

export const GUILD_ADMIN_KEY = 'nexus:guild-admin';

/**
 * Endpoint nur für Server-Besitzer, Administratoren und „Server verwalten“ (Discord-seitig, serverseitig geprüft).
 * Für sensible Konfiguration wie Permission-Zuordnung und Audit-Log – eine NEXUS-Rolle genügt hier nicht.
 */
export const RequireGuildAdmin = () => SetMetadata(GUILD_ADMIN_KEY, true);
