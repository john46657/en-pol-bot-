"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STARTER_ROLES = void 0;
exports.seedBase = seedBase;
const shared_1 = require("@enrp/shared");
const only = (...mods) => shared_1.ALL_PERMISSIONS.filter((p) => mods.includes(p.split('.')[0] ?? ''));
const pick = (...keys) => keys;
/** Startrollen – Administratoren können eigene Rollen anlegen und diese ändern. */
exports.STARTER_ROLES = {
    'Police Member': { description: 'Standard-Polizeibenutzer', grants: [
            ...pick('dashboard.view', 'dashboard.customize', 'team.view', 'dispatch.view', 'incidents.view', 'incidents.create', 'persons.view', 'persons.create', 'vehicles.view', 'vehicles.create', 'reports.view', 'reports.create', 'reports.edit', 'reports.submit', 'tickets.view', 'tickets.create', 'complaints.create', 'wanted.view', 'evidence.view', 'evidence.create', 'communication.view', 'communication.send'),
        ] },
    'Senior Officer': { description: 'Erfahrener Officer', grants: [...pick('persons.edit', 'vehicles.edit', 'incidents.edit', 'wanted.create', 'wanted.edit', 'evidence.transfer', 'investigations.view', 'academy.view')] },
    Supervisor: { description: 'Schichtleitung', grants: [...pick('team.manage', 'dispatch.assign', 'dispatch.edit', 'incidents.close', 'reports.review', 'reports.approve', 'reports.reject', 'tickets.void', 'complaints.view', 'complaints.assign', 'wanted.activate', 'wanted.clear', 'applications.view', 'applications.review', 'analytics.view')] },
    Dispatch: { description: 'Leitstelle', grants: [...pick('dispatch.create', 'dispatch.edit', 'dispatch.assign', 'dispatch.close', 'dispatch.manage', 'incidents.create', 'incidents.edit', 'incidents.close', 'communication.moderate')] },
    Investigator: { description: 'Ermittler', grants: [...pick('investigations.view', 'investigations.create', 'investigations.edit', 'investigations.close', 'complaints.view', 'complaints.investigate', 'evidence.transfer', 'evidence.release', 'persons.edit')] },
    'Training Staff': { description: 'Academy-Ausbilder', grants: [...pick('academy.view', 'academy.manage', 'personnel.view')] },
    'Police Administration': { description: 'Polizeiführung', grants: [...only('personnel', 'applications', 'analytics'), ...pick('persons.archive', 'vehicles.archive', 'complaints.resolve', 'complaints.close', 'audit.view', 'users.view', 'roles.view', 'dashboard.view', 'team.view', 'team.manage')] },
    'System Administrator': { description: 'Vollzugriff auf Systemverwaltung', grants: ['*'] },
};
async function seedBase(prisma) {
    for (const key of shared_1.ALL_PERMISSIONS) {
        await prisma.permission.upsert({ where: { key }, create: { key, module: key.split('.')[0] ?? key }, update: {} });
    }
    await prisma.permission.upsert({ where: { key: '*' }, create: { key: '*', module: '*' }, update: {} });
    for (const [name, def] of Object.entries(exports.STARTER_ROLES)) {
        const role = await prisma.role.upsert({ where: { name }, create: { name, description: def.description, system: true }, update: {} });
        const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
        if (existing === 0) {
            await prisma.rolePermission.createMany({ data: def.grants.map((permissionKey) => ({ roleId: role.id, permissionKey, effect: 'ALLOW' })), skipDuplicates: true });
        }
    }
}
//# sourceMappingURL=seed-lib.js.map