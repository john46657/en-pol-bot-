import type { Api } from '../api';
import type { Reply } from '../format';

export type Opts = Record<string, string | number | undefined>;
export interface Ctx { discordId: string; opts: Opts; api: Api }
export interface OptionDef { name: string; description: string; type: 'string' | 'integer' | 'number'; required?: boolean; choices?: { name: string; value: string }[]; maxLength?: number; min?: number; max?: number }
export interface CommandDef { name: string; description: string; options?: OptionDef[]; run(ctx: Ctx): Promise<Reply> }
