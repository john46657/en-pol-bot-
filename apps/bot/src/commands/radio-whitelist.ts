import { BotApiError } from '../api';
import { COLORS, errorReply, okReply, plain, type Reply } from '../format';
import type { CommandDef, Ctx, InteractionDef } from './types';
import { mapError } from './errors';

interface FormField { key: string; label: string; placeholder: string; paragraph: boolean; required: boolean; maxLength: number }
interface MemberStatus { status: string | null; authorized: boolean; expiresAt: string | null; suspendedUntil: string | null; pendingSince: string | null; requestsEnabled: boolean; roleOnly?: boolean; form?: { title: string; fields: FormField[] } }
/** Rückfall, falls das System (ältere Version) kein Formular mitschickt – entspricht dem Standardformular. */
const DEFAULT_FORM = { title: 'Antrag auf Funkfreigabe', fields: [
  { key: 'reason', label: 'Begründung', placeholder: 'Warum brauchst du Zugang zum Funk?', paragraph: true, required: true, maxLength: 1000 },
  { key: 'rank', label: 'Dienstgrad (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
  { key: 'department', label: 'Abteilung (falls relevant)', placeholder: '', paragraph: false, required: false, maxLength: 80 },
] };
const STATUS_DE: Record<string, string> = { ACTIVE: '✅ aktiv', PENDING: '🕓 ausstehend', DISABLED: '⏸️ deaktiviert', SUSPENDED: '⛔ gesperrt', EXPIRED: '⌛ abgelaufen', REVOKED: '❌ entzogen' };
const ts = (iso: string) => `<t:${Math.floor(new Date(iso).getTime() / 1000)}:D>`;
const apiError = (e: unknown): Reply => (e instanceof BotApiError && e.status === 503 ? errorReply(e.message) : mapError(e));

/** Formular für den Antrag öffnen (Befehl `/funkantrag` und Button `rwreq:open` im Antrags-Panel). */
async function openRequestForm(c: Ctx): Promise<Reply> {
  if (!c.guildId) return errorReply('Bitte stelle den Antrag auf dem Discord-Server, nicht per Direktnachricht.');
  let s: MemberStatus;
  try {
    s = await c.api.service<MemberStatus>('GET', `/bot/radio-whitelist/status/${c.discordId}`);
    if (s.roleOnly) return s.authorized ? okReply('Du bist bereits für den Funk freigegeben.') : errorReply('Ein Antrag ist nicht nötig – die Funkfreigabe kommt automatisch mit der Funk-Rolle in Discord. Wende dich an die Leitung, wenn du die Rolle bekommen sollst.');
    if (!s.requestsEnabled) return errorReply('Anträge auf Funkfreigabe sind derzeit deaktiviert.');
    if (s.authorized) return okReply('Du bist bereits für den Funk freigegeben.');
    if (s.status === 'SUSPENDED') return errorReply(`Deine Funkfreigabe ist gesperrt${s.suspendedUntil ? ` bis ${ts(s.suspendedUntil)}` : ''} – ein Antrag ist derzeit nicht möglich.`);
    if (s.pendingSince) return okReply(`Du hast bereits einen offenen Antrag (seit ${ts(s.pendingSince)}). Du bekommst eine Direktnachricht, sobald entschieden ist.`);
  } catch (e) { return apiError(e); }
  // Formular so, wie es im Dashboard eingestellt ist (Titel, Felder, Pflichtfelder)
  const form = s.form?.fields?.length ? s.form : DEFAULT_FORM;
  return { modal: { id: 'rwreq:submit', title: form.title.slice(0, 45), fields: form.fields.slice(0, 5).map((f) => ({
    id: f.key, label: f.label.slice(0, 45), paragraph: f.paragraph, required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(f.placeholder ? { placeholder: f.placeholder.slice(0, 100) } : {}),
  })) } };
}

/** Entscheidung in Discord (Buttons unter der Antragsmeldung) – mit den Rechten des verknüpften Kontos (radiowhitelist.requests). */
async function decide(c: Ctx, id: string, decision: 'APPROVE' | 'REJECT', reason?: string): Promise<Reply> {
  try {
    const r = await c.api.asUser<{ decidedByName: string | null }>(c.discordId, 'POST', `/radio-whitelist/requests/${id}/decision`, { decision, ...(reason ? { reason } : {}) });
    const ok = decision === 'APPROVE';
    return {
      ...okReply(ok ? '✅ Antrag genehmigt – das Mitglied wurde per Direktnachricht informiert.' : '❌ Antrag abgelehnt – das Mitglied wurde per Direktnachricht informiert.'),
      decided: { color: ok ? COLORS.success : COLORS.danger, text: `${ok ? '✅ Genehmigt' : '❌ Abgelehnt'} von <@${c.discordId}>${r.decidedByName ? ` (${plain(r.decidedByName)})` : ''}${reason ? `\n**Grund:** ${plain(reason)}` : ''}`.slice(0, 1024) },
    };
  } catch (e) { return apiError(e); }
}

/**
 * 🎙️ Funk-Whitelist: `/funkantrag` (Formular: Begründung, Dienstgrad, Abteilung) und `/funkstatus`.
 * Auch ohne Dashboard-Konto – die Identität ist die Discord-ID der Interaktion; entschieden wird im Dashboard oder per Button.
 */
export const RADIO_WHITELIST_COMMANDS: CommandDef[] = [
  {
    name: 'funkantrag', description: 'Funkfreigabe für den externen Funkdienst beantragen',
    opensModal: true,
    run: openRequestForm,
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

const UUID = /^[0-9a-f-]{36}$/;
/**
 * `rwreq:open` (Button im Antrags-Panel → Formular), `rwreq:submit` (Formular abgeschickt),
 * `rwreq:approve:<id>` / `rwreq:reject:<id>` → `rwreq:rejectsubmit:<id>` (Leitung entscheidet in Discord).
 */
export const RADIO_WHITELIST_INTERACTION: InteractionDef = {
  prefix: 'rwreq',
  opensModal: (args) => args[0] === 'open' || args[0] === 'reject',
  async run(c): Promise<Reply> {
    const [action, id] = c.args;
    if (action === 'open') return openRequestForm(c);
    if (action === 'approve' || action === 'reject' || action === 'rejectsubmit') {
      if (!UUID.test(id ?? '')) return errorReply('Unbekannter Antrag.');
      if (action === 'approve') return decide(c, id!, 'APPROVE');
      if (action === 'reject') return { modal: { id: `rwreq:rejectsubmit:${id}`, title: 'Antrag ablehnen', fields: [{ id: 'reason', label: 'Grund (geht per DM an das Mitglied)', paragraph: true, required: true, minLength: 3, maxLength: 1000 }] } };
      const reason = (c.fields?.reason ?? '').trim();
      if (reason.length < 3) return errorReply('Bitte einen Grund angeben.');
      return decide(c, id!, 'REJECT', reason);
    }
    if (action !== 'submit' || !c.fields) return errorReply('Ungültige Anfrage.');
    const reason = (c.fields.reason ?? '').trim();
    if (reason.length < 3) return errorReply('Bitte begründe deinen Antrag.');
    const answers = Object.fromEntries(Object.entries(c.fields).filter(([k]) => !['reason', 'rank', 'department'].includes(k)).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    try {
      await c.api.service('POST', '/bot/radio-whitelist/requests', {
        guildId: c.guildId ?? null, discordId: c.discordId, discordName: c.userDisplayName ?? c.userName ?? null,
        rank: (c.fields.rank ?? '').trim() || null, department: (c.fields.department ?? '').trim() || null, reason, ...(Object.keys(answers).length ? { answers } : {}),
      });
      return okReply(`📨 Dein Antrag auf Funkfreigabe ist eingegangen. Du bekommst eine Direktnachricht, sobald eine Führungskraft entschieden hat.\n> ${plain(reason).slice(0, 300)}`);
    } catch (e) { return apiError(e); }
  },
};
