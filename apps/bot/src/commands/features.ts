import { BotApiError } from '../api';
import { clip, COLORS, DANGER, dangerEmbed, errorReply, listEmbed, okReply, plain, type ButtonSpec, type DangerState, type EmbedData, type Reply, type Row } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';
import { SEK_INTERACTION } from './sek';
import { QUALI_INTERACTION } from './qualifications';

const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();
const choices = (m: Record<string, string>) => Object.keys(m).map((k) => ({ name: k.replace('_', ' '), value: k }));
const needGuildAdmin = (c: Ctx) => (!c.guildId ? errorReply('Das geht nur auf einem Server, nicht per Direktnachricht.') : !c.isGuildAdmin ? errorReply('Dafür brauchst du auf diesem Discord-Server das Recht „Server verwalten“.') : null);

// ---------------- Gefahrenstatus ----------------
const LEVEL = { gruen: 'GREEN', gelb: 'YELLOW', rot: 'RED' } as const;

async function setDanger(c: Ctx, level: string, reason?: string): Promise<Reply> {
  try {
    const s = await c.api.asUser<DangerState>(c.discordId, 'PUT', '/danger-level', { level, ...(reason ? { reason } : {}) });
    await c.refreshLive?.('danger').catch(() => undefined); // Panel sofort nachziehen (sonst spätestens beim nächsten Abgleich)
    return okReply(`Gefahrenstatus: ${DANGER[s.level]?.emoji ?? ''} **${DANGER[s.level]?.label ?? s.level}**`);
  } catch (e) { return mapError(e); }
}

// ---------------- Support-Tickets ----------------
const SUPPORT_PANEL: EmbedData = { title: '🎫 Support', color: COLORS.info, description: 'Fragen, Probleme oder Anliegen an die Leitung? Klicke auf **Ticket öffnen** – es wird ein privater Channel nur für dich und das Team angelegt.' };
const SUPPORT_OPEN: ButtonSpec = { id: 'support:open', label: 'Ticket öffnen', emoji: '🎫', style: 'primary' };
const SUPPORT_CLOSE: ButtonSpec = { id: 'support:close', label: 'Ticket schließen', emoji: '🔒', style: 'danger' };

// ---------------- Funk-Freigabe ----------------
const RADIO = { hinzufuegen: 'add', entfernen: 'remove', pruefen: 'check', liste: 'list' } as const;

