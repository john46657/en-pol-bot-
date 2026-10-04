import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Panel-Layouts (§41): Button-Row, Select-Menu oder beides. */
export const PANEL_LAYOUTS = ['button', 'select', 'button_and_select'];
export type PanelLayout = (typeof PANEL_LAYOUTS)[number];

/**
 * Panel-DTOs (§40/§41/§42): Ein Panel ist eine Discord-Nachricht, die eine
 * oder mehrere Applications verlinkt. Die API verwaltet nur die Konfiguration –
 * gerendert und gepostet wird die Nachricht vom Bot (messageId wird danach
 * vom Bot gesetzt), daher gibt es hier keine Message-IDs.
 *
 * §148: DTOs synchron zum shared Validation-Package.
 */
export class CreatePanelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  channelId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  embed?: Record<string, unknown>;

  @IsOptional()
  @IsIn(PANEL_LAYOUTS)
  layout?: PanelLayout;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  buttonLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  buttonEmoji?: string;

  /** Applications, die im Panel verlinkt werden (Reihenfolge = Array-Reihenfolge). */
  @IsOptional()
  @IsString({ each: true })
  applicationIds?: string[];
}

export class UpdatePanelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  channelId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  embed?: Record<string, unknown>;

  @IsOptional()
  @IsIn(PANEL_LAYOUTS)
  layout?: PanelLayout;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  buttonLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  buttonEmoji?: string;

  /** Setzen ersetzt alle bisher verlinkten Applications vollständig. */
  @IsOptional()
  @IsString({ each: true })
  applicationIds?: string[];
}
