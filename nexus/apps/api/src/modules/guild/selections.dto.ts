import { IsOptional, IsString, Matches } from 'class-validator';

export class SetSelectionDto {
  /** Discord-ID oder `null` zum Zurücksetzen. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{5,25}$/, { message: 'Ungültige Discord-ID.' })
  value?: string | null;
}
