import { describe, expect, it } from 'vitest';
import { newVoiceRoom, isSupportOpen } from '@enrp/shared';
import { BotApiError, type Api } from '../src/api';
import { interactionFor } from '../src/commands/features';
import type { Ctx } from '../src/commands/types';
import { createVoiceSupport, type VoiceOps } from '../src/voice-support';

const G = '330000000000000001', WAIT = '430000000000000001', NOTIFY = '430000000000000002', TEAM = '530000000000000001', USER = '340000000000000001', SUP = '340000000000000002';
const CASE = '11111111-2222-3333-4444-555555555555';
const room = { ...newVoiceRoom('r1', G), waitingChannelId: WAIT, notifyChannelId: NOTIFY, teamRoleId: TEAM };
const edit = { channelId: NOTIFY, messageId: 'M1', message: { embeds: [{ title: 'x' }] } };

function setup(routes: Record<string, unknown>, voice: Record<string, string[]> = {}) {
  const calls: string[] = [], done: string[] = [];
  const api: Api = {
    async asUser() { throw new Error('unused'); },
    async service(method, path, body) {
      calls.push(`${method} ${path}${body ? ` ${JSON.stringify(body)}` : ''}`);
      const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
      if (!key) throw new BotApiError(404, 'NOT_FOUND', 'no route');
      const r = routes[key];
      if (r instanceof BotApiError) throw r;
      return r as never;
    },
  };
  const where: Record<string, string> = { [USER]: WAIT };
  const ops: VoiceOps = {
    async post(ch, m) { done.push(`post ${ch} ${m.buttons?.map((b) => b.label).join('/')}`); return 'M1'; },
    async edit(ch, id) { done.push(`edit ${ch} ${id}`); },
    async dm(u) { done.push(`dm ${u}`); },
    members: (ch) => voice[ch] ?? [],
    voiceChannelOf: (_g, u) => where[u] ?? null,
    async createVoice(a) { done.push(`create ${a.name} near ${a.nearChannelId} team ${a.teamRoleId}`); return 'V1'; },
    async move(_g, u, ch) { done.push(`move ${u} ${ch}`); return !!where[u]; },
    async deleteChannel(ch) { done.push(`delete ${ch}`); },
    async thread(_c, _m, name) { done.push(`thread ${name}`); return 'T1'; },
    async threadPost(t, text) { done.push(`log ${t} ${text}`); },
  };
  return { vs: createVoiceSupport(api, ops, () => undefined), calls, done };
}
const ev = (from: string | null, to: string | null) => ({ guildId: G, userId: USER, userName: 'john', bot: false, from, to });
const click = (vs: ReturnType<typeof setup>['vs'], customId: string, extra: Partial<Ctx> & { fields?: Record<string, string> } = {}) => {
  const hit = interactionFor(customId)!;
  return hit.def.run({ discordId: SUP, userName: 'sup', memberRoleIds: [TEAM], opts: {}, api: {} as Api, guildId: G, voiceSupport: vs, ...extra, args: hit.args });
};

describe('support times', () => {
  it('handles normal ranges, days and ranges over midnight (Europe/Berlin)', () => {
    const mon10 = new Date('2026-10-05T08:00:00Z'); // Montag 10:00 Berlin
    expect(isSupportOpen([], mon10)).toBe(true);
    expect(isSupportOpen([{ days: [1], from: '09:00', to: '18:00' }], mon10)).toBe(true);
    expect(isSupportOpen([{ days: [2], from: '09:00', to: '18:00' }], mon10)).toBe(false);
    expect(isSupportOpen([{ days: [0], from: '22:00', to: '11:00' }], mon10)).toBe(true); // So 22 → Mo 11
    expect(isSupportOpen([{ days: [1], from: '22:00', to: '02:00' }], mon10)).toBe(false);
  });
});

