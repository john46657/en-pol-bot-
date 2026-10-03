import { Injectable } from '@nestjs/common';
import { PermissionService } from '../authz/permission.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { AppError } from '../common/errors';
import { DiscordService } from '../discord/discord.service';

export const CHANNELS = ['TEAM', 'DISPATCH', 'INCIDENT', 'SUPERVISOR', 'ANNOUNCEMENT'] as const;
export type Channel = (typeof CHANNELS)[number];
/** Welche Permission berechtigt zum Lesen eines Kanals. */
const READ: Record<Channel, string> = { TEAM: 'communication.view', ANNOUNCEMENT: 'communication.view', DISPATCH: 'dispatch.view', INCIDENT: 'incidents.view', SUPERVISOR: 'team.manage' };
const WRITE: Record<Channel, string> = { TEAM: 'communication.send', DISPATCH: 'communication.send', INCIDENT: 'communication.send', SUPERVISOR: 'communication.send', ANNOUNCEMENT: 'communication.moderate' };

@Injectable()
export class CommunicationService {
  constructor(private readonly prisma: PrismaService, private readonly perms: PermissionService, private readonly audit: AuditService, private readonly discord: DiscordService) {}

  /** Berechtigung wird serverseitig geprüft – auch für spätere WebSocket-Subscriptions (gleiche Methode). */
  async canRead(userId: string, channel: Channel) { return (await this.perms.has(userId, 'communication.view')) && (await this.perms.has(userId, READ[channel])); }

  private async conversation(channel: Channel, entityId?: string) {
    const found = await this.prisma.conversation.findFirst({ where: { channel, entityId: entityId ?? null } });
    return found ?? this.prisma.conversation.create({ data: { channel, entityId: entityId ?? null } });
  }

  async list(actor: Actor, channel: Channel, entityId?: string, q?: string) {
    if (!(await this.canRead(actor.userId!, channel))) throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    const c = await this.conversation(channel, entityId);
    return this.prisma.message.findMany({ where: { conversationId: c.id, deletedAt: null, ...(q ? { body: { contains: q, mode: 'insensitive' } } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async post(actor: Actor, channel: Channel, d: { body: string; entityId?: string; replyToId?: string }) {
    const uid = actor.userId!;
    if (!(await this.canRead(uid, channel)) || !(await this.perms.has(uid, WRITE[channel]))) throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    const c = await this.conversation(channel, d.entityId);
    if (d.replyToId && !(await this.prisma.message.findFirst({ where: { id: d.replyToId, conversationId: c.id } }))) throw new AppError('NOT_FOUND', 'Reply target not found.');
    const msg = await this.prisma.message.create({ data: { conversationId: c.id, authorId: uid, body: d.body, replyToId: d.replyToId } });
    if (channel === 'ANNOUNCEMENT') {
      const author = await this.prisma.user.findUnique({ where: { id: uid }, select: { displayName: true } });
      void this.discord.enqueue('announcements', 'announcement', { body: d.body.slice(0, 1500), author: author?.displayName ?? 'Command' });
    }
    return msg;
  }

  async moderate(actor: Actor, id: string, action: 'pin' | 'unpin' | 'delete') {
    const m = await this.prisma.message.findUnique({ where: { id }, include: { conversation: true } });
    if (!m || m.deletedAt) throw new AppError('NOT_FOUND', 'Message not found.');
    const mod = await this.perms.has(actor.userId!, 'communication.moderate');
    if (action === 'delete' ? !(mod || m.authorId === actor.userId) : !mod) throw new AppError('PERMISSION_DENIED', 'You do not have permission to perform this action.');
    if (!(await this.canRead(actor.userId!, m.conversation.channel as Channel))) throw new AppError('NOT_FOUND', 'Message not found.');
    const r = await this.prisma.message.update({ where: { id }, data: action === 'delete' ? { deletedAt: new Date() } : { pinned: action === 'pin' } });
    if (mod) await this.audit.record(actor, { action: `message.${action}`, module: 'communication', entityType: 'Message', entityId: id });
    return r;
  }
}
