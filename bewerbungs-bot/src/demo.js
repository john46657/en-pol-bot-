import { randomBytes } from 'node:crypto';
import { Store } from './store.js';
import { ApplicationService } from './service.js';
import { defaultPanel, defaultType } from './defaults.js';
import { createWebServer } from './web/server.js';

/**
 * Demo-Modus: Dashboard ohne Discord ausprobieren (`npm run demo`, dann http://localhost:3000).
 * Ein ausgedachter Server mit Beispiel-Bewerbungen; was der Bot in Discord tun würde, steht in der Konsole.
 */
export const DEMO_GUILD = '100000000000000001';
const DEMO_USER = { id: '200000000000000001', name: 'Demo-Admin', avatar: null };
const ch = (n, name) => ({ id: `30000000000000000${n}`, name, parent: 'Bewerbungen', botCanSend: true });
const role = (n, name, color) => ({ id: `40000000000000000${n}`, name, color, managed: false, assignable: true });
const META = {
  id: DEMO_GUILD, name: 'Demo-Server', icon: null,
  channels: [ch(1, 'bewerbung-panel'), ch(2, 'bewerbungen-offen'), ch(3, 'bewerbungen-angenommen'), ch(4, 'bewerbungen-abgelehnt')],
  categories: [{ id: '500000000000000001', name: 'Tickets' }],
  roles: [role(1, 'Leitung', '#e74c3c'), role(2, 'Personalabteilung', '#3498db'), role(3, 'Mitglied', '#2ecc71'), role(4, 'Bewerber', '#95a5a6'), role(5, 'SEK', '#34495e')],
  botCanManageRoles: true,
};

export function demoAdapter(log = console) {
  const say = (...a) => log.info('[Discord-Demo]', ...a);
  let n = 1000;
  return {
    async guildName() { return META.name; },
    async sendDm(userId) { say(`DM an ${userId}`); return { channelId: '1', messageId: String(n++) }; },
    async sendDecisionDm(app, type, text) { say(`Entscheidungs-DM an ${app.userName}:\n${text}`); },
    async applyRoles(g, userId, add, remove) { say(`Rollen für ${userId}: +[${add}] -[${remove}]`); },
    async postApplication(g, app, type) { say(`Bewerbung ${app.number} im Kanal ${type.channels.pending || '(keiner)'}`); return type.channels.pending ? { channelId: type.channels.pending, messageId: String(n++) } : null; },
    async updateApplicationMessage(app) { say(`Nachricht von ${app.number} aktualisiert (${app.status})`); },
    async postArchive(channelId, app) { say(`${app.number} in Archiv-Kanal ${channelId}`); },
    async postPanel(g, panel) { say(`Panel „${panel.title}“ in Kanal ${panel.channelId}`); return { channelId: panel.channelId, messageId: String(n++) }; },
    async createTicket(g, app) { say(`Ticket für ${app.number}`); return { channelId: '600000000000000001', existing: false }; },
    guilds() { return [{ id: DEMO_GUILD, name: META.name, icon: null }]; },
    async member(g, userId) { return userId === DEMO_USER.id ? { roles: [], manageGuild: true, name: DEMO_USER.name, avatar: null } : null; },
    async meta() { return META; },
  };
}

const SAMPLES = [
  ['Lena', ['Lena, 19', 'Ich spiele seit zwei Jahren auf dem Server und möchte aktiv mithelfen, dass neue Spieler sich wohlfühlen. hab schon bei einem anderen server im support geholfen', 'Support auf einem Minecraft-Server, ca. 1 Jahr', 'Abends ab 18 Uhr, am Wochenende mehr'], 'OPEN', 900],
  ['Max_TTV', ['Max, 22', 'Gerne! Hier ist eine mögliche Antwort: Ich bin fest davon überzeugt, dass ich einen wertvollen Beitrag leisten kann. Darüber hinaus ist Teamfähigkeit von großer Bedeutung für mich. Zusammenfassend lässt sich sagen, dass ich motiviert bin.', 'Ich bringe umfangreiche Erfahrung mit — insbesondere im Bereich Moderation und Community-Management.', 'Täglich 2–3 Stunden'], 'OPEN', 70],
  ['Jonas', ['Jonas 17', 'weil ich bock hab xD und die leute hier nett sind', 'noch keine aber lerne schnell', 'fast jeden tag'], 'REVIEW', 600],
  ['Sophie', ['Sophie, 21', 'Ich möchte Verantwortung übernehmen und die Community mitgestalten.', '2 Jahre Moderatorin auf Discord-Servern mit 5000+ Mitgliedern', 'Mo–Fr abends'], 'ACCEPTED', 1200],
  ['Tim', ['Tim, 15', 'will admin werden', 'keine', 'manchmal'], 'REJECTED', 120],
];

