import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { guildRepository } from '@nexus/database';
import { moduleOfApiSegment, normalizeState, type ModuleState } from '@nexus/modules';

const TTL_MS = 5_000;
const cache = new Map<string, { at: number; state: ModuleState }>();

/** Nach einer Änderung im Dashboard sofort wirksam (statt nach Ablauf des kurzen Zwischenspeichers). */
export const forgetModuleState = (guildId: string) => void cache.delete(guildId);

async function stateOf(guildId: string): Promise<ModuleState> {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.state;
  const state = normalizeState(await guildRepository.getModuleState(guildId).catch(() => null));
  cache.set(guildId, { at: Date.now(), state });
  return state;
}

/**
 * Module & Befehle: Endpunkte eines abgeschalteten Moduls (`/guilds/:id/<modulpfad>/…`) antworten mit 403 und einer
 * verständlichen Meldung. Grundfunktionen (Rechte, Design, Logs, Module selbst …) gehören zu keinem Modul.
 */
@Injectable()
export class ModuleGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<{ path?: string; originalUrl?: string }>();
    const path = (req.path ?? req.originalUrl ?? '').split('?')[0] ?? '';
    const m = /\/guilds\/(\d{5,25})\/([a-z-]+)/.exec(path);
    if (!m) return true;
    const mod = moduleOfApiSegment(m[2]!);
    if (!mod) return true;
    if ((await stateOf(m[1]!)).disabled.includes(mod.key)) throw new ForbiddenException(`Das Modul „${mod.label}“ ist auf diesem Server deaktiviert.`);
    return true;
  }
}
