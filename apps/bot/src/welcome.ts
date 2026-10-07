import { hexColor, renderWelcomeText, type WelcomeConfig, type WelcomeMember, type WelcomeMessageDef } from '@enrp/shared';
import type { Api } from './api';
import type { EmbedData } from './format';

/** Was der Bot für Willkommen/Abschied in Discord tut (echte Umsetzung in index.ts, in Tests ein Fake). */
export interface WelcomeActions {
  post(channelId: string, m: { content?: string; mentionUserIds?: string[]; embed: EmbedData; file?: { name: string; data: Buffer } }): Promise<void>;
  dm(userId: string, text: string): Promise<void>;
  addRoles(guildId: string, userId: string, roleIds: string[]): Promise<void>;
}
export interface MemberEvent extends WelcomeMember { guildId: string; bot: boolean; avatar?: string | null }

const CACHE_MS = 30_000;

/** Nachricht (Willkommen oder Abschied) als Embed – leere Titel/Texte fallen weg. */
export function welcomeEmbed(def: WelcomeMessageDef, m: MemberEvent, now = Date.now(), bannerFile?: string): EmbedData {
  const title = renderWelcomeText(def.title, m, now).slice(0, 256);
  const description = renderWelcomeText(def.message, m, now).slice(0, 4000);
  const image = bannerFile ? `attachment://${bannerFile}` : def.image;
  return { title: title || '​', ...(description ? { description } : {}), color: hexColor(def.color), ...(def.showAvatar && m.avatar ? { thumbnail: m.avatar } : {}), ...(image ? { image } : {}) };
}

/**
 * Beitritt: Willkommensnachricht, DM, automatische Rollen. Austritt: Abschiedsnachricht und Meldung an das System
 * (offene Bewerbungen/Tickets nach Einstellung). Braucht den privilegierten „Server Members“-Intent.
 */
export function createWelcome(api: Api, actions: WelcomeActions, log: (m: string) => void = console.error) {
  const cache = new Map<string, { at: number; cfg: WelcomeConfig }>();
  const config = async (guildId: string) => {
    const hit = cache.get(guildId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.cfg;
    const cfg = await api.service<WelcomeConfig>('GET', `/bot/welcome?guildId=${guildId}`);
    cache.set(guildId, { at: Date.now(), cfg });
    return cfg;
  };
  const step = (label: string, p: Promise<unknown>) => p.catch((e) => log(`${label} failed: ${e instanceof Error ? e.message : e}`));
  // hochgeladene Banner (Datei bleibt gleich, solange die ID gleich ist)
  const banners = new Map<string, { name: string; data: Buffer }>();
  const banner = async (id: string) => {
    if (!banners.has(id)) {
      const b = await api.service<{ name: string; data: string }>('GET', `/bot/welcome/banner/${id}`);
      if (banners.size > 20) banners.clear();
      banners.set(id, { name: b.name.replace(/[^\w.-]/g, '') || 'banner.png', data: Buffer.from(b.data, 'base64') });
    }
    return banners.get(id)!;
  };
  const say = async (def: WelcomeMessageDef, m: MemberEvent) => {
    if (!def.enabled || !def.channelId) return;
    const file = def.imageMediaId ? await banner(def.imageMediaId).catch((e) => { log(`banner not loaded: ${e instanceof Error ? e.message : e}`); return undefined; }) : undefined;
    await actions.post(def.channelId, { ...(def.pingUser ? { content: `<@${m.id}>`, mentionUserIds: [m.id] } : {}), embed: welcomeEmbed(def, m, Date.now(), file?.name), ...(file ? { file } : {}) });
  };

  return {
    async joined(m: MemberEvent) {
      if (m.bot) return;
      const cfg = await config(m.guildId).catch((e) => { log(`welcome config not loaded: ${e instanceof Error ? e.message : e}`); return null; });
      if (!cfg) return;
      await Promise.all([
        step('welcome message', say(cfg.welcome, m)),
        cfg.dm.enabled && cfg.dm.message.trim() ? step('welcome DM', actions.dm(m.id, renderWelcomeText(cfg.dm.message, m).slice(0, 2000))) : undefined,
        cfg.autoRoleIds.length ? step('auto roles', actions.addRoles(m.guildId, m.id, cfg.autoRoleIds)) : undefined,
      ]);
    },
    async left(m: MemberEvent) {
      if (m.bot) return;
      const cfg = await config(m.guildId).catch((e) => { log(`welcome config not loaded: ${e instanceof Error ? e.message : e}`); return null; });
      await Promise.all([
        cfg ? step('goodbye message', say(cfg.goodbye, m)) : undefined,
        step('member-left actions', api.service('POST', '/bot/member-left', { guildId: m.guildId, discordId: m.id })),
      ]);
    },
    /** Nach dem Speichern im Dashboard nicht 30 s warten müssen (Tests). */
    clear() { cache.clear(); },
  };
}
