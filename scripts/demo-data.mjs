#!/usr/bin/env node
/**
 * Legt Test-Accounts und realistische Demo-Daten über die ECHTE API an (damit Audit, Timeline,
 * Verknüpfungen und Benachrichtigungen genau wie im Betrieb entstehen). Idempotent. Nur lokal!
 */
const API = process.env.API_URL ?? 'http://localhost:3000';
if (process.env.NODE_ENV === 'production') { console.error('Refusing to create demo data in production.'); process.exit(1); }
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin-Demo-123456';
const DEMO_PASSWORD = 'Demo-Pass-123456';

class Client {
  cookie = '';
  async call(method, path, body) {
    const res = await fetch(`${API}/api/v1${path}`, { method, headers: { 'content-type': 'application/json', ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    const text = await res.text(); const json = text ? JSON.parse(text) : undefined;
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${json?.message ?? ''} ${JSON.stringify(json?.details ?? '')}`);
    return json;
  }
  login(u, p) { return this.call('POST', '/auth/login', { username: u, password: p }); }
}
const get = (c, p) => c.call('GET', p), post = (c, p, b) => c.call('POST', p, b), put = (c, p, b) => c.call('PUT', p, b);

const USERS = [
  ['dispatcher', 'Dana Dispatch', ['Police Member', 'Dispatch'], '9000001'],
  ['officer1', 'Oscar Officer', ['Police Member'], '9000002'],
  ['officer2', 'Olivia Officer', ['Police Member', 'Senior Officer'], '9000003'],
  ['supervisor', 'Sam Supervisor', ['Police Member', 'Senior Officer', 'Supervisor'], '9000004'],
  ['detective', 'Dina Detective', ['Police Member', 'Investigator'], '9000005'],
  ['hrmanager', 'Hana HR', ['Police Member', 'Police Administration'], '9000006'],
  ['trainer', 'Theo Trainer', ['Police Member', 'Training Staff'], '9000007'],
];

const admin = new Client();
try { await admin.login('admin', ADMIN_PASSWORD); } catch { console.log('Demo data skipped: could not log in as admin (custom admin password?). Set ADMIN_PASSWORD.'); process.exit(0); }
const existing = await get(admin, '/users?q=officer1');
if (existing.items.some((u) => u.username === 'officer1')) { console.log('Demo data already present.'); printAccounts(); process.exit(0); }

const roles = Object.fromEntries((await get(admin, '/roles')).map((r) => [r.name, r.id]));
const uid = {};
for (const [username, displayName, rs, rbx] of USERS) {
  const u = await post(admin, '/users', { username, displayName, password: DEMO_PASSWORD, roleIds: rs.map((r) => roles[r]) });
  uid[username] = u.id;
  await put(admin, `/users/${u.id}/roblox`, { robloxUserId: rbx, robloxUsername: displayName.replace(' ', '_') });
}
const adminId = (await get(admin, '/users?q=admin')).items.find((u) => u.username === 'admin').id;

// Legal codes
const codes = {};
for (const [code, title, category, fine] of [['TVO-12', 'Speeding', 'Traffic', 300], ['TVO-30', 'Reckless driving', 'Traffic', 800], ['STG-5', 'Disorderly conduct', 'Public order', 500], ['STG-21', 'Possession of a prohibited weapon', 'Weapons', 2500]]) {
  codes[code] = (await post(admin, '/legal-codes', { code, title, category, penalty: { fine } })).id;
}

// Personnel + units + academy
const pers = {};
for (const [u, rank, cs] of [['officer1', 'Officer', 'A-11'], ['officer2', 'Senior Officer', 'A-12'], ['supervisor', 'Sergeant', 'S-1'], ['detective', 'Detective', 'D-4'], ['dispatcher', 'Dispatcher', 'DISP-1'], ['trainer', 'Instructor', 'T-2']]) {
  pers[u] = (await post(admin, '/personnel', { userId: uid[u], rank, callsign: cs, team: u === 'detective' ? 'CID' : 'Patrol' })).id;
}
const adam1 = await post(admin, '/dispatch/units', { callsign: 'ADAM-1', vehicle: '2019 Falcon Interceptor', memberIds: [uid.officer1, uid.officer2] });
const bravo2 = await post(admin, '/dispatch/units', { callsign: 'BRAVO-2', memberIds: [uid.supervisor] });
await put(admin, `/dispatch/units/${adam1.id}/status`, { status: 'AVAILABLE' });
await put(admin, `/dispatch/units/${bravo2.id}/status`, { status: 'AVAILABLE' });
const course = await post(admin, '/academy/courses', { title: 'Traffic Stop Procedures', description: 'Safe vehicle stops, officer positioning, communication.', passScore: 70 });
await post(admin, '/academy/courses', { title: 'Pursuit Driving', description: 'Pursuit policy and tactics.', passScore: 80 });
const enr = await post(admin, `/academy/courses/${course.id}/enroll`, { personnelId: pers.officer1 });
await post(admin, `/academy/enrollments/${enr.id}/grade`, { score: 88 });

// Persons & vehicles
const P = {};
for (const [name, rbx] of [['Alex_Racer', '7000001'], ['Bella_Banks', '7000002'], ['Cody_Crook', '7000003'], ['Dana_Driver', '7000004'], ['Eli_Witness', '7000005']]) P[name] = (await post(admin, '/persons', { robloxUsername: name, robloxUserId: rbx })).person.id;
const V = {};
V.falcon = (await post(admin, '/vehicles', { plate: 'LC 1001', model: '2020 Falcon Stallion', color: 'Red', ownerId: P.Alex_Racer })).id;
V.van = (await post(admin, '/vehicles', { plate: 'LC 2002', model: 'Bullhorn Prancer', color: 'Black', ownerId: P.Cody_Crook })).id;
await post(admin, '/vehicles', { plate: 'LC 3003', model: 'Chevlon Camion', color: 'White', ownerId: P.Dana_Driver });

// Operations as real users
const sup = new Client(); await sup.login('supervisor', DEMO_PASSWORD);
const disp = new Client(); await disp.login('dispatcher', DEMO_PASSWORD);
const o1 = new Client(); await o1.login('officer1', DEMO_PASSWORD);
const det = new Client(); await det.login('detective', DEMO_PASSWORD);
await put(o1, '/team/me/status', { status: 'ON_DUTY' });
const o2c = new Client(); await o2c.login('officer2', DEMO_PASSWORD); await put(o2c, '/team/me/status', { status: 'ON_DUTY' });
await put(sup, '/team/me/status', { status: 'ON_DUTY' });

const i1 = await post(disp, '/incidents', { title: 'Armed robbery at Liberty Bank', priority: 'CRITICAL', location: 'Main St 12', description: 'Two masked suspects, black Prancer fleeing north.', personIds: [P.Cody_Crook], vehicleIds: [V.van] });
await post(disp, `/dispatch/incidents/${i1.id}/assign`, { unitId: adam1.id });
await put(disp, `/dispatch/incidents/${i1.id}/status`, { status: 'EN_ROUTE' });
await post(disp, '/incidents', { title: 'Traffic collision on Highway 1', priority: 'MEDIUM', location: 'Highway 1, km 14', personIds: [P.Dana_Driver] });
await post(disp, '/incidents', { title: 'Noise complaint', priority: 'LOW', location: 'Elm Ave 8' });
const closed = await post(disp, '/incidents', { title: 'Welfare check (completed)', priority: 'LOW' });
await post(disp, `/dispatch/incidents/${closed.id}/assign`, { unitId: bravo2.id });
for (const s of ['EN_ROUTE', 'ON_SCENE', 'CLEARING']) await put(disp, `/dispatch/incidents/${closed.id}/status`, { status: s });
await post(disp, `/dispatch/incidents/${closed.id}/close`);

const t1 = await post(o1, '/tickets', { personId: P.Alex_Racer, legalCodeId: codes['TVO-12'], reason: 'Speeding 118 km/h in a 60 zone' });
await post(o1, '/tickets', { personId: P.Dana_Driver, legalCodeId: codes['TVO-30'], reason: 'Reckless driving near school' });
void t1;
const r1 = await post(o1, '/reports', { type: 'PATROL', title: 'Night patrol 03.10.', content: { body: 'Routine patrol of downtown. Two traffic stops, one ticket issued.' }, personIds: [P.Alex_Racer] });
await post(o1, `/reports/${r1.id}/submit`);
await post(o1, '/reports', { type: 'ARREST', title: 'Draft: arrest report bank robbery', content: { body: 'Draft…' }, personIds: [P.Cody_Crook] });
const c1 = await post(o1, '/complaints', { subjectId: P.Bella_Banks, category: 'Conduct', description: 'Complainant states the officer was rude during a traffic stop on Elm Avenue.' });
void c1;
const inv = await post(det, '/investigations', { title: 'Liberty Bank robbery ring', description: 'Linked to two earlier robberies.', persons: [{ personId: P.Cody_Crook, role: 'SUSPECT' }, { personId: P.Eli_Witness, role: 'WITNESS' }] });
await post(det, '/evidence', { type: 'Weapon', description: 'Pistol recovered near Main St', caseRef: inv.caseNumber, storageLocation: 'Locker 4', personIds: [P.Cody_Crook] });
await post(sup, '/wanted', { personId: P.Cody_Crook, reason: 'Armed robbery — Liberty Bank', priority: 'URGENT', description: 'Armed and dangerous' });
await post(det, '/communication/channels/TEAM/messages', { body: 'Briefing at 20:00 — focus on the bank robbery case.' }).catch(() => undefined);
await post(admin, '/communication/channels/ANNOUNCEMENT/messages', { body: 'Welcome to ENRP NEXUS! This is demo data.' });
await post(admin, '/communication/channels/TEAM/messages', { body: 'Patrol assignments are posted in Dispatch.' });
await fetch(`${API}/api/v1/applications`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ robloxUsername: 'Nina_Newbie', robloxUserId: '8000001', answers: { experience: '2 years RP', availability: 'Evenings', motivation: 'I like structured roleplay.', roleplayKnowledge: 'Familiar with FRP/NITRP.', erlcKnowledge: 'Good' } }) });
void adminId;
console.log('Demo data created.');
printAccounts();

function printAccounts() {
  console.log('\n  Account       Password            Roles');
  console.log(`  admin         ${ADMIN_PASSWORD.padEnd(19)} System Administrator`);
  for (const [u, , rs] of USERS) console.log(`  ${u.padEnd(13)} ${DEMO_PASSWORD.padEnd(19)} ${rs.join(', ')}`);
}
