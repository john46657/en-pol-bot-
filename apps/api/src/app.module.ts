import { LeaveModule } from './leave/leave.module';
import { RosterModule } from './team-roster/roster.module';
import { MeModule } from './me/me.module';
import { RadioCodesModule } from './radio-codes/radio-codes.module';
import { TeamChanceModule } from './teamchance/teamchance.module';
import { CadModule } from './cad/cad.module';
import { MdtModule } from './mdt/mdt.module';
import { FleetModule } from './fleet/fleet.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthzModule } from './authz/authz.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PersonsModule } from './persons/persons.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { TicketsModule } from './tickets/tickets.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { ReportsModule } from './reports/reports.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { InvestigationsModule } from './investigations/investigations.module';
import { WantedModule } from './wanted/wanted.module';
import { EvidenceModule } from './evidence/evidence.module';
import { PersonnelModule } from './personnel/personnel.module';
import { DutyModule } from './duty/duty.module';
import { ApplicationsModule } from './applications/applications.module';
import { ApplicationBansModule } from './application-bans/application-bans.module';
import { AcademyModule } from './academy/academy.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SearchModule } from './search/search.module';
import { CommunicationModule } from './communication/communication.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AdminModule } from './admin/admin.module';
import { ExportModule } from './export/export.module';
import { MediaModule } from './media/media.module';
import { StudioModule } from './studio/studio.module';
import { DiscordModule } from './discord/discord.module';
import { DangerModule } from './danger/danger.module';
import { RadioModule } from './radio/radio.module';
import { SekModule } from './sek/sek.module';
import { QualificationsModule } from './qualifications/qualifications.module';
import { SupportTicketsModule } from './support-tickets/tickets.module';
import { AuditController } from './audit/audit.controller';
import { HealthController } from './health/health.controller';
import { AuthGuard, PermissionGuard } from './authz/guards';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { OriginMiddleware } from './common/origin.middleware';
import { GuildContextMiddleware } from './common/guild-context';

import { LocksModule } from './locks/locks.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { WelcomeModule } from './welcome/welcome.module';
import { VoiceSupportModule } from './voice-support/voice-support.module';
import { EmbedsModule } from './embeds/embeds.module';
import { ServerLinksModule } from './server-links/server-links.module';
import { LoggingModule } from './logging/logging.module';
import { BackupModule } from './backup/backup.module';
import { VerificationModule } from './verification/verification.module';
import { PanelsModule } from './discord-panels/panels.module';
import { DutyReportsModule } from './duty-reports/duty-reports.module';
import { HrModule } from './hr/hr.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 300 }], errorMessage: 'Zu viele Anfragen – bitte kurz warten.' }),
    DiscoveryModule, PrismaModule, AuthzModule, AuditModule, AuthModule, UsersModule, PersonsModule, VehiclesModule, TicketsModule,
    DispatchModule, ReportsModule, ComplaintsModule, InvestigationsModule, WantedModule, EvidenceModule,
    PersonnelModule, DutyModule, ApplicationsModule, ApplicationBansModule, AcademyModule, NotificationsModule, SearchModule, CommunicationModule, AnalyticsModule, RealtimeModule, AdminModule, ExportModule, MediaModule, StudioModule, DiscordModule, DangerModule, RadioModule, SekModule, QualificationsModule, SupportTicketsModule, LeaveModule, RosterModule, MeModule, RadioCodesModule, TeamChanceModule, CadModule, MdtModule, FleetModule, LocksModule, WorkflowsModule, WelcomeModule, VoiceSupportModule, EmbedsModule, ServerLinksModule, LoggingModule, BackupModule, VerificationModule, PanelsModule, DutyReportsModule, HrModule,
  ],
  controllers: [HealthController, AuditController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, OriginMiddleware, GuildContextMiddleware).forRoutes('{*splat}');
  }
}
