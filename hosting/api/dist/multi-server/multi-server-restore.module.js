"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiServerRestoreModule = void 0;
const common_1 = require("@nestjs/common");
const backup_module_1 = require("../backup/backup.module");
const server_links_module_1 = require("../server-links/server-links.module");
const multi_server_module_1 = require("./multi-server.module");
const multi_server_restore_service_1 = require("./multi-server-restore.service");
/** Einmalige Rück-Umstellung vom Ein-Server-Betrieb (nach Server-Verbund, Modul-Katalog und Backups initialisiert). */
let MultiServerRestoreModule = class MultiServerRestoreModule {
};
exports.MultiServerRestoreModule = MultiServerRestoreModule;
exports.MultiServerRestoreModule = MultiServerRestoreModule = __decorate([
    (0, common_1.Module)({ imports: [backup_module_1.BackupModule, server_links_module_1.ServerLinksModule, multi_server_module_1.MultiServerModule], providers: [multi_server_restore_service_1.MultiServerRestoreService], exports: [multi_server_restore_service_1.MultiServerRestoreService] })
], MultiServerRestoreModule);
//# sourceMappingURL=multi-server-restore.module.js.map