describe('voice support in the bot', () => {
  it('joining the waiting room posts the case; other channels and servers without rooms cost nothing', async () => {
    const { vs, done, calls } = setup({ 'GET /bot/voice-support/rooms': [room], 'POST /bot/voice-support/join': { action: 'notify', caseId: CASE, channelId: NOTIFY, message: { buttons: [{ id: 'a', label: 'Übernehmen' }, { id: 'b', label: 'Ablehnen' }, { id: 'c', label: 'Nachricht' }] } }, 'POST /bot/voice-support/cases': {} });
    await vs.onVoiceState(ev(null, WAIT));
    expect(done).toEqual([`post ${NOTIFY} Übernehmen/Ablehnen/Nachricht`]);
    expect(calls).toContain(`POST /bot/voice-support/cases/${CASE}/posted {"messageId":"M1"}`);
    await vs.onVoiceState(ev(null, '430000000000000099'));
    expect(calls.filter((c) => c.includes('/join'))).toHaveLength(1);
    const empty = setup({ 'GET /bot/voice-support/rooms': [] });
    await empty.vs.onVoiceState(ev(null, WAIT));
    expect(empty.calls).toEqual([`GET /bot/voice-support/rooms?guildId=${G}`]);
  });

  it('outside the support times the person gets a DM', async () => {
    const { vs, done } = setup({ 'GET /bot/voice-support/rooms': [room], 'POST /bot/voice-support/join': { action: 'closed', dm: { embeds: [] } } });
    await vs.onVoiceState(ev(null, WAIT));
    expect(done).toEqual([`dm ${USER}`]);
  });

  it('Übernehmen creates the voice channel, moves the person, opens the notes thread and reports back', async () => {
    const { vs, done, calls } = setup({
      'POST /bot/voice-support/cases/': { case: { id: CASE, number: 'S-ABC', userId: USER, userName: 'john', guildId: G }, room: { ...room }, edit },
    });
    const r = await click(vs, `vs:claim:${CASE}`);
    expect(r.content).toBe('✅ Übernommen: <#V1>');
    expect(done).toEqual([`edit ${NOTIFY} M1`, `create 🎧 john near ${WAIT} team ${TEAM}`, `move ${USER} V1`, 'thread Notizen #S-ABC', `edit ${NOTIFY} M1`]);
    expect(calls).toContain(`POST /bot/voice-support/cases/${CASE}/channel {"channelId":"V1","created":true,"threadId":"T1"}`);
    expect(calls.find((c) => c.includes('/claim'))).toContain(`"roleIds":["${TEAM}"]`);
  });

  it('with own channels only a free one is used', async () => {
    const { vs, done } = setup({ 'POST /bot/voice-support/cases/': { case: { id: CASE, number: 'S-ABC', userId: USER, userName: 'john', guildId: G }, room: { ...room, notes: false, ownChannels: true, ownChannelIds: ['O1', 'O2'] }, edit } }, { O1: ['someone'] });
    await click(vs, `vs:claim:${CASE}`);
    expect(done).toContain(`move ${USER} O2`);
    expect(done.some((d) => d.startsWith('create'))).toBe(false);
  });

  it('Ablehnen and Nachricht open a form and send a DM; errors from the system are shown', async () => {
    const { vs, done } = setup({ [`POST /bot/voice-support/cases/${CASE}/decline`]: { edit, userId: USER, dm: {} }, [`POST /bot/voice-support/cases/${CASE}/message`]: { edit, userId: USER, dm: {}, threadId: 'T1', log: 'hi' } });
    expect((await click(vs, `vs:decline:${CASE}`)).modal?.id).toBe(`vs:declinesubmit:${CASE}`);
    expect(interactionFor(`vs:msg:${CASE}`)!.def.opensModal?.(['msg'])).toBe(true);
    await click(vs, `vs:declinesubmit:${CASE}`, { fields: { reason: 'Bitte Ticket' } });
    await click(vs, `vs:msgsubmit:${CASE}`, { fields: { text: 'Gleich da' } });
    expect(done).toEqual([`edit ${NOTIFY} M1`, `dm ${USER}`, `dm ${USER}`, `edit ${NOTIFY} M1`, 'log T1 hi']);
    const denied = setup({ 'POST /bot/voice-support/cases/': new BotApiError(403, 'PERMISSION_DENIED', 'Nur das Support-Team (Team-Rolle des Raums) kann das.') });
    expect((await click(denied.vs, `vs:claim:${CASE}`)).content).toContain('Support-Team');
  });

  it('an empty support channel closes the case: delete channel, rating DM', async () => {
    const { vs, done } = setup({ 'GET /bot/voice-support/rooms': [room], 'POST /bot/voice-support/empty': { closed: true, edit, deleteChannelId: 'V1', userId: USER, ratingDm: { embeds: [] } } });
    await vs.onVoiceState(ev('V1', null));
    expect(done).toEqual([`edit ${NOTIFY} M1`, 'delete V1', `dm ${USER}`]);
  });
});

describe('actions from the dashboard (outbox voice.effects)', () => {
  it('claim from the dashboard provisions the channel; decline/message/close effects are executed', async () => {
    const { vs, done, calls } = setup({ 'POST /bot/voice-support/cases/': { edit } });
    await vs.applyEffects({ provision: { case: { id: CASE, number: 'S-ABC', userId: USER, userName: 'john', guildId: G }, room: { ...room, notes: false }, edit }, staffDiscordId: null });
    expect(done).toEqual([`edit ${NOTIFY} M1`, `create 🎧 john near ${WAIT} team ${TEAM}`, `move ${USER} V1`, `edit ${NOTIFY} M1`]);
    expect(calls).toContain(`POST /bot/voice-support/cases/${CASE}/channel {"channelId":"V1","created":true,"threadId":null}`);
    done.length = 0;
    await vs.applyEffects({ edit, dm: { userId: USER, message: { embeds: [] } }, threadPost: { threadId: 'T1', text: 'hi' }, deleteChannelId: 'V1' });
    expect(done).toEqual([`edit ${NOTIFY} M1`, `dm ${USER}`, 'log T1 hi', 'delete V1']);
  });
});
