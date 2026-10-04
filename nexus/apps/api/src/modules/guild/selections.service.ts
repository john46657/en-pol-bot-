import { BadRequestException, Injectable } from '@nestjs/common';
import { auditRepository, guildRepository } from '@nexus/database';
import { DiscordService } from './discord.service.js';
import { SELECTION_SLOTS, getSlot, type SelectionSlot } from './selection-slots.js';

export interface SelectionView extends SelectionSlot {
  value: string | null;
}

/** Speichert Rollen-/Kanal-Auswahlen. Jede Auswahl wird serverseitig gegen Discord validiert. */
@Injectable()
export class SelectionsService {
  constructor(private readonly discord: DiscordService) {}

  async list(guildId: string): Promise<SelectionView[]> {
    const values = await guildRepository.getSelections(guildId);
    return SELECTION_SLOTS.map((s) => ({ ...s, value: values[s.key] ?? null }));
  }

  async set(guildId: string, actorId: string, slotKey: string, value: string | null) {
    const slot = getSlot(slotKey);
    if (!slot) throw new BadRequestException(`Unbekanntes Feld: ${slotKey}`);
    if (value !== null) await this.validate(guildId, slot, value);

    const { before, after } = await guildRepository.setSelection(guildId, slot.key, value);
    await auditRepository.create({
      guildId,
      actorType: 'USER',
      actorId,
      action: 'settings.selection.set',
      resourceType: 'GuildSettings',
      resourceId: slot.key,
      before: { value: before },
      after: { value: after },
    });
    return { slot: slot.key, value: after };
  }

  private async validate(guildId: string, slot: SelectionSlot, id: string): Promise<void> {
    if (slot.kind === 'role') {
      const role = (await this.discord.listRoles(guildId)).find((r) => r.id === id);
      if (!role) throw new BadRequestException('Diese Rolle existiert auf dem Server nicht.');
      if (slot.requiresManageable && !role.manageable) {
        throw new BadRequestException(
          'Der Bot kann diese Rolle nicht vergeben (Rollen-Hierarchie oder fehlendes Recht „Rollen verwalten“).',
        );
      }
      return;
    }
    const channel = (await this.discord.listChannels(guildId, slot.kind)).find((c) => c.id === id);
    if (!channel) {
      throw new BadRequestException(
        'Dieser Kanal existiert nicht oder hat den falschen Typ für dieses Feld.',
      );
    }
  }
}
