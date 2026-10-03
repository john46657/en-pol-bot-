import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { buildCustomId, type CustomIdAction } from '../discord/custom-ids.js';
import { registerButton, registerModal, registerSelect } from '../core/interaction-registry.js';
import { permissionService } from '../services/permission.service.js';
import { defineCommand } from './registry.js';

/**
 * `/diagnose`: Prüft live, ob Button-, Select- und Modal-Verarbeitung funktionieren
 * (Roundtrip für Administratoren). Nutzt die Handler-Registry wie jedes spätere Modul.
 */
const A = {
  button: 'diag:button' as CustomIdAction,
  select: 'diag:select' as CustomIdAction,
  modal: 'diag:modal' as CustomIdAction,
};

registerButton(A.button, async (i) => {
  await i.reply({ content: '✅ Button verarbeitet.', flags: MessageFlags.Ephemeral });
});
registerSelect(A.select, async (i) => {
  await i.reply({
    content: `✅ Auswahl verarbeitet: ${i.values.join(', ')}`,
    flags: MessageFlags.Ephemeral,
  });
});
registerModal(A.modal, async (i) => {
  await i.reply({
    content: `✅ Modal verarbeitet: „${i.fields.getTextInputValue('text')}“`,
    flags: MessageFlags.Ephemeral,
  });
});
// Button, der das Modal öffnet (Modals können nur als Antwort auf eine Interaction geöffnet werden)
registerButton('diag:open-modal' as CustomIdAction, async (i) => {
  const modal = new ModalBuilder()
    .setCustomId(buildCustomId(A.modal))
    .setTitle('Diagnose')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Beliebiger Text')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
  await i.showModal(modal);
});

export const diagnoseCommand = defineCommand({
  data: new SlashCommandBuilder()
    .setName('diagnose')
    .setDescription('Testet Button-, Select- und Modal-Verarbeitung des Bots')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
  execute: async (interaction) => {
    const member = interaction.guild
      ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
      : null;
    if (!member || !permissionService.isDiscordAdmin(member)) {
      await interaction.reply({
        content: '⚠️ Nur für Administratoren.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: '🔧 **Diagnose** – probiere alle drei Komponenten aus:',
      flags: MessageFlags.Ephemeral,
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildCustomId(A.button))
            .setLabel('Button testen')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(buildCustomId('diag:open-modal' as CustomIdAction))
            .setLabel('Modal testen')
            .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(buildCustomId(A.select))
            .setPlaceholder('Select testen')
            .addOptions({ label: 'Eins', value: 'eins' }, { label: 'Zwei', value: 'zwei' }),
        ),
      ],
    });
  },
});
