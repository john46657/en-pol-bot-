import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { RolesController } from './roles.controller';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';
import { AccessMatrixController } from './access-matrix.controller';
import { AccessMatrixService } from './access-matrix.service';

@Module({ imports: [AuthModule], controllers: [UsersController, RolesController, AccessMatrixController], providers: [UsersService, RolesService, AccessMatrixService], exports: [UsersService, RolesService] })
export class UsersModule {}
