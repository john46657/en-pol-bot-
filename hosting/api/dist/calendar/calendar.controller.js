"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MeetingsController = exports.CalendarController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const zod_1 = require("zod");
const shared_1 = require("@enrp/shared");
const decorators_1 = require("../authz/decorators");
const zod_pipe_1 = require("../common/zod.pipe");
const calendar_service_1 = require("./calendar.service");
const meetings_service_1 = require("./meetings.service");
const listQ = zod_1.z.object({ from: zod_1.z.coerce.date(), to: zod_1.z.coerce.date(), category: zod_1.z.enum(shared_1.EVENT_CATEGORIES).optional(), department: zod_1.z.string().max(64).optional(), mine: zod_1.z.enum(['true', 'false']).optional() });
const upcomingQ = zod_1.z.object({ days: zod_1.z.coerce.number().int().min(1).max(60).default(14), scope: zod_1.z.enum(['mine', 'all']).default('all') });
const reasonBody = zod_1.z.object({ reason: zod_1.z.string().trim().min(3).max(500) });
const respondBody = zod_1.z.object({ status: zod_1.z.enum(['ACCEPTED', 'DECLINED', 'EXCUSED']), note: zod_1.z.string().trim().max(300).optional() });
const inviteBody = zod_1.z.object({ userIds: zod_1.z.array(zod_1.z.string().uuid()).min(1).max(200) });
const attendanceBody = zod_1.z.object({ entries: zod_1.z.array(zod_1.z.object({ userId: zod_1.z.string().uuid(), status: zod_1.z.enum(['ATTENDED', 'ABSENT', 'EXCUSED']) })).min(1).max(500) });
const meetingsQ = zod_1.z.object({ scope: zod_1.z.enum(['upcoming', 'past']).default('upcoming') });
const taskStatus = zod_1.z.object({ status: zod_1.z.enum(['OPEN', 'DONE', 'CANCELLED']) });
/** Zentraler Kalender. Ansehen/teilnehmen: calendar.view · anlegen/ändern/absagen: calendar.manage (Besprechungen: Organisator). */
let CalendarController = class CalendarController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, q) { return this.s.list(a, { ...q, mine: q.mine === 'true' }); }
    upcoming(a, q) { return this.s.upcoming(a, q.days, q.scope); }
    get(a, id) { return this.s.get(a, id); }
    create(a, b) { return this.s.create(a, b); }
    /** Ändern/Verschieben: Recht im Service (Kalenderverwaltung oder Organisator der Besprechung) */
    update(a, id, b) { return this.s.update(a, id, b); }
    cancel(a, id, b) { return this.s.cancel(a, id, b.reason); }
    invite(a, id, b) { return this.s.invite(a, id, b.userIds); }
    respond(a, id, b) { return this.s.respond(a, id, b.status, b.note); }
    attendance(a, id, b) { return this.s.attendance(a, id, b.entries); }
};
exports.CalendarController = CalendarController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(listQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('upcoming'),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(upcomingQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "upcoming", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "get", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('calendar.manage'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(calendar_service_1.createEventBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(calendar_service_1.eventInput.extend({ version: zod_1.z.number().int().min(1) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/invite'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(inviteBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)(':id/respond'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(respondBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "respond", null);
__decorate([
    (0, common_1.Post)(':id/attendance'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('calendar.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(attendanceBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], CalendarController.prototype, "attendance", null);
exports.CalendarController = CalendarController = __decorate([
    (0, swagger_1.ApiTags)('calendar'),
    (0, common_1.Controller)('calendar'),
    __metadata("design:paramtypes", [calendar_service_1.CalendarService])
], CalendarController);
/** Besprechungsmanager. Ansehen: meetings.view · anlegen: meetings.organize · Protokoll: Organisator/meetings.minutes · privat: meetings.view_private. */
let MeetingsController = class MeetingsController {
    s;
    constructor(s) {
        this.s = s;
    }
    list(a, q) { return this.s.list(a, q); }
    tasks(a) { return this.s.openTasks(a); }
    get(a, id) { return this.s.get(a, id); }
    async csv(a, id, res) {
        res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="teilnehmer.csv"' }).send(`﻿${await this.s.exportParticipants(a, id)}`);
    }
    create(a, b) { return this.s.create(a, b); }
    update(a, id, b) { return this.s.update(a, id, b); }
    cancel(a, id, b) { return this.s.cancel(a, id, b.reason); }
    minutes(a, id, b) { return this.s.saveMinutes(a, id, b); }
    conduct(a, id) { return this.s.conduct(a, id); }
    addTask(a, id, b) { return this.s.addTask(a, id, b); }
    setTask(a, id, b) { return this.s.setTask(a, id, b.status); }
};
exports.MeetingsController = MeetingsController;
__decorate([
    (0, common_1.Get)(),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Query)((0, zod_pipe_1.zodBody)(meetingsQ))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('tasks'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "tasks", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "get", null);
__decorate([
    (0, common_1.Get)(':id/participants.csv'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], MeetingsController.prototype, "csv", null);
__decorate([
    (0, common_1.Post)(),
    (0, decorators_1.RequirePermission)('meetings.organize'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Body)((0, zod_pipe_1.zodBody)(meetings_service_1.meetingBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(meetings_service_1.meetingBody.extend({ version: zod_1.z.number().int().min(1) })))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(reasonBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "cancel", null);
__decorate([
    (0, common_1.Patch)(':id/minutes'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(meetings_service_1.minutesBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "minutes", null);
__decorate([
    (0, common_1.Post)(':id/conduct'),
    (0, common_1.HttpCode)(200),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "conduct", null);
__decorate([
    (0, common_1.Post)(':id/tasks'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(meetings_service_1.taskBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "addTask", null);
__decorate([
    (0, common_1.Patch)('tasks/:taskId'),
    (0, decorators_1.RequirePermission)('meetings.view'),
    __param(0, (0, decorators_1.CurrentActor)()),
    __param(1, (0, common_1.Param)('taskId', common_1.ParseUUIDPipe)),
    __param(2, (0, common_1.Body)((0, zod_pipe_1.zodBody)(taskStatus))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, void 0]),
    __metadata("design:returntype", void 0)
], MeetingsController.prototype, "setTask", null);
exports.MeetingsController = MeetingsController = __decorate([
    (0, swagger_1.ApiTags)('meetings'),
    (0, common_1.Controller)('meetings'),
    __metadata("design:paramtypes", [meetings_service_1.MeetingsService])
], MeetingsController);
//# sourceMappingURL=calendar.controller.js.map