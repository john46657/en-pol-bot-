import {
  createChannelMessage,
  editChannelMessage,
  sendDirectMessage,
  type MessagePayload,
} from '@nexus/discord';
import { restRoleDriver, type RoleDriver } from './role-changes.js';

/** Schmale Schnittstelle zu Discord: im Betrieb REST (Bot-Token), in Tests eine Attrappe. */
export interface DiscordPort {
  sendDm(userId: string, payload: MessagePayload): Promise<void>;
  postMessage(channelId: string, payload: MessagePayload): Promise<{ id: string }>;
  editMessage(channelId: string, messageId: string, payload: MessagePayload): Promise<void>;
  roleDriver(guildId: string): RoleDriver;
}

export function restDiscordPort(botToken: string): DiscordPort {
  return {
    sendDm: (userId, payload) => sendDirectMessage(botToken, userId, payload),
    postMessage: (channelId, payload) => createChannelMessage(botToken, channelId, payload),
    editMessage: (channelId, messageId, payload) =>
      editChannelMessage(botToken, channelId, messageId, payload),
    roleDriver: (guildId) => restRoleDriver(botToken, guildId),
  };
}
