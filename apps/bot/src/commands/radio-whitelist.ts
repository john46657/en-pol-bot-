import { BotApiError } from '../api';
import { COLORS, errorReply, okReply, plain, type Reply } from '../format';
import type { CommandDef, InteractionDef } from './types';
import { mapError } from './errors';

interface MemberStatus { status: string | null; authorized: boolean; expiresAt: string | null; suspendedUntil: string | null; pendingSince: string | null; requestsEnabled: boolean }
const STATUS_DE: Record<string, string> = { ACTIVE: '✅ aktiv', PENDING: '🕓 ausstehend', DISABLED: '⏸️ deaktiviert', SUSPENDED: '⛔ gesperrt', EXPIRED: '⌛ abgelaufen', REVOKED: '❌ entzogen' };
const ts = (iso: string) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`;
const apiError = (e: unknown): Reply => (e instanceof BotApiError && e.status === 503 ? errorReply(e.message) : mapError(e));

/**
 * 🎙️ Funk-Whitelist: `/funkantrag` (Formular: Begründung, Dienstgrad, Abteilung) und `/funkstatus`.
 * Auch ohne Dashboard-Konto – die Identität ist die Discord-ID der Interaktion; entschieden wird im Dashboard.
 */
export const RADIO_WHITELIST_COMMANDS: CommandDef[] = [
  {
    name: 'funkantrag', description: 'Funkfreigabe für den externen Funkdienst beantragen',
    opensModal: true,
    async run(c): Promise<Reply> {
      if (!c.guildId) return errorReply('Bitte stelle den Antrag auf dem Discord-Server, nicht per Direktnachricht.');
      try {
        const s = await c.api.service<MemberStatus>('GET', `/bot/radio-whitelist/status/${c.discordId}`);
        if (!s.requestsEnabled) return errorReply('Anträge auf Funkfreigabe sind derzeit deaktiviert.');
        if (s.authorized) return okReply('Du bist bereits für den Funk freigegeben.');
        if (s.status === 'SUSPENDED') return errorReply(`Deine Funkfreigabe ist gesperrt${s.suspendedUntil ? ` bis ${ts(s.suspendedUntil)}` : ''} – ein Antrag ist derzeit nicht möglich.`);
      } catch (e) { return apiError(e); }
      return { modal: { id: 'rwreq:submit', title: 'Antrag auf Funkfreigabe', fields: [
        { id: 'reason', label: 'Begründung', paragraph: true, required: true, maxLength: 1000, placeholder: 'Warum brauchst du Zugang zum Funk?' },
        { id: 'rank', label: 'Dienstgrad (falls relevant)', required: false, maxLength: 80 },
        { id: 'department', label: 'Abteilung (falls relevant)', required: false, maxLength: 80 },
      ] } };
    },
  },
  {
    name: 'funkstatus', description: 'Deinen Status in der Funk-Whitelist anzeigen',
    async run(c): Promise<Reply> {
      try {
        const s = await c.api.service<MemberStatus>('GET', `/bot/radio-whitelist/status/${c.discordId}`);
        const lines = [
          `**Status:** ${s.status ? STATUS_DE[s.status] ?? s.status : 'nicht freigegeben'}`,
          ...(s.expiresAt && s.status === 'ACTIVE' ? [`**Gültig bis:** ${ts(s.expiresAt)}`] : []),
          ...(s.suspendedUntil && s.status === 'SUSPENDED' ? [`**Gesperrt bis:** ${ts(s.suspendedUntil)}`] : []),
          ...(s.pendingSince ? [`**Offener Antrag seit:** ${ts(s.pendingSince)}`] : []),
        ];
        return { ephemeral: true, embeds: [{ title: '🎙️ Funk-Whitelist', description: lines.join('\n'), color: s.authorized ? COLORS.success : COLORS.neutral }] };
      } catch (e) { return apiError(e); }
    },
  },
];

/** Formular-Absendung `rwreq:submit`. */
export const RADIO_WHITELIST_INTERACTION: InteractionDef = {
  prefix: 'rwreq',
  async run(c): Promise<Reply> {
    if (c.args[0] !== 'submit' || !c.fields) return errorReply('Ungültige Anfrage.');
    const reason = (c.fields.reason ?? '').trim();
    if (reason.length < 10) return errorReply('Bitte begründe deinen Antrag etwas ausführlicher (mind. 10 Zeichen).');
    try {
      await c.api.service('POST', '/bot/radio-whitelist/requests', {
        guildId: c.guildId ?? null, discordId: c.discordId, discordName: c.userDisplayName ?? c.userName ?? null,
        rank: (c.fields.rank ?? '').trim() || null, department: (c.fields.department ?? '').trim() || null, reason,
      });
      return okReply(`📨 Dein Antrag auf Funkfreigabe ist eingegangen. Du bekommst eine Direktnachricht, sobald eine Führungskraft entschieden hat.\n> ${plain(reason).slice(0, 300)}`);
    } catch (e) { return apiError(e); }
  },
};
