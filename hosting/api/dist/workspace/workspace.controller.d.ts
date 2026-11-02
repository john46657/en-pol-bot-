import type { Actor } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../authz/permission.service';
import { ShiftPlanService } from '../shiftplan/shiftplan.service';
import { CalendarService } from '../calendar/calendar.service';
import { DocumentsService } from '../documents/documents.service';
/**
 * Gemeinsame Sicht für MDT und Leitstelle auf die Verwaltungsdaten (keine eigenen Daten, nur Zusammenführung).
 * Jeder Teil erscheint nur mit dem passenden Recht; Abwesenheitsgründe erscheinen nie in der Leitstelle.
 */
export declare class WorkspaceController {
    private readonly prisma;
    private readonly perms;
    private readonly shifts;
    private readonly cal;
    private readonly docs;
    constructor(prisma: PrismaService, perms: PermissionService, shifts: ShiftPlanService, cal: CalendarService, docs: DocumentsService);
    private feed;
    /** MDT „Mein Dienst“: Schicht, Abteilung/Rang/Einheit, eigene Abwesenheit, Termine, Benachrichtigungen, Dokumente. */
    mdt(a: Actor): Promise<{
        profile: {
            rank: string | null;
            department: string | null;
            callsign: string | null;
            serviceNumber: string | null;
            office: string | null;
        };
        duty: {
            status: string;
            since: Date;
            unit: string | null;
        } | null;
        shift: {
            current: {
                id: string;
                name: string;
                startsAt: Date;
                endsAt: Date;
                timezone: string;
                department: string | null;
                description: string | null;
                unit: string | null;
                leaderId: string | null;
                leaderName: string | null;
                minStaff: number;
                maxStaff: number | null;
                status: string;
                statusLabel: string;
                cancelReason: string | null;
                seriesId: string | null;
                version: number;
                publishedAt: Date | null;
                coverage: {
                    assigned: number;
                    min: number;
                    max: number | null;
                    state: "UNDER" | "OK" | "FULL";
                    missing: number;
                    free: number | null;
                };
                assignees: {
                    userId: string;
                    name: string;
                    source: string;
                    absent: boolean;
                }[];
                mine: boolean;
            } | null;
            next: {
                id: string;
                name: string;
                startsAt: Date;
                endsAt: Date;
                timezone: string;
                department: string | null;
                description: string | null;
                unit: string | null;
                leaderId: string | null;
                leaderName: string | null;
                minStaff: number;
                maxStaff: number | null;
                status: string;
                statusLabel: string;
                cancelReason: string | null;
                seriesId: string | null;
                version: number;
                publishedAt: Date | null;
                coverage: {
                    assigned: number;
                    min: number;
                    max: number | null;
                    state: "UNDER" | "OK" | "FULL";
                    missing: number;
                    free: number | null;
                };
                assignees: {
                    userId: string;
                    name: string;
                    source: string;
                    absent: boolean;
                }[];
                mine: boolean;
            } | null;
            upcoming: {
                id: string;
                name: string;
                startsAt: Date;
                endsAt: Date;
                timezone: string;
                department: string | null;
                description: string | null;
                unit: string | null;
                leaderId: string | null;
                leaderName: string | null;
                minStaff: number;
                maxStaff: number | null;
                status: string;
                statusLabel: string;
                cancelReason: string | null;
                seriesId: string | null;
                version: number;
                publishedAt: Date | null;
                coverage: {
                    assigned: number;
                    min: number;
                    max: number | null;
                    state: "UNDER" | "OK" | "FULL";
                    missing: number;
                    free: number | null;
                };
                assignees: {
                    userId: string;
                    name: string;
                    source: string;
                    absent: boolean;
                }[];
                mine: boolean;
            }[];
        } | null;
        leave: {
            active: boolean;
            number: string;
            startsAt: Date;
            endsAt: Date;
        } | null;
        events: unknown[] | null;
        notifications: {
            link: string | null;
            id: string;
            createdAt: Date;
            title: string;
            event: string | null;
            important: boolean;
        }[];
        documents: {
            id: string;
            title: string;
            categoryLabel: string;
            currentVersion: number;
        }[] | null;
    }>;
    /** Leitstelle: Schichtbesetzung (geplant vs. im Dienst), Abwesende jetzt (nur Namen), dienstliche Termine heute, Systemmeldungen. */
    dispatch(a: Actor): Promise<{
        staffing: {
            at: Date;
            shifts: {
                id: string;
                name: string;
                startsAt: Date;
                endsAt: Date;
                department: string | null;
                unit: string | null;
                running: boolean;
                leaderName: string | null;
                coverage: {
                    assigned: number;
                    min: number;
                    max: number | null;
                    state: "UNDER" | "OK" | "FULL";
                    missing: number;
                    free: number | null;
                };
                presentCount: number;
                plannedPresent: {
                    userId: string;
                    name: string;
                    status: string | null;
                    callsign: string | null;
                }[];
                plannedMissing: {
                    userId: string;
                    name: string;
                    status: string | null;
                    callsign: string | null;
                }[];
                plannedAbsent: {
                    userId: string;
                    name: string;
                }[];
            }[];
            unplannedOnDuty: {
                userId: string;
                name: string;
                status: string | null;
                callsign: string | null;
            }[];
            totals: {
                onDuty: number;
                plannedNow: number;
                absentNow: number;
            };
        } | null;
        absentNow: {
            userId: string;
            name: string;
        }[] | null;
        events: unknown[] | null;
        notifications: {
            link: string | null;
            id: string;
            createdAt: Date;
            title: string;
            event: string | null;
            important: boolean;
        }[];
    }>;
}
export declare class WorkspaceModule {
}
