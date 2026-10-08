import type { Actor } from '../audit/audit.service';
import { currentGuild, runInGuild } from './guild-context';

/** Angenommene Bewerbung (Polizei = kind 'police', Qualifikation = Name der Einheit). */
export interface AcceptedApplication { applicationId: string; number: string; kind: string; discordId: string | null; name: string; robloxUsername?: string | null; robloxUserId?: string | null; /** Discord-Server, auf dem die Bewerbung gestartet wurde */ guildId?: string | null }
type Handler = (actor: Actor, a: AcceptedApplication) => Promise<void>;

/**
 * Entkoppelt Bewerbungen vom Personal-/Dienstnummern-System (keine Modul-Abhängigkeit im Kreis):
 * das Personalmodul meldet sich beim Start an, Bewerbungen melden Annahmen. Fehler stoppen die Entscheidung nie.
 * Personalakte und Dienstnummer entstehen auf dem Server der Bewerbung (sonst auf dem gewählten Server).
 */
export const hireEvents = {
  handler: null as Handler | null,
  async accepted(actor: Actor, a: AcceptedApplication) {
    if (!this.handler) return;
    try { const h = this.handler; await runInGuild(a.guildId || currentGuild(), () => h(actor, a)); } catch (e) { console.error(`hire automation failed for ${a.number}: ${e instanceof Error ? e.message : e}`); }
  },
};
