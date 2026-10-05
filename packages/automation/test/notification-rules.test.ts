import { describe, expect, it } from 'vitest';
import { eventMessages, notificationRule } from '../src/notification-rules.js';

const vars = { userId: '900000000000800001', userMention: '<@900000000000800001>', applicationName: 'Moderation', reason: 'Zu wenig Erfahrung' };
const cfg = (event: string, rule: unknown) => ({ notifications: { [event]: rule } });

describe('Benachrichtigungen je Ereignis', () => {
  it('ohne Regel: Standard-DM, keine Kanalnachricht', () => {
    expect(eventMessages({}, 'accepted', vars)).toEqual({ dm: 'default' });
    expect(notificationRule(null, 'denied')).toBeUndefined();
  });
  it('DM aus, eigenes DM-Embed mit Platzhaltern und Link-Knöpfen', () => {
    expect(eventMessages(cfg('denied', { dm: false }), 'denied', vars).dm).toBe('off');
    const m = eventMessages(cfg('denied', { dmEmbed: { title: '❌ Bewerbung abgelehnt', description: 'Deine Bewerbung für {applicationName}: {reason}', color: '#123456', footer: 'Team' }, buttons: [{ label: 'Regeln', url: 'https://example.org/regeln' }, { label: 'Böse', url: 'javascript:alert(1)' }] }), 'denied', vars);
    expect(m.dm).toEqual({
      embeds: [{ title: '❌ Bewerbung abgelehnt', description: 'Deine Bewerbung für Moderation: Zu wenig Erfahrung', color: 0x123456, footer: { text: 'Team' } }],
      components: [{ type: 1, components: [{ type: 2, style: 5, label: 'Regeln', url: 'https://example.org/regeln' }] }], // nur https-Links
    });
  });
  it('leeres DM-Embed gilt als Standard-DM', () => {
    expect(eventMessages(cfg('accepted', { dm: true, dmEmbed: { title: ' ' } }), 'accepted', vars).dm).toBe('default');
  });
  it('Kanalnachricht: Erwähnungen nur wie eingestellt, Standard-Embed, Bilder nur per https', () => {
    const m = eventMessages(cfg('submitted', { channelId: '900000000000800002', mentionApplicant: true, mentionRoleIds: ['900000000000800003', 'kaputt'], channelEmbed: { title: 'Neu: {applicationName}', thumbnailUrl: 'https://cdn.example/x.png', imageUrl: 'http://unsicher/x.png' } }), 'submitted', vars);
    expect(m.channel).toEqual({
      channelId: '900000000000800002',
      payload: {
        content: '<@900000000000800001> <@&900000000000800003>',
        embeds: [{ title: 'Neu: Moderation', color: 0xfee75c, thumbnail: { url: 'https://cdn.example/x.png' } }],
        allowed_mentions: { parse: [], users: ['900000000000800001'], roles: ['900000000000800003'] },
      },
    });
    const plain = eventMessages(cfg('on_hold', { channelId: '900000000000800002' }), 'on_hold', vars).channel!;
    expect(plain.payload.embeds?.[0]).toMatchObject({ title: 'Bewerbung zurückgestellt', description: '<@900000000000800001> · **Moderation**' });
    expect(plain.payload.content).toBeUndefined();
    expect(eventMessages(cfg('on_hold', { channelId: 'kein-kanal' }), 'on_hold', vars).channel).toBeUndefined();
  });
});
