import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { auditRepository, panelRepository, type Prisma } from '@nexus/database';
import {
  DiscordApiError,
  createChannelMessage,
  deleteChannelMessage,
  editChannelMessage,
  renderPanelMessage,
} from '@nexus/discord';
import type { PanelConfig } from '@nexus/types';
import { panelConfigSchema, panelNameSchema } from '@nexus/validation';
import { DiscordService } from '../guild/discord.service.js';

type Panel = NonNullable<Awaited<ReturnType<typeof panelRepository.get>>>;

/**
 * Universelle Panels: speichern, in einen Kanal senden und die Nachricht bei Änderungen aktualisieren.
 * Alles guild-scoped; Konfiguration und Rollen/Kanäle werden serverseitig gegen Discord geprüft.
 */
@Injectable()
export class PanelsService {
  constructor(
    private readonly discord: DiscordService,
    private readonly config: ConfigService,
  ) {}

  private get botToken(): string {
    return this.config.get<string>('DISCORD_TOKEN') ?? '';
  }

  list(guildId: string) {
    return panelRepository.list(guildId);
  }

  async get(guildId: string, id: string): Promise<Panel> {
    const panel = await panelRepository.get(guildId, id);
    if (!panel) throw new NotFoundException('Panel nicht gefunden.');
    return panel;
  }

  async create(
    guildId: string,
    actorId: string,
    input: { name?: unknown; config?: unknown; autoUpdate?: boolean },
  ) {
    const name = this.parseName(input.name);
    const config = await this.parseConfig(guildId, input.config);
    const panel = await panelRepository.create(guildId, {
      name,
      config: config as unknown as Prisma.InputJsonValue,
      createdBy: actorId,
      ...(input.autoUpdate !== undefined ? { autoUpdate: input.autoUpdate } : {}),
    });
    await this.audit(guildId, actorId, 'panel.create', panel.id, undefined, { name });
    return panel;
  }

  async update(
    guildId: string,
    actorId: string,
    id: string,
    input: { name?: unknown; config?: unknown; autoUpdate?: boolean },
  ) {
    const before = await this.get(guildId, id);
    const data: Parameters<typeof panelRepository.update>[2] = {};
    if (input.name !== undefined) data.name = this.parseName(input.name);
    if (input.config !== undefined) {
      data.config = (await this.parseConfig(
        guildId,
        input.config,
      )) as unknown as Prisma.InputJsonValue;
    }
    if (input.autoUpdate !== undefined) data.autoUpdate = input.autoUpdate;
    const panel = await panelRepository.update(guildId, id, data);
    if (!panel) throw new NotFoundException('Panel nicht gefunden.');
    await this.audit(
      guildId,
      actorId,
      'panel.update',
      id,
      { name: before.name, config: before.config },
      { name: panel.name, config: panel.config },
    );

    // Automatische Aktualisierung der bereits gesendeten Nachricht
    let synced: 'updated' | 'resent' | 'skipped' | 'failed' = 'skipped';
    if (panel.autoUpdate && panel.channelId && panel.messageId && input.config !== undefined) {
      try {
        synced =
          (await this.pushMessage(panel, panel.channelId)).mode === 'edited' ? 'updated' : 'resent';
      } catch {
        synced = 'failed';
      }
    }
    return { panel: await this.get(guildId, id), synced };
  }

  /** Sendet das Panel in den Kanal (neue Nachricht) oder aktualisiert die vorhandene, falls Kanal gleich ist. */
  async send(guildId: string, actorId: string, id: string, channelId: unknown) {
    const panel = await this.get(guildId, id);
    const target = typeof channelId === 'string' && channelId ? channelId : panel.channelId;
    if (!target || !/^\d{5,25}$/.test(target))
      throw new BadRequestException('Bitte einen Kanal auswählen.');
    const channel = (await this.discord.listChannels(guildId, 'text')).find((c) => c.id === target);
    if (!channel)
      throw new BadRequestException('Dieser Kanal existiert nicht oder ist kein Textkanal.');

    let result: { messageId: string; mode: 'edited' | 'sent' };
    try {
      result = await this.pushMessage(panel, target);
    } catch (e) {
      if (e instanceof DiscordApiError && (e.status === 403 || e.status === 50013)) {
        throw new BadRequestException(
          'Der Bot darf in diesem Kanal nicht schreiben (Kanal ansehen, Nachrichten senden, Links einbetten).',
        );
      }
      throw e;
    }
    await this.audit(guildId, actorId, 'panel.send', id, undefined, {
      channelId: target,
      messageId: result.messageId,
      mode: result.mode,
    });
    return { channelId: target, messageId: result.messageId, mode: result.mode };
  }

