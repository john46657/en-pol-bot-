import { BotApiError } from '../api';
import { COLORS, errorReply, okReply, plain, type Reply } from '../format';
import type { VerifyLink, VerifyStatus } from '../verify';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

/** Fachliche Meldungen der Verifizierung (z. B. „Wörter stehen nicht im Profil“) direkt zeigen. */
const fail = (e: unknown): Reply => (e instanceof BotApiError && [400, 404, 409, 503].includes(e.status) ? errorReply(e.message) : mapError(e));
const ts = (iso: string) => `<t:${Math.floor(Date.parse(iso) / 1000)}:R>`;

/** „Verifizieren“: direkt mit Roblox anmelden (OAuth). Nur wenn das noch nicht eingerichtet ist, geht es über den Code im Profil. */
async function startVerify(c: Ctx): Promise<Reply> {
  try {
    const r = await c.api.service<{ enabled: boolean; allowCode?: boolean; url?: string; expiresAt?: string }>('POST', '/bot/verify/oauth', { ...(c.guildId ? { guildId: c.guildId } : {}), discordId: c.discordId, ...(c.userName ? { discordName: c.userName } : {}) });
    if (!r.enabled || !r.url) return { ephemeral: true, content: 'Bestätige dein Roblox-Konto mit einem Code in deinem Profil:', buttons: [{ id: 'verify:code', label: 'Roblox-Namen eingeben', style: 'success', emoji: '✅' }] };
    return {
      ephemeral: true,
      embeds: [{ title: '✅ Mit Roblox verifizieren', color: COLORS.success, description: `Klick auf **Mit Roblox anmelden**, melde dich bei Roblox an und bestätige den Zugriff.\nDanach bekommst du hier automatisch deine Rollen und deinen Nickname.${r.allowCode !== false ? '\nKlappt das nicht, nimm **Mit Code verifizieren**.' : ''}\n\nDer Link gilt nur für dich und läuft ${ts(r.expiresAt!)} ab.` }],
      buttons: [{ id: 'link', label: 'Mit Roblox anmelden', style: 'secondary', url: r.url }, ...(r.allowCode !== false ? [{ id: 'verify:code', label: 'Mit Code verifizieren', style: 'secondary' as const }] : [])],
    };
  } catch (e) { return fail(e); }
}

const nameModal = (): Reply => ({ modal: { id: 'verify:name', title: 'Roblox-Verifizierung', fields: [{ id: 'roblox', label: 'Dein Roblox-Benutzername', required: true, minLength: 3, maxLength: 20, placeholder: 'z. B. Builderman' }] } });

/** Rollen/Nickname auf diesem Server setzen und das Ergebnis als Text zurückgeben. */
async function applyHere(c: Ctx, s: VerifyStatus): Promise<string> {
  if (!c.guildId || !s.enabled || !s.actions || !c.verifyApply) return '';
  const problems = await c.verifyApply(c.guildId, c.discordId, s.actions).catch((e) => [e instanceof Error ? e.message : 'Rollen konnten nicht gesetzt werden']);
  const parts = [s.actions.add.length ? `Rollen: ${s.actions.add.map((r) => `<@&${r}>`).join(' ')}` : '', s.actions.nickname ? `Nickname: **${plain(s.actions.nickname)}**` : ''].filter(Boolean);
  return [parts.join('\n'), problems.length ? `⚠️ ${problems.join(' · ')}` : ''].filter(Boolean).join('\n');
}

const linkFields = (l: VerifyLink) => [
  { name: 'Roblox', value: `[${plain(l.robloxName)}](${l.profileUrl})`, inline: true },
  { name: 'Anzeigename', value: plain(l.displayName), inline: true },
  { name: 'Roblox-ID', value: l.robloxId, inline: true },
  { name: 'Verifiziert', value: ts(l.verifiedAt), inline: true },
];