export const FEATURE_COMMANDS: CommandDef[] = [
  {
    name: 'gefahrenstatus', description: 'Gefahrenstatus anzeigen, setzen oder als Panel posten',
    options: [
      { name: 'aktion', description: 'Was möchtest du tun? (Standard: anzeigen)', type: 'string', choices: [{ name: 'anzeigen', value: 'anzeigen' }, { name: 'setzen', value: 'setzen' }, { name: 'panel hier posten', value: 'panel' }] },
      { name: 'stufe', description: 'Neue Stufe (bei „setzen“)', type: 'string', choices: choices(LEVEL) },
      { name: 'grund', description: 'Grund (optional, bei „setzen“)', type: 'string', maxLength: 200 },
    ],
    async run(c) {
      const action = str(c, 'aktion') || 'anzeigen';
      if (action === 'setzen') {
        const level = LEVEL[str(c, 'stufe') as keyof typeof LEVEL];
        return level ? setDanger(c, level, str(c, 'grund') || undefined) : errorReply('Bitte eine Stufe wählen (grün, gelb, rot).');
      }
      if (action === 'panel') {
        const denied = needGuildAdmin(c); if (denied) return denied;
        if (!c.channelId || !c.refreshLive) return errorReply('Panel kann hier nicht gepostet werden.');
        try {
          await c.api.asUser(c.discordId, 'GET', '/danger-level'); // nur verknüpfte Benutzer mit Leserecht richten das Panel ein
          await c.refreshLive('danger', { channelId: c.channelId, force: true });
          return okReply('Gefahrenstatus-Panel gepostet. Es aktualisiert sich selbst; ein älteres Panel wird nicht mehr bearbeitet.');
        } catch (e) { return mapError(e); }
      }
      try { return { ephemeral: true, embeds: [dangerEmbed(await c.api.asUser<DangerState>(c.discordId, 'GET', '/danger-level'))] }; } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'teamliste', description: 'Richtet die selbst aktualisierende Teamliste ein bzw. aktualisiert sie sofort',
    async run(c) {
      const denied = needGuildAdmin(c); if (denied) return denied;
      if (!c.refreshLive) return errorReply('Teamliste ist hier nicht verfügbar.');
      try {
        await c.api.asUser(c.discordId, 'GET', '/team/overview'); // Leserecht im System prüfen
        const cfg = await c.config?.();
        const p = await c.refreshLive('teamlist', { channelId: cfg?.teamlist ? undefined : c.channelId, force: true });
        return p ? okReply(`Teamliste steht in <#${p.channelId}> und aktualisiert sich automatisch.`) : errorReply('Kein Channel für die Teamliste gefunden.');
      } catch (e) { return mapError(e); }
    },
  },
  {
    name: 'funkfreigabe', description: 'Funk-Whitelist verwalten (hinzufügen, entfernen, prüfen, Liste)',
    options: [
      { name: 'aktion', description: 'Aktion', type: 'string', required: true, choices: choices(RADIO) },
      { name: 'mitglied', description: 'Discord-Mitglied (nicht bei „liste“)', type: 'user' },
    ],
    async run(c) {
      const action = RADIO[str(c, 'aktion') as keyof typeof RADIO];
      if (!action) return errorReply('Unbekannte Aktion.');
      try {
        if (action === 'list') {
          const rows = await c.api.asUser<Row[]>(c.discordId, 'GET', '/radio-whitelist');
          return { ephemeral: true, embeds: [listEmbed(`📻 Funk-Freigabe (${rows.length})`, rows.map((r) => `• ${r.callsign ? `**${plain(r.callsign)}** ` : ''}${plain(r.displayName)}`), 'Noch niemand freigegeben.')] };
        }
        const target = str(c, 'mitglied');
        if (!/^\d{15,25}$/.test(target)) return errorReply('Bitte ein Mitglied angeben.');
        if (action === 'check') {
          const r = await c.api.asUser<{ whitelisted: boolean; displayName: string }>(c.discordId, 'GET', `/radio-whitelist/check?discordId=${target}`);
          return r.whitelisted ? okReply(`**${plain(r.displayName)}** ist für den Funk freigegeben.`) : errorReply(`**${plain(r.displayName)}** ist **nicht** für den Funk freigegeben.`);
        }
        const r = await c.api.asUser<{ displayName: string }>(c.discordId, 'POST', action === 'add' ? '/radio-whitelist' : '/radio-whitelist/remove', { discordId: target });
        // Optional die Discord-Funkrolle mitziehen (System bleibt maßgeblich; Rollenfehler nur als Hinweis)
        let note = '';
        const cfg = await c.config?.().catch(() => undefined);
        if (cfg?.radioRole && c.guildId && c.platform) {
          try { await c.platform.setRole(c.guildId, target, cfg.radioRole, action === 'add'); note = ` Rolle <@&${cfg.radioRole}> ${action === 'add' ? 'vergeben' : 'entzogen'}.`; }
          catch { note = ' ⚠️ Die Discord-Rolle konnte nicht geändert werden (Bot-Rolle muss über der Funkrolle stehen und „Rollen verwalten“ haben).'; }
        }
        return okReply(`**${plain(r.displayName)}** ${action === 'add' ? 'ist jetzt für den Funk freigegeben' : 'wurde von der Funk-Freigabe entfernt'}.${note}`);
      } catch (e) {
        if (e instanceof BotApiError && e.status === 404) return errorReply('Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft (oder steht nicht auf der Liste).');
        return mapError(e);
      }
    },
  },
  {
    name: 'supportpanel', description: 'Postet das Support-Ticket-Panel in diesen Channel',
    async run(c) {
      const denied = needGuildAdmin(c); if (denied) return denied;
      if (!c.channelId || !c.platform) return errorReply('Panel kann hier nicht gepostet werden.');
      try {
        await c.platform.postPanel({ channelId: c.channelId, embed: SUPPORT_PANEL, buttons: [SUPPORT_OPEN] });
        const cfg = await c.config?.().catch(() => undefined);
        return okReply(`Support-Panel gepostet.${cfg?.staffRole ? '' : ' Tipp: In den Einstellungen eine **Team-Rolle** hinterlegen, damit das Team Tickets sieht.'}`);
      } catch { return errorReply('Panel konnte nicht gepostet werden (fehlen dem Bot Rechte in diesem Channel?).'); }
    },
  },
  {
    name: 'roblox', description: 'Sucht einen Roblox-Benutzer (Name → ID)',
    options: [{ name: 'name', description: 'Roblox-Benutzername', type: 'string', required: true, maxLength: 20 }],
    async run(c) {
      if (!c.robloxLookup) return errorReply('Roblox-Suche ist nicht verfügbar.');
      const u = await c.robloxLookup(str(c, 'name'));
      if (!u) return errorReply(`Kein Roblox-Benutzer „${plain(str(c, 'name'))}“ gefunden (oder Roblox ist gerade nicht erreichbar).`);
      return { ephemeral: true, embeds: [{ title: clip(`🎮 ${plain(u.name)}`, 256), color: COLORS.info, fields: [
        { name: 'Roblox-ID', value: String(u.id), inline: true }, { name: 'Anzeigename', value: clip(plain(u.displayName), 1024), inline: true },
        { name: 'Profil', value: `https://www.roblox.com/users/${u.id}/profile` }] }] };
    },
  },
];

export const INTERACTIONS: InteractionDef[] = [
  SEK_INTERACTION,
  QUALI_INTERACTION,
  {
    prefix: 'danger',
    async run(c) {
      const level = c.args[0] === 'set' ? c.args[1] : undefined;
      return level && level in DANGER ? setDanger(c, level) : errorReply('Unbekannte Aktion.');
    },
  },
  {
    prefix: 'support',
    async run(c) {
      if (!c.guildId || !c.platform) return errorReply('Das geht nur auf einem Server.');
      if (c.args[0] === 'close') {
        if (!c.channelId) return errorReply('Unbekannter Channel.');
        await c.platform.deleteChannel(c.channelId, 5000);
        return okReply('Ticket wird in 5 Sekunden geschlossen.');
      }
      if (c.args[0] !== 'open') return errorReply('Unbekannte Aktion.');
      const cfg = await c.config?.().catch(() => undefined);
      try {
        const t = await c.platform.createTicketChannel({ guildId: c.guildId, userId: c.discordId, userName: c.userName ?? c.discordId, categoryId: cfg?.tickets, staffRoleId: cfg?.staffRole });
        if (t.existing) return okReply(`Du hast schon ein offenes Ticket: <#${t.channelId}>`);
        await c.platform.postPanel({ channelId: t.channelId, embed: { title: '🎫 Ticket geöffnet', color: COLORS.info, description: `<@${c.discordId}>, beschreibe dein Anliegen – das Team meldet sich hier.\nZum Schließen den Button unten nutzen.` }, buttons: [SUPPORT_CLOSE] });
        return okReply(`Dein Ticket: <#${t.channelId}>`);
      } catch { return errorReply('Ticket konnte nicht angelegt werden (fehlen dem Bot die Rechte „Kanäle verwalten“?).'); }
    },
  },
];

export const interactionFor = (customId: string) => {
  const [prefix, ...args] = customId.split(':');
  const def = INTERACTIONS.find((d) => d.prefix === prefix);
  return def ? { def, args } : undefined;
};
