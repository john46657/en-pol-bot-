import { prisma } from './client.js';
import {
  auditRepository,
  discordSyncRepository,
  guildRepository,
  permissionRepository,
  userRepository,
} from './repositories/index.js';

/** Dev-Seed (idempotent): Demo-Server mit Rollen, Kanälen, Benutzer und Permission-Zuordnung. */
const GUILD_ID = '900000000000000001';

await guildRepository.upsert({
  id: GUILD_ID,
  name: 'NEXUS Demo-Server',
  ownerId: '900000000000000010',
});
await userRepository.upsert({
  id: '900000000000000010',
  username: 'demo-admin',
  globalName: 'Demo Admin',
});
await discordSyncRepository.syncRoles(GUILD_ID, [
  { discordId: '900000000000000100', name: '@Polizeileitung', position: 10 },
  { discordId: '900000000000000101', name: '@Polizei', position: 5 },
  { discordId: '900000000000000102', name: '@Bewerbungsteam', position: 6 },
]);
await discordSyncRepository.syncChannels(GUILD_ID, [
  { discordId: '900000000000000200', name: 'Büro', type: 4 },
  { discordId: '900000000000000201', name: 'bewerbungen', type: 0, parentId: '900000000000000200' },
  {
    discordId: '900000000000000202',
    name: 'Büro-Warteraum',
    type: 2,
    parentId: '900000000000000200',
  },
]);
await permissionRepository.setRolesForKey(GUILD_ID, 'applications.manage', [
  '900000000000000102',
  '900000000000000100',
]);
await auditRepository.create({
  guildId: GUILD_ID,
  actorType: 'SYSTEM',
  action: 'seed.run',
  metadata: { seed: 'dev' },
});

console.log(`Seed fertig (Guild ${GUILD_ID}).`);
await prisma.$disconnect();
