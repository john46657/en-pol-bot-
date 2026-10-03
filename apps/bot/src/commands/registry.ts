import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

/** Slash-Command-Grundstruktur: Definition + Handler an einer Stelle; neue Module rufen nur `defineCommand` auf. */
export interface CommandModule {
  data: RESTPostAPIChatInputApplicationCommandsJSONBody;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

const commands = new Map<string, CommandModule>();

export function defineCommand(module: CommandModule): CommandModule {
  if (commands.has(module.data.name))
    throw new Error(`Command "${module.data.name}" existiert bereits.`);
  commands.set(module.data.name, module);
  return module;
}

export const getCommand = (name: string): CommandModule | undefined => commands.get(name);
export const listCommandData = (): RESTPostAPIChatInputApplicationCommandsJSONBody[] =>
  [...commands.values()].map((c) => c.data);
