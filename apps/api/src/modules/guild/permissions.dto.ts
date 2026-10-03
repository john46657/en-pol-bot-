import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  permissions!: string[];
}
