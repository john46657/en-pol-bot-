import { guildRepository } from '@nexus/database';
import { commandBlock, isModuleEnabled, moduleByKey, normalizeState, type ModuleState } from '@nexus/modules';

/** Modul-Zustand eines Servers (an/aus je Modul und Befehl, im Dashboard unter „Module & Befehle“). */
export async function moduleState(guildId: string): Promise<ModuleState> {
  return normalizeState(await guildRepository.getModuleState(guildId).catch(() => null));
}

/** `null`, wenn der Befehl nutzbar ist – sonst die Meldung für den Benutzer. */
export async function commandBlockedMessage(guildId: string, command: string): Promise<string | null> {
  const r = commandBlock(await moduleState(guildId), command);
  return r.blocked ? r.message : null;
}

/** `null`, wenn das Modul an ist – sonst die Meldung für den Benutzer. */
export async function moduleOffMessage(guildId: string, key: string): Promise<string | null> {
  return isModuleEnabled(await moduleState(guildId), key) ? null : `Das Modul „${moduleByKey(key)?.label ?? key}“ ist auf diesem Server deaktiviert.`;
}
