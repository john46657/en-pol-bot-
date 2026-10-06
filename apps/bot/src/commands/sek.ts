import { BotApiError } from '../api';
import { COLORS, errorReply, listEmbed, okReply, plain, type Reply, type Row } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

// ---------------- SEK (Spezialeinsatzkommando) ----------------
const str = (c: Ctx, k: string) => String(c.opts[k] ?? '').trim();
const ACTION = { liste: 'list', berichte: 'reports', mein_status: 'me', hinzufuegen: 'add', entfernen: 'remove' } as const;
const day = (iso: unknown) => new Date(String(iso)).toLocaleDateString('de-DE');

/** „05.10.2026“, „5.10.26 21:30“ oder leer (= jetzt). Ungültig → null. */
export function parseGermanDate(s: string, now = new Date()): Date | null {
  if (!s.trim() || /^heute$/i.test(s.trim())) return now;
  const m = s.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, Number(m[2]) - 1, Number(m[1]), Number(m[4] ?? 12), Number(m[5] ?? 0));
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return d.getTime() > now.getTime() + 86_400_000 ? null : d; // nicht in der Zukunft
}

async function setSekRole(c: Ctx, target: string, on: boolean): Promise<string> {
  const cfg = await c.config?.().catch(() => undefined);
  if (!cfg?.sekRole || !c.guildId || !c.platform) return '';
  try { await c.platform.setRole(c.guildId, target, cfg.sekRole, on); return ` Rolle <@&${cfg.sekRole}> ${on ? 'vergeben' : 'entzogen'}.`; }
  catch { return ' ⚠️ Die Discord-Rolle konnte nicht geändert werden (Bot-Rolle muss über der SEK-Rolle stehen und „Rollen verwalten“ haben).'; }
}

export const SEK_COMMANDS: CommandDef[] = [
  {
    name: 'sek', description: 'SEK: Mitgliederliste, Einsatzberichte, dein Status, Mitglieder verwalten',
    options: [
      { name: 'aktion', description: 'Was möchtest du tun? (Standard: liste)', type: 'string', choices: Object.keys(ACTION).map((k) => ({ name: k.replace('_', ' '), value: k })) },
      { name: 'mitglied', description: 'Discord-Mitglied (bei hinzufügen/entfernen)', type: 'user' },
    ],
    async run(c) {
      const action = ACTION[(str(c, 'aktion') || 'liste') as keyof typeof ACTION];
      if (!action) return errorReply('Unbekannte Aktion.');
      try {
        if (action === 'list') {
          const rows = await c.api.asUser<Row[]>(c.discordId, 'GET', '/sek/members');
          return { ephemeral: true, embeds: [{ ...listEmbed(`🎯 SEK – Mitglieder (${rows.length})`, rows.map((r) => `• ${r.callsign ? `**${plain(r.callsign)}** ` : ''}${plain(r.displayName)}${r.rank ? ` · ${plain(r.rank)}` : ''}`), 'Aktuell keine Mitglieder.'), color: COLORS.neutral }] };
        }
        if (action === 'reports') {
          const rows = await c.api.asUser<Row[]>(c.discordId, 'GET', '/sek/reports?limit=10');
          return { ephemeral: true, embeds: [{ ...listEmbed('🎯 SEK – letzte Einsatzberichte', rows.map((r) => `• **${r.number}** · ${day(r.occurredAt)} · ${plain(r.missionType)} — ${plain(r.authorCallsign ?? r.authorName)}`), 'Noch keine Einsatzberichte.'), color: COLORS.neutral }] };
        }
        if (action === 'me') {
          const r = await c.api.asUser<{ member: boolean }>(c.discordId, 'GET', '/sek/me');
          return okReply(r.member ? 'Du bist **Mitglied im SEK**. Einsatzbericht: `/sek-bericht`' : 'Du bist nicht im SEK. Bewerben kannst du dich über das **Qualifikations-Panel** auf dem Server.');
        }
        const target = str(c, 'mitglied');
        if (!/^\d{15,25}$/.test(target)) return errorReply('Bitte ein Mitglied angeben.');
        const r = await c.api.asUser<{ displayName: string }>(c.discordId, 'POST', action === 'add' ? '/sek/members' : '/sek/members/remove', { discordId: target });
        const note = await setSekRole(c, target, action === 'add');
        return okReply(`**${plain(r.displayName)}** ${action === 'add' ? 'ist jetzt Mitglied im SEK' : 'wurde aus dem SEK entfernt'}.${note}`);
      } catch (e) {
        if (e instanceof BotApiError && e.status === 404) return errorReply('Dieses Discord-Konto ist mit keinem aktiven Benutzer verknüpft (oder ist kein SEK-Mitglied).');
        if (e instanceof BotApiError && e.status === 409) return errorReply('Diese Person ist bereits Mitglied im SEK.');
        return mapError(e);
      }
    },
  },
  {
    name: 'sek-bericht', description: 'Erstellt einen SEK-Einsatzbericht (nur SEK-Mitglieder)', opensModal: true,
    async run() {
      return { modal: { id: 'sek:report', title: 'SEK-Einsatzbericht', fields: [
        { id: 'datum', label: 'Datum (leer = heute)', required: false, maxLength: 20, placeholder: 'z. B. 05.10.2026 21:30' },
        { id: 'einsatzart', label: 'Art des Einsatzes', required: true, maxLength: 100, placeholder: 'z. B. Geiselnahme, Zugriff' },
        { id: 'beschreibung', label: 'Beschreibung', paragraph: true, required: true, maxLength: 4000 },
      ] } };
    },
  },
];

export const SEK_INTERACTION: InteractionDef = {
  prefix: 'sek',
  async run(c): Promise<Reply> {
    const f = c.fields ?? {};
    const v = (k: string) => (f[k] ?? '').trim();
    try {
      if (c.args[0] === 'report') {
        const when = parseGermanDate(v('datum'));
        if (!when) return errorReply('Ungültiges Datum. Bitte so angeben: 05.10.2026 oder 05.10.2026 21:30 (oder leer lassen).');
        if (v('beschreibung').length < 5) return errorReply('Bitte eine Beschreibung angeben.');
        const r = await c.api.asUser<{ number: string }>(c.discordId, 'POST', '/sek/reports', { occurredAt: when.toISOString(), missionType: v('einsatzart'), description: v('beschreibung') });
        return okReply(`SEK-Einsatzbericht **${r.number}** gespeichert.`);
      }
      return errorReply('Unbekannte Aktion.');
    } catch (e) {
      if (e instanceof BotApiError && e.status === 403 && c.args[0] === 'report') return errorReply('Einsatzberichte können nur SEK-Mitglieder schreiben.');
      return mapError(e);
    }
  },
};
