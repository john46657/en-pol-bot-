import { ChannelType, OverwriteType, PermissionsBitField, type Guild, type GuildChannel, type Role } from 'discord.js';
import type { BackupChannel, BackupPart, BackupRestoreResult, DiscordBackupData } from '@enrp/shared';

const TYPE: Partial<Record<ChannelType, BackupChannel['type']>> = {
  [ChannelType.GuildText]: 'text', [ChannelType.GuildVoice]: 'voice', [ChannelType.GuildCategory]: 'category',
  [ChannelType.GuildAnnouncement]: 'announcement', [ChannelType.GuildStageVoice]: 'stage', [ChannelType.GuildForum]: 'forum',
};
const BACK: Record<BackupChannel['type'], ChannelType> = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory, announcement: ChannelType.GuildAnnouncement, stage: ChannelType.GuildStageVoice, forum: ChannelType.GuildForum };

/** Server auslesen: Rollen (ohne Bot-/Integrationsrollen), Kategorien und Kanäle mit Rechten, Servereinstellungen. */
export async function captureGuild(guild: Guild): Promise<DiscordBackupData> {
  await guild.roles.fetch();
  await guild.channels.fetch();
  const roles = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id && !r.managed)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position }))
    .sort((a, b) => a.position - b.position);
  const channels: BackupChannel[] = [];
  for (const c of guild.channels.cache.values()) {
    const type = TYPE[c.type];
    if (!type || c.isThread()) continue;
    const g = c as GuildChannel & { topic?: string | null; nsfw?: boolean; rateLimitPerUser?: number; bitrate?: number; userLimit?: number };
    channels.push({
      id: g.id, name: g.name, type, parentId: g.parentId ?? null, position: g.rawPosition,
      ...(g.topic !== undefined ? { topic: g.topic } : {}), ...(g.nsfw !== undefined ? { nsfw: g.nsfw } : {}), ...(g.rateLimitPerUser !== undefined ? { rateLimitPerUser: g.rateLimitPerUser } : {}),
      ...(g.bitrate !== undefined ? { bitrate: g.bitrate } : {}), ...(g.userLimit !== undefined ? { userLimit: g.userLimit } : {}),
      overwrites: [...g.permissionOverwrites.cache.values()].map((o) => ({ id: o.id, type: o.type === OverwriteType.Role ? 'role' : 'member', allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
    });
  }
  channels.sort((a, b) => Number(b.type === 'category') - Number(a.type === 'category') || a.position - b.position);
  return {
    version: 1, guildId: guild.id, everyonePermissions: guild.roles.everyone.permissions.bitfield.toString(), roles, channels,
    settings: { name: guild.name, verificationLevel: guild.verificationLevel, defaultMessageNotifications: guild.defaultMessageNotifications, explicitContentFilter: guild.explicitContentFilter, afkChannelId: guild.afkChannelId, afkTimeout: guild.afkTimeout, systemChannelId: guild.systemChannelId },
  };
}

/**
 * Wiederherstellen – sicher: Vorhandenes (gleicher Name, bei Kanälen gleicher Typ und gleiche Kategorie) wird angepasst,
 * Fehlendes neu angelegt, nichts gelöscht. Rollen-IDs aus dem Backup werden auf die Rollen des Ziel-Servers umgeschrieben.
 */
export async function restoreGuild(guild: Guild, data: DiscordBackupData, parts: BackupPart[]): Promise<BackupRestoreResult> {
  const r: BackupRestoreResult = { created: 0, updated: 0, failed: 0, errors: [], parts, at: new Date().toISOString() };
  const fail = (what: string, e: unknown) => { r.failed++; if (r.errors.length < 30) r.errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`); };
  await guild.roles.fetch();
  await guild.channels.fetch();
  const me = guild.members.me ?? await guild.members.fetchMe();
  const roleMap = new Map<string, string>([[data.guildId, guild.id]]); // @everyone
  for (const role of data.roles) { const hit = guild.roles.cache.find((x) => x.name === role.name && !x.managed); if (hit) roleMap.set(role.id, hit.id); }

  if (parts.includes('roles')) {
    try { await guild.roles.everyone.setPermissions(BigInt(data.everyonePermissions), 'Backup wiederhergestellt'); r.updated++; } catch (e) { fail('@everyone', e); }
    for (const role of data.roles) {
      const existing = roleMap.get(role.id) ? guild.roles.cache.get(roleMap.get(role.id)!) : undefined;
      const opts = { name: role.name, color: role.color, hoist: role.hoist, mentionable: role.mentionable, permissions: BigInt(role.permissions) & me.permissions.bitfield, reason: 'Backup wiederhergestellt' };
      try {
        if (existing) {
          if (existing.position >= me.roles.highest.position) { fail(`Rolle ${role.name}`, 'steht über der Bot-Rolle'); continue; }
          await existing.edit(opts); r.updated++;
        } else { const created: Role = await guild.roles.create(opts); roleMap.set(role.id, created.id); r.created++; }
      } catch (e) { fail(`Rolle ${role.name}`, e); }
    }
    // Reihenfolge wie im Backup (nur unterhalb der Bot-Rolle)
    const positions = data.roles.map((x) => ({ role: roleMap.get(x.id), position: x.position })).filter((x): x is { role: string; position: number } => !!x.role && (guild.roles.cache.get(x.role)?.position ?? 1e9) < me.roles.highest.position);
    await guild.roles.setPositions(positions.map((x) => ({ role: x.role, position: Math.min(x.position, me.roles.highest.position - 1) }))).catch((e) => fail('Rollen-Reihenfolge', e));
  }

  const chanMap = new Map<string, string>();
  if (parts.includes('channels')) {
    const overwrites = (c: BackupChannel) => c.overwrites.map((o) => ({ id: o.type === 'role' ? roleMap.get(o.id) ?? null : o.id, type: o.type === 'role' ? OverwriteType.Role : OverwriteType.Member, allow: new PermissionsBitField(BigInt(o.allow)), deny: new PermissionsBitField(BigInt(o.deny)) }))
      .filter((o): o is { id: string; type: OverwriteType; allow: PermissionsBitField; deny: PermissionsBitField } => !!o.id && (o.type === OverwriteType.Role ? guild.roles.cache.has(o.id) : true));
    for (const c of data.channels) {
      const parent = c.parentId ? chanMap.get(c.parentId) ?? null : null;
      const existing = guild.channels.cache.find((x) => !x.isThread() && x.name === c.name && x.type === BACK[c.type] && ('parentId' in x ? (x.parentId ?? null) === parent : true));
      const opts = {
        name: c.name, type: BACK[c.type], parent, permissionOverwrites: overwrites(c), reason: 'Backup wiederhergestellt',
        ...(c.topic != null && c.type !== 'voice' && c.type !== 'category' ? { topic: c.topic } : {}), ...(c.nsfw !== undefined && c.type !== 'category' ? { nsfw: c.nsfw } : {}),
        ...(c.rateLimitPerUser ? { rateLimitPerUser: c.rateLimitPerUser } : {}), ...(c.bitrate && (c.type === 'voice' || c.type === 'stage') ? { bitrate: Math.min(c.bitrate, guild.maximumBitrate) } : {}), ...(c.userLimit !== undefined && c.type === 'voice' ? { userLimit: c.userLimit } : {}),
      };
      try {
        if (existing) {
          const edit: Record<string, unknown> = { ...opts };
          delete edit.type; // Typ lässt sich nicht ändern
          await (existing as GuildChannel).edit(edit as never); chanMap.set(c.id, existing.id); r.updated++;
        } else {
          const created = await guild.channels.create(opts as never); chanMap.set(c.id, (created as GuildChannel).id); r.created++;
        }
      } catch (e) { fail(`Kanal #${c.name}`, e); }
    }
  }

  if (parts.includes('settings')) {
    const s = data.settings;
    const map = (id: string | null) => (id ? chanMap.get(id) ?? (guild.channels.cache.has(id) ? id : null) : null);
    try {
      await guild.edit({ name: s.name, verificationLevel: s.verificationLevel, defaultMessageNotifications: s.defaultMessageNotifications, explicitContentFilter: s.explicitContentFilter, afkTimeout: s.afkTimeout, afkChannel: map(s.afkChannelId), systemChannel: map(s.systemChannelId), reason: 'Backup wiederhergestellt' });
      r.updated++;
    } catch (e) { fail('Servereinstellungen', e); }
  }
  return r;
}
