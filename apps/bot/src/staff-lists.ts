import type { Client } from 'discord.js';
import { renderStaffList, type StaffList } from '@enrp/shared';
import type { Api } from './api';
import { postOrUpdate } from './messages';

/**
 * Staff-Listen (Discord-Teamliste nach Rollen, Einstellungen im Dashboard): der Bot rechnet die Mitglieder je Rolle selbst
 * und bearbeitet die Nachricht nur, wenn sich etwas geändert hat. Bei Rollenänderungen wird kurz verzögert neu gezeichnet.
 */
export function createStaffLists(client: () => Client, api: Api, log: (m: string) => void = console.log) {
  const last = new Map<string, string>();
  let timer: NodeJS.Timeout | undefined;

  async function render(l: StaffList) {
    const c = client();
    const guilds = l.guildId ? [c.guilds.cache.get(l.guildId)].filter((g) => !!g) : [...c.guilds.cache.values()];
    const members = new Map<string, { id: string; name: string; roleIds: string[] }>();
    for (const g of guilds) {
      for (const s of l.sections) {
        const role = g.roles.cache.get(s.roleId);
        if (!role) continue;
        for (const m of role.members.values()) {
          if (m.user.bot) continue;
          const prev = members.get(m.id);
          members.set(m.id, { id: m.id, name: m.displayName, roleIds: [...new Set([...(prev?.roleIds ?? []), ...m.roles.cache.keys()])] });
        }
      }
    }
    return renderStaffList(l, [...members.values()]);
  }

  /** Eine oder alle Listen aktualisieren. `force`: auch ohne Änderung neu bearbeiten (bzw. `forceNew`: neue Nachricht). */
  async function refresh(o: { id?: string; force?: boolean; forceNew?: boolean } = {}) {
    const lists = await api.service<StaffList[]>('GET', '/bot/panels/staff');
    for (const l of lists) {
      if ((o.id && l.id !== o.id) || !l.channelId || (!o.id && !l.autoUpdate)) continue;
      const message = await render(l);
      const sig = `${l.channelId}|${JSON.stringify({ ...message, embeds: message.embeds?.map((e) => ({ ...e, timestamp: undefined })) })}`;
      if (!o.force && !o.forceNew && last.get(l.id) === sig) continue;
      await postOrUpdate(client(), api, { channelId: l.channelId, message, stateKey: `staff-${l.id}`, forceNew: !!o.forceNew });
      last.set(l.id, sig);
    }
  }

  /** Rollen/Mitglieder geändert → gesammelt nach 10 Sekunden neu zeichnen. */
  function changed() {
    clearTimeout(timer);
    timer = setTimeout(() => void refresh().catch((e) => log(`staff lists: ${e instanceof Error ? e.message : e}`)), 10_000);
    timer.unref?.();
  }

  function start(seconds = 300) {
    let lastError: string | undefined;
    const tick = () => void refresh().then(() => { lastError = undefined; }, (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg !== lastError) { log(`staff lists: refresh failed: ${msg}`); lastError = msg; }
    });
    setTimeout(tick, 15_000).unref?.();
    setInterval(tick, seconds * 1000).unref?.();
  }
  return { refresh, changed, start };
}
