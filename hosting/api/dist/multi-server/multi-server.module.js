"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiServerModule = void 0;
const common_1 = require("@nestjs/common");
const users_module_1 = require("../users/users.module");
const multi_server_controller_1 = require("./multi-server.controller");
const servers_service_1 = require("./servers.service");
const connections_service_1 = require("./connections.service");
const sync_service_1 = require("./sync.service");
/** Multi-Server: Server/Mandanten, Module je Server, Rollen & Rechte je Server, Verbindungen, Datenfreigaben, Synchronisierung. */
let MultiServerModule = class MultiServerModule {
};
exports.MultiServerModule = MultiServerModule;
exports.MultiServerModule = MultiServerModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ imports: [users_module_1.UsersModule], controllers: [multi_server_controller_1.ServersController, multi_server_controller_1.ConnectionsController, multi_server_controller_1.BotServersController], providers: [servers_service_1.ServersService, connections_service_1.ConnectionsService, sync_service_1.SyncService], exports: [servers_service_1.ServersService, connections_service_1.ConnectionsService, sync_service_1.SyncService] })
], MultiServerModule);
//# sourceMappingURL=multi-server.module.js.map