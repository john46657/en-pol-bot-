"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const leave_module_1 = require("./leave/leave.module");
const roster_module_1 = require("./team-roster/roster.module");
const me_module_1 = require("./me/me.module");
const radio_codes_module_1 = require("./radio-codes/radio-codes.module");
const teamchance_module_1 = require("./teamchance/teamchance.module");
const cad_module_1 = require("./cad/cad.module");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const prisma_module_1 = require("./prisma/prisma.module");
const authz_module_1 = require("./authz/authz.module");
const audit_module_1 = require("./audit/audit.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const persons_module_1 = require("./persons/persons.module");
const vehicles_module_1 = require("./vehicles/vehicles.module");
const tickets_module_1 = require("./tickets/tickets.module");
const dispatch_module_1 = require("./dispatch/dispatch.module");
const reports_module_1 = require("./reports/reports.module");
const complaints_module_1 = require("./complaints/complaints.module");
const investigations_module_1 = require("./investigations/investigations.module");
const wanted_module_1 = require("./wanted/wanted.module");
const evidence_module_1 = require("./evidence/evidence.module");
const personnel_module_1 = require("./personnel/personnel.module");
const duty_module_1 = require("./duty/duty.module");
const applications_module_1 = require("./applications/applications.module");
const academy_module_1 = require("./academy/academy.module");
const notifications_module_1 = require("./notifications/notifications.module");
const search_module_1 = require("./search/search.module");
const communication_module_1 = require("./communication/communication.module");
const analytics_module_1 = require("./analytics/analytics.module");
const realtime_module_1 = require("./realtime/realtime.module");
const admin_module_1 = require("./admin/admin.module");
const export_module_1 = require("./export/export.module");
const media_module_1 = require("./media/media.module");
const studio_module_1 = require("./studio/studio.module");
const discord_module_1 = require("./discord/discord.module");
const danger_module_1 = require("./danger/danger.module");
const radio_module_1 = require("./radio/radio.module");
const sek_module_1 = require("./sek/sek.module");
const qualifications_module_1 = require("./qualifications/qualifications.module");
const tickets_module_2 = require("./support-tickets/tickets.module");
const audit_controller_1 = require("./audit/audit.controller");
const health_controller_1 = require("./health/health.controller");
const guards_1 = require("./authz/guards");
const all_exceptions_filter_1 = require("./common/all-exceptions.filter");
const request_id_middleware_1 = require("./common/request-id.middleware");
const origin_middleware_1 = require("./common/origin.middleware");
const guild_context_1 = require("./common/guild-context");
const locks_module_1 = require("./locks/locks.module");
const workflows_module_1 = require("./workflows/workflows.module");
const welcome_module_1 = require("./welcome/welcome.module");
let AppModule = class AppModule {
    configure(consumer) {
        consumer.apply(request_id_middleware_1.RequestIdMiddleware, origin_middleware_1.OriginMiddleware, guild_context_1.GuildContextMiddleware).forRoutes('{*splat}');
    }
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            throttler_1.ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 300 }], errorMessage: 'Zu viele Anfragen – bitte kurz warten.' }),
            core_1.DiscoveryModule, prisma_module_1.PrismaModule, authz_module_1.AuthzModule, audit_module_1.AuditModule, auth_module_1.AuthModule, users_module_1.UsersModule, persons_module_1.PersonsModule, vehicles_module_1.VehiclesModule, tickets_module_1.TicketsModule,
            dispatch_module_1.DispatchModule, reports_module_1.ReportsModule, complaints_module_1.ComplaintsModule, investigations_module_1.InvestigationsModule, wanted_module_1.WantedModule, evidence_module_1.EvidenceModule,
            personnel_module_1.PersonnelModule, duty_module_1.DutyModule, applications_module_1.ApplicationsModule, academy_module_1.AcademyModule, notifications_module_1.NotificationsModule, search_module_1.SearchModule, communication_module_1.CommunicationModule, analytics_module_1.AnalyticsModule, realtime_module_1.RealtimeModule, admin_module_1.AdminModule, export_module_1.ExportModule, media_module_1.MediaModule, studio_module_1.StudioModule, discord_module_1.DiscordModule, danger_module_1.DangerModule, radio_module_1.RadioModule, sek_module_1.SekModule, qualifications_module_1.QualificationsModule, tickets_module_2.SupportTicketsModule, leave_module_1.LeaveModule, roster_module_1.RosterModule, me_module_1.MeModule, radio_codes_module_1.RadioCodesModule, teamchance_module_1.TeamChanceModule, cad_module_1.CadModule, locks_module_1.LocksModule, workflows_module_1.WorkflowsModule, welcome_module_1.WelcomeModule,
        ],
        controllers: [health_controller_1.HealthController, audit_controller_1.AuditController],
        providers: [
            { provide: core_1.APP_FILTER, useClass: all_exceptions_filter_1.AllExceptionsFilter },
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: guards_1.AuthGuard },
            { provide: core_1.APP_GUARD, useClass: guards_1.PermissionGuard },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map