  async remove(guildId: string, actorId: string, id: string, deleteMessage: boolean) {
    const panel = await this.get(guildId, id);
    if (deleteMessage && panel.channelId && panel.messageId) {
      await deleteChannelMessage(this.botToken, panel.channelId, panel.messageId).catch(
        () => undefined,
      );
    }
    await panelRepository.delete(guildId, id);
    await this.audit(guildId, actorId, 'panel.delete', id, { name: panel.name }, undefined);
    return { ok: true };
  }

  // --- intern -----------------------------------------------------------------

  /** Bearbeitet die vorhandene Nachricht (gleicher Kanal) oder sendet eine neue; verschwundene Nachrichten werden neu gesendet. */
  private async pushMessage(
    panel: Panel,
    channelId: string,
  ): Promise<{ messageId: string; mode: 'edited' | 'sent' }> {
    const payload = renderPanelMessage(panel.id, panel.config as unknown as PanelConfig);
    if (panel.messageId && panel.channelId === channelId) {
      try {
        await editChannelMessage(this.botToken, channelId, panel.messageId, payload);
        await panelRepository.markSent(panel.guildId, panel.id, channelId, panel.messageId);
        return { messageId: panel.messageId, mode: 'edited' };
      } catch (e) {
        if (!(e instanceof DiscordApiError && e.status === 404)) throw e;
      }
    } else if (panel.messageId && panel.channelId) {
      // Kanalwechsel: alte Nachricht entfernen, damit keine toten Buttons zurückbleiben.
      await deleteChannelMessage(this.botToken, panel.channelId, panel.messageId).catch(
        () => undefined,
      );
    }
    const created = await createChannelMessage(this.botToken, channelId, payload);
    await panelRepository.markSent(panel.guildId, panel.id, channelId, created.id);
    return { messageId: created.id, mode: 'sent' };
  }

  private parseName(value: unknown): string {
    const r = panelNameSchema.safeParse(value);
    if (!r.success)
      throw new BadRequestException('Der Name fehlt oder ist zu lang (max. 80 Zeichen).');
    return r.data;
  }

  /** Validiert die Konfiguration und prüft Rollen-Aktionen gegen Discord (existiert, verwaltbar, nicht gefährlich). */
  private async parseConfig(guildId: string, value: unknown): Promise<PanelConfig> {
    const r = panelConfigSchema.safeParse(value);
    if (!r.success) {
      const msg = r.error.issues
        .map((i) => `${i.path.join('.') || 'config'}: ${i.message}`)
        .slice(0, 5);
      throw new BadRequestException(msg);
    }
    const config = r.data;
    const roleIds = new Set<string>();
    for (const a of [
      ...config.buttons.map((b) => b.action),
      ...(config.select?.options.map((o) => o.action) ?? []),
    ]) {
      if (a?.type === 'role-toggle') roleIds.add(a.roleId);
    }
    if (roleIds.size > 0) {
      const roles = await this.discord.listRoles(guildId);
      for (const id of roleIds) {
        const role = roles.find((x) => x.id === id);
        if (!role)
          throw new BadRequestException(
            'Eine Rollen-Aktion verweist auf eine Rolle, die es nicht gibt.',
          );
        if (!role.manageable) {
          throw new BadRequestException(
            `Der Bot kann die Rolle „${role.name}“ nicht vergeben (Rollen-Hierarchie oder fehlendes Recht).`,
          );
        }
        if (role.dangerous) {
          throw new BadRequestException(
            `Die Rolle „${role.name}“ hat Verwaltungsrechte und darf nicht per Panel vergeben werden.`,
          );
        }
      }
    }
    return config;
  }

  private audit(
    guildId: string,
    actorId: string,
    action: string,
    id: string,
    before?: unknown,
    after?: unknown,
  ) {
    return auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action,
      resourceType: 'Panel',
      resourceId: id,
      ...(before !== undefined ? { before: before as Prisma.InputJsonValue } : {}),
      ...(after !== undefined ? { after: after as Prisma.InputJsonValue } : {}),
    });
  }
}
