import type { MessageSpec, VoiceSupportRoom } from '@enrp/shared';
import { BotApiError, type Api } from './api';
import { clip, errorReply, okReply, type Reply } from './format';
import { mapError } from './commands/errors';
import type { Ctx, InteractionDef } from './commands/types';

/** Discord-Seite des Sprach-Supports (echte Umsetzung in index.ts, in Tests ein Fake). */
export interface VoiceOps {
  post(channelId: string, m: MessageSpec): Promise<string>;
  edit(channelId: string, messageId: string, m: MessageSpec): Promise<void>;
  dm(userId: string, m: MessageSpec): Promise<void>;
  /** Wer gerade in einem Sprachkanal ist (aus dem Cache). */
  members(channelId: string): string[];
  /** In welchem Sprachkanal jemand auf dem Server gerade ist. */
  voiceChannelOf(guildId: string, userId: string): string | null;
  /** Privater Sprachkanal neben dem Warteraum (Person + Team-Rolle). */
  createVoice(a: { guildId: string; name: string; nearChannelId: string; userId: string; teamRoleId: string }): Promise<string>;
  move(guildId: string, userId: string, channelId: string): Promise<boolean>;
  deleteChannel(channelId: string): Promise<void>;
  thread(channelId: string, messageId: string, name: string): Promise<string | null>;
  threadPost(threadId: string, text: string): Promise<void>;
}
type Edit = { channelId: string; messageId: string; message: MessageSpec } | null;
interface Finish { edit: Edit; deleteChannelId: string | null; userId: string; ratingDm: MessageSpec | null }
interface Claim { case: { id: string; number: string; userId: string; userName: string; guildId: string }; room: Pick<VoiceSupportRoom, 'name' | 'waitingChannelId' | 'teamRoleId' | 'channelPrefix' | 'notes' | 'ownChannels' | 'ownChannelIds'> | null; edit: Edit }
type Staff = { discordId: string; name: string; roleIds: string[]; admin: boolean };
export interface VoiceEvent { guildId: string; userId: string; userName: string; bot: boolean; from: string | null; to: string | null }

const ROOMS_MS = 60_000;
const note = (text: string): Reply => ({ content: text, ephemeral: true });
const fail = (e: unknown): Reply => (e instanceof BotApiError && [400, 403, 404, 409].includes(e.status) && e.message ? errorReply(clip(e.message, 500)) : mapError(e));

/**
 * Sprach-Support wie bei GalaxyBot: Warteraum betreten → Meldung „Ein neuer Support-Fall“ mit Übernehmen / Ablehnen / Nachricht.
 * Übernehmen stellt einen Sprachkanal bereit und verschiebt die Person; ist der Kanal leer, wird der Fall geschlossen.
 */
