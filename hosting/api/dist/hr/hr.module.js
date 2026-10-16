"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HrModule = void 0;
const common_1 = require("@nestjs/common");
const backup_module_1 = require("../backup/backup.module");
const hr_controller_1 = require("./hr.controller");
const hr_training_sessions_service_1 = require("./hr-training-sessions.service");
const hr_core_service_1 = require("./hr-core.service");
const hr_people_service_1 = require("./hr-people.service");
const hr_requests_service_1 = require("./hr-requests.service");
const hr_training_service_1 = require("./hr-training.service");
const hr_exam_service_1 = require("./hr-exam.service");
const hr_comms_service_1 = require("./hr-comms.service");
const service_numbers_service_1 = require("./service-numbers.service");
/** Personal- & Verwaltungssystem: Personalakte, Ränge/Beförderungen, Versetzungen, Ausbildungen/Prüfungen, Meldungen/Abstimmungen, Dienstnummern. */
let HrModule = class HrModule {
};
exports.HrModule = HrModule;
exports.HrModule = HrModule = __decorate([
    (0, common_1.Module)({
        imports: [backup_module_1.BackupModule],
        controllers: [hr_controller_1.HrController, hr_controller_1.HrExamController, hr_controller_1.HrRequestsController, hr_controller_1.HrTrainingController, hr_controller_1.HrTrainingSessionsController, hr_controller_1.BotTrainingSessionsController, hr_controller_1.HrCommsController, hr_controller_1.ServiceNumbersController],
        providers: [hr_core_service_1.HrCoreService, hr_people_service_1.HrPeopleService, hr_requests_service_1.HrRequestsService, hr_training_service_1.HrTrainingService, hr_exam_service_1.HrExamService, hr_training_sessions_service_1.HrTrainingSessionsService, hr_comms_service_1.HrCommsService, service_numbers_service_1.ServiceNumbersService],
        exports: [hr_core_service_1.HrCoreService, service_numbers_service_1.ServiceNumbersService],
    })
], HrModule);
//# sourceMappingURL=hr.module.js.map