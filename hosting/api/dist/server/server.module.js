"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerModule = void 0;
const common_1 = require("@nestjs/common");
const backup_module_1 = require("../backup/backup.module");
const home_server_service_1 = require("./home-server.service");
const modules_service_1 = require("./modules.service");
const modules_controller_1 = require("./modules.controller");
const single_server_migration_service_1 = require("./single-server-migration.service");
/** Der eine Discord-Server dieses Systems, zentrale Module und die einmalige Zusammenführung der früheren Daten je Server. */
let ServerModule = class ServerModule {
};
exports.ServerModule = ServerModule;
exports.ServerModule = ServerModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ imports: [backup_module_1.BackupModule], controllers: [modules_controller_1.ModulesController, modules_controller_1.BotServerController], providers: [home_server_service_1.HomeServerService, modules_service_1.ModulesService, single_server_migration_service_1.SingleServerMigrationService], exports: [home_server_service_1.HomeServerService, modules_service_1.ModulesService, single_server_migration_service_1.SingleServerMigrationService] })
], ServerModule);
//# sourceMappingURL=server.module.js.map