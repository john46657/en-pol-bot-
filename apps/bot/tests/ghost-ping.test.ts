import { describe, expect, it } from 'vitest';
import type { Api } from '../src/api';
import { createGhostPing, ghostPingTargets, ghostPingText, type DeletedMessage } from '../src/ghost-ping';

const AUTHOR = '111111111111111111', VICTIM = '222222222222222222', OTHER = '333333333333333333', BOT = '444444444444444444', CH = '555555555555555555';
const msg = (p: Partial<DeletedMessage> = {}): DeletedMessage => ({ guildId: '666666666666666666', channelId: CH, authorId: AUTHOR, authorBot: false, content: `<@${VICTIM}>`, createdAt: new Date(), mentions: [{ id: VICTIM, bot: false }], ...p });

function setup(enabled: boolean | 'error' = true) {
  const posts: { channelId: string; content: string; mentionUserIds: string[] }[] = [];
  const api: Api = { async asUser() { throw new Error('unused'); }, async service() { if (enabled === 'error') throw new Error('down'); return { enabled } as never; } };
  return { g: createGhostPing(api, { async post(channelId, m) { posts.push({ channelId, ...m }); } }, () => undefined), posts };
}

describe('ghost ping', () => {
  it('writes the message like the old bot and pings only the mentioned person', async () => {
    const { g, posts } = setup();
    await g.deleted(msg());
    expect(posts).toEqual([{ channelId: CH, content: `<@${VICTIM}>,\nDa war jemand sehr böse ! <@${AUTHOR}> hat dich geghost-pinged mit dieser Nachricht !: "<@${VICTIM}>"`, mentionUserIds: [VICTIM] }]);
  });

  it('ignores bots, self-mentions, messages without mentions and old messages', () => {
    expect(ghostPingTargets(msg({ authorBot: true }))).toEqual([]);
    expect(ghostPingTargets(msg({ mentions: [{ id: AUTHOR, bot: false }, { id: BOT, bot: true }] }))).toEqual([]);
    expect(ghostPingTargets(msg({ mentions: [] }))).toEqual([]);
    expect(ghostPingTargets(msg({ createdAt: new Date(Date.now() - 20 * 60_000) }))).toEqual([]);
    expect(ghostPingTargets(msg({ mentions: [{ id: VICTIM, bot: false }, { id: OTHER, bot: false }, { id: VICTIM, bot: false }] }))).toEqual([VICTIM, OTHER]);
  });

  it('defuses @everyone and falls back to the mentions without message content', () => {
    expect(ghostPingText(msg({ content: '@everyone schau mal' }), [VICTIM])).toContain('"@​everyone schau mal"');
    expect(ghostPingText(msg({ content: '' }), [VICTIM, OTHER])).toBe(`<@${VICTIM}>, <@${OTHER}>,\nDa war jemand sehr böse ! <@${AUTHOR}> hat euch geghost-pinged mit dieser Nachricht !: "<@${VICTIM}> <@${OTHER}>"`);
  });

  it('can be switched off in the dashboard; without the API it stays on', async () => {
    const off = setup(false);
    await off.g.deleted(msg());
    expect(off.posts).toEqual([]);
    const down = setup('error');
    await down.g.deleted(msg());
    expect(down.posts).toHaveLength(1);
  });
});