export function seedDemo(store, service) {
  store.setGuild(DEMO_GUILD, {
    access: { adminRoles: [META.roles[0].id], reviewerRoles: [META.roles[1].id] },
    tickets: { categoryId: META.categories[0].id, staffRoleId: META.roles[1].id },
    types: [
      defaultType({ channels: { pending: META.channels[1].id, accepted: META.channels[2].id, denied: META.channels[3].id }, pingRoles: [META.roles[1].id], roles: { ...defaultType().roles, accepted: [META.roles[2].id], pending: [META.roles[3].id] } }),
      defaultType({ key: 'sek', name: 'SEK', emoji: '🎯', description: 'Spezialeinheit – nur für erfahrene Mitglieder.', mode: 'WEB', cooldownMinutes: 10_080,
        questions: [
          { key: 'roblox', label: 'Wie ist dein Roblox-Benutzername?', required: true, type: 'ROBLOX' },
          { key: 'rang', label: 'Welchen Rang hast du?', required: true, type: 'CHOICE', options: [{ label: 'Anwärter' }, { label: 'Beamter' }, { label: 'Kommissar' }] },
          { key: 'warum', label: 'Warum möchtest du zum SEK?', required: true, type: 'TEXT', minLength: 20, maxLength: 1500 },
        ], roles: { ...defaultType().roles, accepted: [META.roles[4].id], required: { ids: [META.roles[2].id], mode: 'ANY' } } }),
    ],
    panels: [defaultPanel({ channelId: META.channels[0].id, types: ['team', 'sek'] })],
  });
  const day = 86_400_000;
  SAMPLES.forEach(([name, answers, status, dur], i) => {
    const t = store.guild(DEMO_GUILD).types[0];
    const created = new Date(Date.now() - (i * 2 + 1) * day - i * 3_600_000).toISOString();
    const a = store.addApplication({ guildId: DEMO_GUILD, type: t.key, typeName: t.name, status: 'OPEN', userId: `70000000000000000${i}`, userName: name, avatar: null,
      answers: t.questions.map((q, j) => ({ key: q.key, question: q.label, answer: answers[j] })), grantRoleIds: [], roblox: null, source: 'DM', durationSec: dur,
      joinedAt: new Date(Date.now() - 90 * day).toISOString(), createdAt: created, updatedAt: created, decidedAt: null, decidedBy: null, reason: null, notes: [], history: [{ at: created, status: 'OPEN', by: null }], message: null });
    if (status === 'REVIEW') { a.status = 'REVIEW'; a.history.push({ at: created, status: 'REVIEW', by: { id: DEMO_USER.id, name: DEMO_USER.name } }); }
    if (status === 'ACCEPTED' || status === 'REJECTED') {
      const at = new Date(Date.parse(created) + 5 * 3_600_000).toISOString();
      Object.assign(a, { status, decidedAt: at, updatedAt: at, decidedBy: { id: DEMO_USER.id, name: DEMO_USER.name }, reason: status === 'REJECTED' ? 'Mindestalter 16 nicht erreicht.' : null });
      a.history.push({ at, status, by: a.decidedBy, note: a.reason ?? undefined });
    }
  });
  store.saveProgress({ guildId: DEMO_GUILD, userId: '700000000000000099', userName: 'Paul', type: 'team', typeName: 'Team-Bewerbung', source: 'DM', answered: 2, total: 4, expiresAt: new Date(Date.now() + 7_200_000).toISOString() });
  store.addBan({ guildId: DEMO_GUILD, userId: '700000000000000042', robloxId: null, name: 'Troll123', types: ['*'], reason: 'Mehrfach Spam-Bewerbungen', expiresAt: null, createdBy: { id: DEMO_USER.id, name: DEMO_USER.name } });
  return service;
}

if (process.argv[1]?.endsWith('demo.js')) {
  const log = { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };
  const store = new Store(null);
  const discord = demoAdapter(log);
  const roblox = { lookup: async (name) => ({ id: '1', name, displayName: name, avatarUrl: null }) };
  const service = seedDemo(store, new ApplicationService({ store, discord, roblox, log }));
  const port = Number(process.env.PORT || 3000);
  createWebServer({ store, service, discord, secret: randomBytes(32).toString('hex'), publicUrl: `http://localhost:${port}`, demoUser: DEMO_USER, log })
    .listen(port, () => console.log(`Demo-Dashboard: http://localhost:${port}  (ohne Discord – Bot-Aktionen erscheinen hier in der Konsole)`));
}
