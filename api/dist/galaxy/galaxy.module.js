"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GalaxyModule = void 0;
const common_1 = require("@nestjs/common");
const galaxy_client_1 = require("./galaxy.client");
const galaxy_controller_1 = require("./galaxy.controller");
const galaxy_service_1 = require("./galaxy.service");
const reports_service_1 = require("../reports/reports.service");
const dispatch_service_1 = require("../dispatch/dispatch.service");
const complaints_service_1 = require("../complaints/complaints.service");
const investigations_service_1 = require("../investigations/investigations.service");
const wanted_service_1 = require("../wanted/wanted.service");
let GalaxyModule = class GalaxyModule {
};
exports.GalaxyModule = GalaxyModule;
exports.GalaxyModule = GalaxyModule = __decorate([
    (0, common_1.Module)({
        controllers: [galaxy_controller_1.GalaxyController],
        providers: [{ provide: galaxy_client_1.GALAXY_FETCH, useValue: undefined }, galaxy_client_1.GalaxyClient, galaxy_service_1.GalaxyService, reports_service_1.ReportsService, dispatch_service_1.DispatchService, complaints_service_1.ComplaintsService, investigations_service_1.InvestigationsService, wanted_service_1.WantedService],
    })
], GalaxyModule);
//# sourceMappingURL=galaxy.module.js.map