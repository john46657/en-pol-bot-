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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForecastService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@enrp/shared");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../audit/audit.service");
const quality_service_1 = require("../quality/quality.service");
const DAY = 86_400_000;
const round1 = (n) => Math.round(n * 10) / 10;
/**
 * Personalbedarfs- und Aktivitätsprognose für Führungskräfte. Rechnet ausschließlich mit gespeicherten Daten (Dienstzeiten,
 * Personalakten, Einsatzstatistik, Ausbildung/Prüfungen, Berichte) und kennzeichnet jede Prognose als Schätzung mit Datenbasis,
 * Zeitraum und Aussagekraft. Löst nie etwas aus (keine Sanktionen, Herabstufungen oder Beförderungen).
 */
let ForecastService = class ForecastService {
    prisma;
    audit;
    quality;
    constructor(prisma, audit, quality) {
        this.prisma = prisma;
        this.audit = audit;
        this.quality = quality;
    }
    async forecast(actor, q, now = new Date()) {
        // ganze Wochen (Montag 00:00 Europe/Berlin) – die laufende Woche zählt nicht mit, sie ist unvollständig
        const to = (0, shared_1.weekStartOf)(now);
        const from = new Date(to.getTime() - q.weeks * 7 * DAY);
        const weekStarts = Array.from({ length: q.weeks }, (_, i) => (0, shared_1.weekStartOf)(new Date(from.getTime() + i * 7 * DAY + 12 * 3_600_000)));
        const idx = (d) => weekStarts.findIndex((w, i) => d >= w && d < (weekStarts[i + 1] ?? to));
        const labels = weekStarts.map((w) => (0, shared_1.weekKey)(w));
        const personnel = await this.prisma.personnel.findMany({ select: { userId: true, team: true, employmentStatus: true, joinDate: true } });
        const deptOf = new Map(personnel.map((p) => [p.userId, p.team ?? 'ohne Abteilung']));
        const inDept = (userId) => !q.department || deptOf.get(userId) === q.department;
        // ---- Dienstzeiten ----
        const sessions = (await this.prisma.dutySession.findMany({
            where: { status: { in: [...shared_1.WEEK_COUNTED_STATUSES] }, startedAt: { lt: to }, OR: [{ endedAt: null }, { endedAt: { gt: from } }] },
            select: { userId: true, startedAt: true, endedAt: true },
        })).filter((s) => inDept(s.userId));
        const spans = sessions.map((s) => ({ start: s.startedAt, end: s.endedAt ?? (now < to ? now : to), userId: s.userId }));
        const heat = (0, shared_1.staffingHeatmap)(spans, from, to);
        const hoursPerWeek = labels.map(() => 0);
        const officersPerWeek = labels.map(() => new Set());
        const byDept = new Map();
        for (const s of spans) {
            for (let i = 0; i < weekStarts.length; i++) {
                const a = Math.max(s.start.getTime(), weekStarts[i].getTime()), b = Math.min(s.end.getTime(), (weekStarts[i + 1] ?? to).getTime());
                if (b <= a)
                    continue;
                const h = (b - a) / 3_600_000;
                hoursPerWeek[i] += h;
                officersPerWeek[i].add(s.userId);
                const d = deptOf.get(s.userId) ?? 'ohne Personalakte';
                const row = byDept.get(d) ?? labels.map(() => 0);
                row[i] += h;
                byDept.set(d, row);
            }
        }
        // ---- Einsätze (dauerhafte Statistik + noch vorhandene Einsätze, ohne Doppelzählung) ----
        const [stats, liveIncidents] = await Promise.all([
            this.prisma.cadIncidentStat.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { incidentId: true, createdAt: true } }),
            this.prisma.incident.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { id: true, createdAt: true } }),
        ]);
        const incidentAt = new Map([...liveIncidents.map((i) => [i.id, i.createdAt]), ...stats.map((s) => [s.incidentId, s.createdAt])]);
        const incidentsPerWeek = labels.map(() => 0);
        for (const at of incidentAt.values()) {
            const i = idx(at);
            if (i >= 0)
                incidentsPerWeek[i]++;
        }
        const demand = (0, shared_1.staffingHeatmap)([...incidentAt.values()].map((at) => ({ start: at, end: new Date(at.getTime() + 60_000) })), from, to);
        const oldestStat = await this.prisma.cadIncidentStat.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
        // ---- Berichte und Unvollständigkeit (aktueller Stand der Qualitätsprüfung) ----
        const reports = await this.prisma.report.findMany({ where: { createdAt: { gte: from, lt: to } }, select: { id: true, createdAt: true, authorId: true }, take: 3000 });
        const relevant = reports.filter((r) => inDept(r.authorId));
        const checked = await this.quality.incompleteReports(relevant.map((r) => r.id));
        const incomplete = new Set(checked.filter((c) => c.errors.length).map((c) => c.id));
        const reportsPerWeek = labels.map(() => 0), incompletePerWeek = labels.map(() => 0);
        for (const r of relevant) {
            const i = idx(r.createdAt);
            if (i < 0)
                continue;
            reportsPerWeek[i]++;
            if (incomplete.has(r.id))
                incompletePerWeek[i]++;
        }
        // ---- Ausbildung und Prüfungen (offen, aktueller Stand) ----
        const [trainingsOpen, examsToGrade, upcomingSessions] = await Promise.all([
            this.prisma.hrTrainingProgress.count({ where: { status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } }),
            this.prisma.hrExamAttempt.count({ where: { status: 'SUBMITTED' } }),
            this.prisma.hrTrainingSession.count({ where: { startsAt: { gte: now } } }),
        ]);
        // ---- Schätzungen ----
        const weeksWithDuty = hoursPerWeek.filter((h) => h > 0).length;
        const dutyConf = (0, shared_1.confidenceFor)(weeksWithDuty, sessions.length);
        const incConf = (0, shared_1.confidenceFor)(incidentsPerWeek.filter((n) => n > 0).length, incidentAt.size);
        const nextIncidents = (0, shared_1.estimateNext)(incidentsPerWeek, 2);
        const nextHours = (0, shared_1.estimateNext)(hoursPerWeek.map(round1), 2);
        const totalHours = hoursPerWeek.reduce((a, b) => a + b, 0), totalIncidents = incidentsPerWeek.reduce((a, b) => a + b, 0);
        // Einsätze je Dienststunde im Zeitraum → benötigte Dienststunden für die geschätzte Einsatzzahl (gleiches Verhältnis wie bisher)
        const perHour = totalHours > 0 ? totalIncidents / totalHours : null;
        const neededHours = nextIncidents && perHour ? round1(nextIncidents[0].value / perHour) : null;
        const low = (0, shared_1.lowStaffingWindows)(heat.avg, q.minStaff);
        // Bedarf ohne Besetzung: Stunden mit Einsätzen im Mittel, aber unter der Mindestbesetzung
        const hotspots = heat.avg.flatMap((row, d) => row.map((v, h) => ({ weekday: d, hour: h, staff: v, incidents: demand.avg[d][h] ?? 0 })))
            .filter((x) => x.staff !== null && x.staff < q.minStaff && (x.incidents ?? 0) > 0)
            .sort((a, b) => (b.incidents ?? 0) - (a.incidents ?? 0)).slice(0, 10);
        const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
        const suggestions = [
            ...hotspots.slice(0, 5).map((x) => `${DAYS[x.weekday]} ${String(x.hour).padStart(2, '0')}–${String(x.hour + 1).padStart(2, '0')} Uhr: im Mittel ${x.incidents} Einsätze bei ${x.staff} Beamten im Dienst – Schicht verstärken prüfen.`),
            ...(neededHours !== null && nextHours ? [nextHours[0].value < neededHours
                    ? `Für die geschätzten ${nextIncidents[0].value} Einsätze der nächsten Woche wären bei bisherigem Verhältnis ca. ${neededHours} Dienststunden nötig; geschätzt werden ${nextHours[0].value} h – Mehrbedarf ca. ${round1(neededHours - nextHours[0].value)} h.`
                    : `Geschätzte Dienststunden (${nextHours[0].value} h) decken den geschätzten Bedarf (${neededHours} h) bei bisherigem Verhältnis.`] : []),
            ...(trainingsOpen + examsToGrade > 0 ? [`${trainingsOpen} offene Ausbildungen und ${examsToGrade} unbewertete Prüfungen binden Ausbilderzeit – bei der Schichtplanung berücksichtigen.`] : []),
        ];
        const missing = [];
        if (!sessions.length)
            missing.push('Keine Dienstzeiten im Zeitraum erfasst.');
        if (!incidentAt.size)
            missing.push('Keine Einsätze im Zeitraum erfasst.');
        if (oldestStat && oldestStat.createdAt > from)
            missing.push(`Einsatzstatistik reicht nur bis ${oldestStat.createdAt.toLocaleDateString('de-DE')} zurück (Einsätze werden einen Tag nach Abschluss gelöscht, Kennzahlen bleiben).`);
        if (!oldestStat && liveIncidents.length)
            missing.push('Ältere Einsätze sind gelöscht und nicht in der Statistik – frühere Wochen können zu niedrig sein.');
        if (q.department)
            missing.push(`Gefiltert auf Abteilung „${q.department}“ – Einsätze sind nicht abteilungsbezogen und werden insgesamt gezählt.`);
        await this.audit.record(actor, { action: 'forecast.read', module: 'personnel', entityType: 'Forecast', after: { weeks: q.weeks, department: q.department ?? null } });
        return {
            generatedAt: now.toISOString(), estimateNotice: 'Alle Prognosen sind Schätzungen auf Basis der gespeicherten Daten. Sie lösen keine Maßnahmen aus.',
            basis: { from: from.toISOString(), to: to.toISOString(), weeks: q.weeks, timezone: shared_1.WEEK_TIMEZONE, dutySessions: sessions.length, incidents: incidentAt.size, reports: relevant.length, personnel: personnel.length, missing },
            confidence: { duty: { ...dutyConf, label: shared_1.CONFIDENCE_LABEL[dutyConf.level] }, incidents: { ...incConf, label: shared_1.CONFIDENCE_LABEL[incConf.level] } },
            weekly: labels.map((w, i) => ({ week: w, dutyHours: round1(hoursPerWeek[i]), officers: officersPerWeek[i].size, incidents: incidentsPerWeek[i], reports: reportsPerWeek[i], incompleteReports: incompletePerWeek[i] })),
            heatmap: heat.avg, demandHeatmap: demand.avg,
            byDepartment: [...byDept].map(([department, hours]) => ({ department, hours: hours.map(round1), total: round1(hours.reduce((a, b) => a + b, 0)), officers: personnel.filter((p) => (p.team ?? 'ohne Abteilung') === department && !['RESIGNED', 'TERMINATED', 'INACTIVE'].includes(p.employmentStatus)).length })).sort((a, b) => b.total - a.total),
            lowStaffing: low, hotspots,
            estimates: { nextWeeksIncidents: nextIncidents, nextWeeksDutyHours: nextHours, incidentsPerDutyHour: perHour !== null ? Math.round(perHour * 1000) / 1000 : null, neededDutyHoursNextWeek: neededHours },
            anomalies: {
                incidents: (0, shared_1.anomalies)(labels.map((w, i) => ({ label: w, value: incidentsPerWeek[i] }))),
                dutyHours: (0, shared_1.anomalies)(labels.map((w, i) => ({ label: w, value: round1(hoursPerWeek[i]) }))),
                incompleteReports: (0, shared_1.anomalies)(labels.map((w, i) => ({ label: w, value: incompletePerWeek[i] }))),
            },
            openTraining: { trainingsOpen, examsToGrade, upcomingSessions },
            suggestions,
            departments: [...new Set(personnel.map((p) => p.team).filter((x) => !!x))].sort(),
        };
    }
};
exports.ForecastService = ForecastService;
exports.ForecastService = ForecastService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, audit_service_1.AuditService, quality_service_1.QualityService])
], ForecastService);
//# sourceMappingURL=forecast.service.js.map