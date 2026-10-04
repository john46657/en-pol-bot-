import type {
  ButtonInteraction,
  Client,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';
import { parseCustomId } from '../discord/custom-ids.js';

/**
 * Registry für Button-, Select- und Modal-Handler.
 * Handler werden unter der Aktion der Custom-ID (`nexus:<aktion>:<args…>`) registriert.
 * Module registrieren sich hier, ohne den zentralen Router anzufassen.
 */
export interface HandlerContext {
  client: Client;
  args: string[];
}
type Handler<I> = (interaction: I, ctx: HandlerContext) => Promise<void>;

const buttons = new Map<string, Handler<ButtonInteraction>>();
const selects = new Map<string, Handler<StringSelectMenuInteraction>>();
const modals = new Map<string, Handler<ModalSubmitInteraction>>();

function register<I>(map: Map<string, Handler<I>>, action: string, handler: Handler<I>): void {
  if (map.has(action)) throw new Error(`Handler für "${action}" ist bereits registriert.`);
  map.set(action, handler);
}

export const registerButton = (action: string, h: Handler<ButtonInteraction>): void =>
  register(buttons, action, h);
export const registerSelect = (action: string, h: Handler<StringSelectMenuInteraction>): void =>
  register(selects, action, h);
export const registerModal = (action: string, h: Handler<ModalSubmitInteraction>): void =>
  register(modals, action, h);

/** @returns true, wenn ein registrierter Handler die Interaction verarbeitet hat. */
export async function dispatchComponent(
  client: Client,
  interaction: MessageComponentInteraction,
): Promise<boolean> {
  const parsed = parseCustomId(interaction.customId, [...buttons.keys(), ...selects.keys()]);
  if (!parsed) return false;
  const ctx = { client, args: parsed.args };
  if (interaction.isButton()) {
    const h = buttons.get(parsed.action);
    if (h) return (await h(interaction, ctx), true);
  } else if (interaction.isStringSelectMenu()) {
    const h = selects.get(parsed.action);
    if (h) return (await h(interaction, ctx), true);
  }
  return false;
}

export async function dispatchModal(
  client: Client,
  interaction: ModalSubmitInteraction,
): Promise<boolean> {
  const parsed = parseCustomId(interaction.customId, modals.keys());
  const h = parsed ? modals.get(parsed.action) : undefined;
  if (!parsed || !h) return false;
  await h(interaction, { client, args: parsed.args });
  return true;
}

/** Nur für Tests. */
export function clearRegistry(): void {
  buttons.clear();
  selects.clear();
  modals.clear();
}
