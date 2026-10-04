import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator';

/** Direkte Zuordnung einer Discord-Rolle: Erlaubnisse, Sperren und Profile (alle Felder optional, gesendete ersetzen den Bestand). */
export class SetRolePermissionsDto {
  /** Rückwärtskompatibel: entspricht `allow`. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  permissions?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  allow?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  deny?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  profileIds?: string[];
}
