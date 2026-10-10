import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersController } from './users.controller';
import { RolesController } from './roles.controller';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';

@Module({ imports: [AuthModule], controllers: [UsersController, RolesController], providers: [UsersService, RolesService], exports: [UsersService] })
export class UsersModule {}
