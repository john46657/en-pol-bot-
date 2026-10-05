import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ApplicationsModule } from './modules/applications/applications.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GuildModule } from './modules/guild/guild.module.js';
import { PersonnelModule } from './modules/personnel/personnel.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { LiveModule } from './modules/live/live.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { OfficeModule } from './modules/office/office.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { DesignModule } from './modules/design/design.module.js';
import { AbsencesModule } from './modules/absences/absences.module.js';
import { TicketsModule } from './modules/tickets/tickets.module.js';
import { SekModule } from './modules/sek/sek.module.js';
import { PromotionsModule } from './modules/promotions/promotions.module.js';
import { QualificationsModule } from './modules/qualifications/qualifications.module.js';
import { TrainingModule } from './modules/training/training.module.js';
import { FleetModule } from './modules/fleet/fleet.module.js';
import { RestrictionsModule } from './modules/restrictions/restrictions.module.js';
import { ModerationModule } from './modules/moderation/moderation.module.js';
import { BackupModule } from './modules/backup/backup.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { WantedModule } from './modules/wanted/wanted.module.js';
import { DangerModule } from './modules/danger/danger.module.js';
import { OperationsModule } from './modules/operations/operations.module.js';
import { RadioModule } from './modules/radio/radio.module.js';
import { ShiftsModule } from './modules/shifts/shifts.module.js';
import { MessagePanelsModule } from './modules/panels/panels.module.js';
import { CsrfMiddleware, RateLimitMiddleware, SecurityHeadersMiddleware } from './common/security/security.middleware.js';
import { DevUserMiddleware } from './common/middleware/dev-user.middleware.js';
import { AuthMiddleware } from './common/middleware/auth.middleware.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionGuard } from './common/guards/permission.guard.js';
import { ModuleGuard } from './common/guards/module.guard.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    GuildModule,
    ApplicationsModule,
    MessagePanelsModule,
    PersonnelModule,
    ShiftsModule,
    RadioModule,
    OperationsModule,
    DangerModule,
    WantedModule,
    RestrictionsModule,
    ModerationModule,
    BackupModule,
    MessagesModule,
    FleetModule,
    TrainingModule,
    QualificationsModule,
    PromotionsModule,
    SekModule,
    TicketsModule,
    AbsencesModule,
    DesignModule,
    ReportsModule,
    OfficeModule,
    AuditModule,
    LiveModule,
    AutomationModule,
    HealthModule,
  ],
  providers: [
    // Reihenfolge: erst AuthN (JwtAuthGuard), dann AuthZ (PermissionGuard).
    // @RequirePermissions wird so serverseitig erzwungen (§114) –
    // Frontend-Permissions sind nur UI.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_GUARD, useClass: ModuleGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // request.user setzen:
    //   1. DevUserMiddleware (dev-only, Header) – gewinnt vorrangig,
    //   2. AuthMiddleware (Session-JWT aus Bearer/Cookie).
    consumer.apply(SecurityHeadersMiddleware, CsrfMiddleware).forRoutes('*');
    consumer.apply(DevUserMiddleware, AuthMiddleware).forRoutes('*');
    // Rate Limit nach der Anmeldung (je Benutzer, sonst je IP)
    consumer.apply(RateLimitMiddleware).forRoutes('*');
  }
}