export const VERIFY_INTERACTION: InteractionDef = {
  prefix: 'verify',
  opensModal: (args) => args[0] === 'code',
  async run(c): Promise<Reply> {
    const action = c.args[0];
    if (action === 'start') return startVerify(c);
    if (action === 'code') return nameModal();
    if (action === 'name') {
      try {
        const r = await c.api.service<{ code: string; expiresAt: string; roblox: { id: string; name: string; displayName: string; avatarUrl: string | null; profileUrl: string } }>('POST', '/bot/verify/start', { ...(c.guildId ? { guildId: c.guildId } : {}), discordId: c.discordId, roblox: (c.fields?.roblox ?? '').trim() });
        return {
          ephemeral: true,
          embeds: [{
            title: `Bist du ${plain(r.roblox.name)}?`, color: COLORS.info, ...(r.roblox.avatarUrl ? { thumbnail: r.roblox.avatarUrl } : {}),
            description: [
              'Damit wir wissen, dass das Konto dir gehört:',
              `**1.** Öffne dein [Roblox-Profil](https://www.roblox.com/users/${r.roblox.id}/profile) → **Bearbeiten** (Stift bei „Über mich“).`,
              '**2.** Füge diese Wörter irgendwo in **„Über mich“** ein und speichere:',
              `\`\`\`${r.code}\`\`\``,
              '**3.** Klick unten auf **Fertig – prüfen**.',
              '',
              `Der Code läuft ${ts(r.expiresAt)} ab. Danach kannst du die Wörter wieder löschen.`,
            ].join('\n'),
            footer: `Anzeigename: ${r.roblox.displayName} · ID ${r.roblox.id}`,
          }],
          buttons: [
            { id: 'verify:check', label: 'Fertig – prüfen', style: 'success', emoji: '✅' },
            { id: 'verify:code', label: 'Anderes Konto', style: 'secondary' },
          ],
        };
      } catch (e) { return fail(e); }
    }
    if (action === 'check') {
      try {
        const s = await c.api.service<VerifyStatus>('POST', '/bot/verify/check', { ...(c.guildId ? { guildId: c.guildId } : {}), discordId: c.discordId, ...(c.userName ? { discordName: c.userName } : {}) });
        const done = await applyHere(c, s);
        return { ephemeral: true, embeds: [{ title: `✅ Verifiziert als ${plain(s.link!.robloxName)}`, color: COLORS.success, description: ['Dein Roblox-Konto ist jetzt mit Discord verknüpft. Die Wörter kannst du wieder aus deinem Profil löschen.', done].filter(Boolean).join('\n\n'), fields: linkFields(s.link!) }] };
      } catch (e) { return fail(e); }
    }
    if (action === 'update') return update(c);
    return errorReply('Unbekannte Aktion.');
  },
};

async function update(c: Ctx, userId = c.discordId): Promise<Reply> {
  if (!c.guildId) return errorReply('Das geht nur auf einem Server.');
  try {
    const s = await c.api.service<VerifyStatus>('POST', '/bot/verify/status', { guildId: c.guildId, discordId: userId, ...(userId === c.discordId && c.userName ? { discordName: c.userName } : {}) });
    if (!s.enabled) return errorReply('Die Roblox-Verifizierung ist auf diesem Server nicht aktiviert.');
    if (!s.link && userId === c.discordId) return { ...nameModalHint(), ephemeral: true };
    const problems = s.actions && c.verifyApply ? await c.verifyApply(c.guildId, userId, s.actions).catch((e) => [e instanceof Error ? e.message : 'fehlgeschlagen']) : [];
    const who = userId === c.discordId ? 'Deine' : `Die von <@${userId}>`;
    return okReply(`${who} Rollen${s.actions?.nickname ? ' und Nickname' : ''} sind aktualisiert${s.link ? ` (Roblox: **${plain(s.link.robloxName)}**)` : ' (nicht verifiziert)'}.${problems.length ? `\n⚠️ ${problems.join(' · ')}` : ''}`);
  } catch (e) { return fail(e); }
}
const nameModalHint = (): Reply => ({ content: 'Du bist noch nicht verifiziert.', buttons: [{ id: 'verify:start', label: 'Jetzt verifizieren', style: 'success', emoji: '✅' }] });

export const VERIFY_COMMANDS: CommandDef[] = [
  { name: 'verifizieren', description: 'Verknüpft dein Roblox-Konto mit Discord (Rollen und Nickname)', async run(c) { return startVerify(c); } },
  {
    name: 'aktualisieren', description: 'Setzt Rollen und Nickname aus deiner Roblox-Verifizierung neu',
    options: [{ name: 'mitglied', description: 'Anderes Mitglied (nur mit „Server verwalten“)', type: 'user' }],
    async run(c) {
      const other = typeof c.opts.mitglied === 'string' && c.opts.mitglied !== c.discordId ? c.opts.mitglied : undefined;
      if (other && !c.isGuildAdmin) return errorReply('Andere Mitglieder aktualisieren dürfen nur Leute mit „Server verwalten“.');
      return update(c, other);
    },
  },
  {
    name: 'whois', description: 'Zeigt das verifizierte Roblox-Konto eines Mitglieds',
    options: [{ name: 'mitglied', description: 'Discord-Mitglied', type: 'user', required: true }],
    async run(c) {
      const id = String(c.opts.mitglied ?? '');
      try {
        const { link } = await c.api.service<{ link: VerifyLink | null }>('GET', `/bot/verify/whois?discordId=${id}`);
        if (!link) return { ephemeral: true, content: `<@${id}> ist nicht mit Roblox verifiziert.` };
        return { ephemeral: true, embeds: [{ title: `🔎 ${plain(link.robloxName)}`, color: COLORS.info, description: `<@${id}>`, fields: linkFields(link) }] };
      } catch (e) { return fail(e); }
    },
  },
];
