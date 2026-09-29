import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DevUserMiddleware } from './common/middleware/dev-user.middleware.js';
import { AuthMiddleware } from './common/middleware/auth.middleware.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionGuard } from './common/guards/permission.guard.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AuthModule, ApplicationsModule],
  providers: [
    // Reihenfolge: erst AuthN (JwtAuthGuard), dann AuthZ (PermissionGuard).
    // @RequirePermissions wird so serverseitig erzwungen (§114) –
    // Frontend-Permissions sind nur UI.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // request.user setzen:
    //   1. DevUserMiddleware (dev-only, Header) – gewinnt vorrangig,
    //   2. AuthMiddleware (Session-JWT aus Bearer/Cookie).
    consumer.apply(DevUserMiddleware, AuthMiddleware).forRoutes('*');
  }
}