export function createVoiceSupport(api: Api, ops: VoiceOps, log: (m: string) => void = console.error) {
  const rooms = new Map<string, { at: number; list: VoiceSupportRoom[] }>();
  const roomsOf = async (guildId: string) => {
    const hit = rooms.get(guildId);
    if (hit && Date.now() - hit.at < ROOMS_MS) return hit.list;
    const list = await api.service<VoiceSupportRoom[]>('GET', `/bot/voice-support/rooms?guildId=${guildId}`).catch(() => hit?.list ?? []);
    rooms.set(guildId, { at: Date.now(), list });
    return list;
  };
  const safe = (label: string, p: Promise<unknown>) => p.catch((e) => log(`voice support: ${label} failed: ${e instanceof Error ? e.message : e}`));
  const applyEdit = (e: Edit) => (e ? safe('update message', ops.edit(e.channelId, e.messageId, e.message)) : Promise.resolve());
  async function finished(r: Finish) {
    await applyEdit(r.edit);
    if (r.deleteChannelId) await safe('delete channel', ops.deleteChannel(r.deleteChannelId));
    if (r.ratingDm) await safe('rating DM', ops.dm(r.userId, r.ratingDm));
  }

  async function onVoiceState(e: VoiceEvent) {
    if (e.bot || e.from === e.to) return;
    const list = await roomsOf(e.guildId);
    if (!list.length) return; // Server ohne Sprach-Support
    if (e.from) {
      if (list.some((r) => r.waitingChannelId === e.from)) {
        const r = await api.service<{ edits: Edit[] }>('POST', '/bot/voice-support/left', { guildId: e.guildId, channelId: e.from, discordId: e.userId, userName: e.userName });
        for (const x of r.edits) await applyEdit(x);
      } else if (!ops.members(e.from).length) {
        // Support-Kanal leer → Fall schließen (das System kennt die Kanäle seiner Fälle)
        const r = await api.service<{ closed: boolean } & Partial<Finish>>('POST', '/bot/voice-support/empty', { channelId: e.from });
        if (r.closed) await finished(r as Finish);
      }
    }
    if (e.to && list.some((r) => r.enabled && r.waitingChannelId === e.to)) {
      const r = await api.service<{ action: 'none' | 'closed' | 'notify'; caseId?: string; channelId?: string; message?: MessageSpec; dm?: MessageSpec }>('POST', '/bot/voice-support/join', { guildId: e.guildId, channelId: e.to, discordId: e.userId, userName: e.userName });
      if (r.action === 'closed' && r.dm) await safe('closed DM', ops.dm(e.userId, r.dm));
      if (r.action === 'notify' && r.caseId && r.channelId && r.message) {
        const messageId = await ops.post(r.channelId, r.message);
        await api.service('POST', `/bot/voice-support/cases/${r.caseId}/posted`, { messageId });
      }
    }
  }

  /** Nach dem Übernehmen: Kanal bereitstellen (eigener freier Kanal oder neu), Person + Bearbeiter verschieben, Notizen-Thread. */
  async function provision(r: Claim, staffId: string | null): Promise<string> {
    await applyEdit(r.edit);
    const { case: c, room } = r;
    if (!room) return 'Übernommen.';
    let channelId: string | null = null, created = false;
    try {
      if (room.ownChannels) channelId = room.ownChannelIds.find((x) => !ops.members(x).length) ?? null;
      else { channelId = await ops.createVoice({ guildId: c.guildId, name: clip(`${room.channelPrefix}${c.userName}`, 100), nearChannelId: room.waitingChannelId, userId: c.userId, teamRoleId: room.teamRoleId }); created = true; }
    } catch (e) { log(`voice support: channel failed: ${e instanceof Error ? e.message : e}`); }
    const moved = channelId ? await ops.move(c.guildId, c.userId, channelId).catch(() => false) : false;
    if (channelId && staffId && ops.voiceChannelOf(c.guildId, staffId)) await ops.move(c.guildId, staffId, channelId).catch(() => false);
    const threadId = room.notes && r.edit ? await ops.thread(r.edit.channelId, r.edit.messageId, `Notizen #${c.number}`).catch(() => null) : null;
    const done = await api.service<{ edit: Edit }>('POST', `/bot/voice-support/cases/${c.id}/channel`, { channelId, created, threadId });
    await applyEdit(done.edit);
    if (!channelId) throw new Error(room.ownChannels ? '⚠️ Übernommen – aber gerade ist keiner der eigenen Support-Kanäle frei. Sprich die Person im Warteraum an.' : '⚠️ Übernommen – der Sprachkanal konnte nicht angelegt werden (fehlt dem Bot „Kanäle verwalten“?).');
    return `Übernommen: <#${channelId}>${moved ? '' : ' – die Person ist nicht mehr im Sprachkanal und wurde nicht verschoben.'}`;
  }
  async function claim(id: string, s: Staff): Promise<Reply> {
    const r = await api.service<Claim>('POST', `/bot/voice-support/cases/${id}/claim`, s);
    return provision(r, s.discordId).then((t) => okReply(t), (e: Error) => note(e.message));
  }

  /** Aufträge aus dem Dashboard (Outbox `voice.effects`): Übernehmen bereitstellen, Meldung ändern, DM, Notiz, Kanal löschen. */
  async function applyEffects(p: { provision?: Claim; staffDiscordId?: string | null; edit?: Edit; dm?: { userId: string; message: MessageSpec }; threadPost?: { threadId: string; text: string }; deleteChannelId?: string | null }) {
    if (p.provision) await provision(p.provision, p.staffDiscordId ?? null).catch((e: Error) => log(`voice support: ${e.message}`));
    if (p.edit) await applyEdit(p.edit);
    if (p.dm) await safe('DM', ops.dm(p.dm.userId, p.dm.message));
    if (p.threadPost) await safe('thread log', ops.threadPost(p.threadPost.threadId, p.threadPost.text));
    if (p.deleteChannelId) await safe('delete channel', ops.deleteChannel(p.deleteChannelId));
  }

  async function interact(c: Ctx & { args: string[]; fields?: Record<string, string> }): Promise<Reply> {
    const [action, id = '', extra] = c.args;
    if (!/^[0-9a-f-]{36}$/.test(id)) return errorReply('Unbekannter Support-Fall.');
    const s: Staff = { discordId: c.discordId, name: c.userName ?? c.discordId, roleIds: c.memberRoleIds ?? [], admin: !!c.isGuildAdmin };
    try {
      switch (action) {
        case 'claim': return await claim(id, s);
        case 'decline': return { modal: { id: `vs:declinesubmit:${id}`, title: 'Support-Fall ablehnen', fields: [{ id: 'reason', label: 'Grund (optional, geht per DM an die Person)', paragraph: true, required: false, maxLength: 500 }] } };
        case 'declinesubmit': {
          const r = await api.service<{ edit: Edit; userId: string; dm: MessageSpec }>('POST', `/bot/voice-support/cases/${id}/decline`, { ...s, ...(c.fields?.reason?.trim() ? { reason: c.fields.reason.trim() } : {}) });
          await applyEdit(r.edit);
          const sent = await ops.dm(r.userId, r.dm).then(() => true, () => false);
          return okReply(`Abgelehnt.${sent ? ' Die Person wurde per DM informiert.' : ' (Die DM kam nicht an – Direktnachrichten sind bei der Person aus.)'}`);
        }
        case 'msg': return { modal: { id: `vs:msgsubmit:${id}`, title: 'Nachricht an die Person', fields: [{ id: 'text', label: 'Nachricht (per DM)', paragraph: true, required: true, maxLength: 2000 }] } };
        case 'msgsubmit': {
          const text = (c.fields?.text ?? '').trim();
          if (!text) return errorReply('Bitte eine Nachricht eingeben.');
          const r = await api.service<{ edit: Edit; userId: string; dm: MessageSpec; threadId: string | null; log: string }>('POST', `/bot/voice-support/cases/${id}/message`, { ...s, text });
          const sent = await ops.dm(r.userId, r.dm).then(() => true, () => false);
          if (!sent) return errorReply('Die Nachricht kam nicht an – die Person hat Direktnachrichten ausgeschaltet.');
          await applyEdit(r.edit);
          if (r.threadId) await safe('thread log', ops.threadPost(r.threadId, r.log));
          return note('💬 Nachricht gesendet.');
        }
        case 'close': {
          await finished(await api.service<Finish>('POST', `/bot/voice-support/cases/${id}/close`, s));
          return note('🔒 Support-Fall geschlossen.');
        }
        case 'rate': {
          const stars = Number(extra);
          if (!(stars >= 1 && stars <= 5)) return errorReply('Ungültige Bewertung.');
          const r = await api.service<{ edit: Edit }>('POST', `/bot/voice-support/cases/${id}/rating`, { discordId: c.discordId, stars });
          await applyEdit(r.edit);
          return { ...okReply('Danke für deine Bewertung! ⭐'), update: { embeds: [{ title: '⭐ Danke!', description: `Du hast ${'⭐'.repeat(stars)} vergeben.`, color: 0xfacc15 }] } };
        }
        default: return errorReply('Unbekannte Aktion.');
      }
    } catch (e) { return fail(e); }
  }

  return { onVoiceState, interact, applyEffects, clear: () => rooms.clear() };
}
export type VoiceSupportRuntime = ReturnType<typeof createVoiceSupport>;

/** Buttons/Formulare `vs:<aktion>:<fallId>` → Laufzeit aus dem Kontext. */
export const VOICE_INTERACTION: InteractionDef = {
  prefix: 'vs',
  opensModal: (a) => a[0] === 'decline' || a[0] === 'msg',
  async run(c) { return c.voiceSupport ? c.voiceSupport.interact(c) : errorReply('Der Sprach-Support ist hier nicht verfügbar.'); },
};
