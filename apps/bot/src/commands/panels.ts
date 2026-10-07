import type { MessageSpec } from '@enrp/shared';
import { errorReply, type Reply } from '../format';
import type { InteractionDef } from './types';
import { mapError } from './errors';

interface PanelField { id: string; label: string; placeholder: string; long: boolean; required: boolean; maxLength: number }
interface Submitted {
  submissionId: string; channelId: string | null; previous: { channelId: string; messageId: string } | null; message: MessageSpec; asUser: boolean; confirmText: string; grantRoleIds: string[];
}

/** Formular-Panels: Button → Formular (Felder aus dem Dashboard) → Nachricht im Zielkanal (optional als die Person, mit Reaktionen). */
export const FORM_PANEL_INTERACTION: InteractionDef = {
  prefix: 'fpanel',
  opensModal: (args) => args.length === 1,
  async run(c): Promise<Reply> {
    const id = c.args[0] ?? '';
    if (!/^[0-9a-f-]{36}$/.test(id)) return errorReply('Unbekanntes Panel.');
    try {
      if (c.args[1] !== 'submit') {
        const p = await c.api.service<{ modalTitle: string; fields: PanelField[] }>('GET', `/bot/panels/forms/${id}`);
        return { modal: { id: `fpanel:${id}:submit`, title: p.modalTitle, fields: p.fields.map((f) => ({ id: f.id, label: f.label, paragraph: f.long, required: f.required, maxLength: Math.min(f.maxLength, 4000), ...(f.placeholder ? { placeholder: f.placeholder } : {}) })) } };
      }
      const r = await c.api.service<Submitted>('POST', `/bot/panels/forms/${id}/submit`, { guildId: c.guildId ?? null, discordId: c.discordId, userName: c.userDisplayName ?? c.userName ?? c.discordId, ...(c.userAvatar ? { avatar: c.userAvatar } : {}), values: c.fields ?? {} });
      const channelId = r.channelId ?? c.channelId;
      if (!channelId || !c.discord) return errorReply('Für dieses Panel ist kein Zielkanal eingestellt.');
      if (r.previous) await c.discord.deleteMessage(r.previous.channelId, r.previous.messageId);
      const spot = await c.discord.post(channelId, r.message, r.asUser ? { username: c.userDisplayName ?? c.userName ?? 'Mitglied', ...(c.userAvatar ? { avatarURL: c.userAvatar } : {}) } : undefined);
      await c.api.service('POST', `/bot/panels/submissions/${r.submissionId}/posted`, spot).catch(() => undefined);
      if (r.grantRoleIds.length && c.guildId) await c.discord.addRoles(c.guildId, c.discordId, r.grantRoleIds).catch(() => undefined);
      return { ephemeral: true, content: r.confirmText || '✅ Gepostet.' };
    } catch (e) { return mapError(e); }
  },
};
