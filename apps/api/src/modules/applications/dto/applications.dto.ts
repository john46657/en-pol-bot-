import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApplicationStatus, SubmissionStatus } from '@nexus/types';

/** DTOs (§148: shared DTOs/schemas, mit class-validator synchron zu Zod). */

export class CreateApplicationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug erlaubt nur Kleinbuchstaben, Zahlen und Bindestriche.',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  icon?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  config?: Record<string, unknown>;
}

export class ListApplicationsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(Object.values(ApplicationStatus))
  status?: ApplicationStatus;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}

/** Annahme: optionale Nachricht an den Bewerber (`publicReason` bleibt als Alias erhalten). */
export class AcceptSubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalReason?: string;
}

/** Ablehnung: Grund aus der Konfiguration (`reasonId`) plus optionale Nachricht. */
export class DenySubmissionDto {
  @IsOptional()
  @IsString()
  @MaxLength(30)
  reasonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  publicReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalReason?: string;
}

export class ContactApplicantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1500)
  text!: string;
}

export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

/** Status-Wechsel einer Application (§98). */
export class SetApplicationStatusDto {
  @IsIn(Object.values(ApplicationStatus))
  status!: ApplicationStatus;
}

/** Submissions-Liste (§107: Cursor-Pagination). */
export class ListSubmissionsQueryDto {
  @IsOptional()
  @IsString()
  applicationId?: string;

  @IsOptional()
  @IsIn(Object.values(SubmissionStatus))
  status?: SubmissionStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
