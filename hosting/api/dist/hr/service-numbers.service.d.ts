import { OnModuleInit } from '@nestjs/common';
import { type DnSettings, type DnStatus, type RangeInput } from '@enrp/shared';
import { PermissionService } from '../authz/permission.service';
import { DiscordAccessService } from '../authz/discord-access.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import type { Actor } from '../audit/audit.service';
import { type AcceptedApplication } from '../common/hire-events';
import { HrCoreService } from './hr-core.service';
import { HrPeopleService } from './hr-people.service';
/**
 * Dienstnummern: Nummernkreise, atomare Vergabe (Unique-Constraints + Wiederholung – nie doppelt),
 * manuelle Vergabe/Änderung/Freigabe/Sperre, Historie und die Automatik nach angenommener Bewerbung.
 */
export declare class ServiceNumbersService implements OnModuleInit {
    private readonly core;
    private readonly people;
    private readonly perms;
    private readonly discord;
    private readonly live;
    constructor(core: HrCoreService, people: HrPeopleService, perms: PermissionService, discord: DiscordAccessService, live: DiscordLiveService);
    private get prisma();
    onModuleInit(): void;
    settings(): Promise<DnSettings>;
    saveSettings(actor: Actor, s: DnSettings): Promise<{
        dm: {
            title: string;
            color: string;
            template: string;
            enabled: boolean;
        };
        timing: "MANUAL" | "ACCEPT" | "COMPLETE";
        mappings: {
            roleIds: string[];
            kind: string;
            department: string | null;
            rangeId: string | null;
            rankId: string | null;
            createProfile: boolean;
        }[];
        nickname: {
            enabled: boolean;
            format: string;
        };
        rankRoles: boolean;
        departmentRoles: boolean;
        changeNeedsApprover: boolean;
    }>;
    ranges(): Promise<{
        total: number;
        active: number;
        reserved: number;
        blocked: number;
        former: number;
        free: number;
        first: string;
        last: string;
        isActive: boolean;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        position: number;
        department: string | null;
        prefix: string;
        suffix: string;
        start: number;
        end: number;
        padLength: number;
        order: string;
        autoAssign: boolean;
        manual: boolean;
        reuse: boolean;
        releaseAs: string;
    }[]>;
    saveRange(actor: Actor, d: RangeInput, id?: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        active: boolean;
        name: string;
        position: number;
        department: string | null;
        prefix: string;
        suffix: string;
        start: number;
        end: number;
        padLength: number;
        order: string;
        autoAssign: boolean;
        manual: boolean;
        reuse: boolean;
        releaseAs: string;
    }>;
    deleteRange(actor: Actor, id: string): Promise<void>;
    /** Nummern mit Status/Person. „Frei“ enthält auch nie benutzte Nummern (bis `limit`). */
    list(f: {
        status?: DnStatus;
        rangeId?: string;
        q?: string;
        department?: string;
        rank?: string;
        limit?: number;
    }): Promise<{
        id: string;
        display: string;
        value: number;
        status: string;
        rangeId: string;
        range: string;
        note: string | null;
        assignedAt: Date | null;
        reservedAt: Date | null;
        userId: string | null;
        name: string | null;
        roblox: string | null;
        discordId: string | null;
        personnelId: string | null;
        rank: string | null;
        department: string | null;
    }[]>;
    history(f: {
        display?: string;
        personnelId?: string;
        userId?: string;
    }): Promise<{
        name: string | null;
        actor: string;
        approver: string | null;
        id: string;
        createdAt: Date;
        reason: string | null;
        userId: string | null;
        personnelId: string | null;
        action: string;
        actorId: string | null;
        display: string;
        oldDisplay: string | null;
        approverId: string | null;
    }[]>;
    /** Nummer zu einer Schreibweise finden (Kreis + Wert). */
    private parse;
    /** Nächste freie Nummer im Kreis ermitteln (ohne zu sperren – gesperrt wird über die Unique-Constraints beim Schreiben). */
    private candidate;
    /**
     * Nummer atomar vergeben: reservieren → zuweisen → Personalakte → Historie, alles in einer Transaktion.
     * Kollidieren zwei Vergaben, schlägt die zweite am Unique-Index fehl und wird mit der nächsten Nummer wiederholt.
     */
    allocate(actor: Actor, o: {
        userId: string;
        personnelId: string | null;
        rangeId?: string;
        display?: string;
        reason?: string;
        manual: boolean;
        approverId?: string | null;
        replaceOld?: boolean;
    }): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            position: number;
            department: string | null;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    /** Manuelle Vergabe (dienstnummer.assign) an eine Personalakte. */
    /**
     * Discord-Mitglieder für die Personenauswahl: Teamliste des Bots (Teilstring) + Discord-Suche über alle Server-Mitglieder
     * (Name beginnt mit …). `personnelId` gesetzt = es gibt schon eine Personalakte.
     */
    discordMembers(q: string): Promise<{
        personnelId: string | null;
        serviceNumber: string | null;
        id: string;
        username: string;
        displayName: string;
        avatar: string | null;
    }[]>;
    assignManual(actor: Actor, d: {
        personnelId?: string;
        discordId?: string;
        name?: string;
        display?: string;
        rangeId?: string;
        reason?: string;
    }): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            position: number;
            department: string | null;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    /** Personalakte zu einem Discord-Mitglied – vorhandene oder neu angelegt (Benutzer wird bei Bedarf mit angelegt). */
    private personnelForDiscord;
    /** Nummer ändern (dienstnummer.edit); die alte wird je nach Kreis frei, ehemalig oder gesperrt. */
    change(actor: Actor, d: {
        personnelId: string;
        display?: string;
        rangeId?: string;
        reason: string;
        approverId?: string | null;
    }): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            position: number;
            department: string | null;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
    /** Nummer freigeben / als ehemalig markieren / sperren / entsperren / reservieren. */
    setStatus(actor: Actor, display: string, to: 'FREE' | 'FORMER' | 'BLOCKED' | 'UNBLOCK' | 'RESERVED', reason?: string, userId?: string): Promise<{
        display: string;
        status: "FREE" | "RESERVED" | "BLOCKED" | "FORMER";
    }>;
    /** Discord nach Vergabe: Nickname, DM (je nach Einstellung). */
    private afterAssign;
    /**
     * Bewerbung angenommen → Benutzer/Personalakte anlegen → Rang/Abteilung → (je nach Zeitpunkt) Dienstnummer atomar vergeben
     * → Discord-Rollen, Nickname, DM → Audit. Fehlt eine Nummer, bleibt die Einstellung als „⚠️ Dienstnummer ausstehend“ stehen.
     */
    /** Zuordnung für eine Bewerbungsart. Polizei-Bewerbungen bekommen immer eine Personalakte, auch ohne eigene Zuordnung. */
    private mappingFor;
    /**
     * Bereits angenommene Polizei-Bewerbungen ohne Personalakte nachträglich übernehmen (z. B. von vor der Automatik).
     * Legt nur die Akte an (Rang/Abteilung laut Zuordnung) – keine Dienstnummer, Rollen oder DMs.
     */
    profilesFromApplications(actor: Actor): Promise<{
        created: number;
        skipped: number;
    }>;
    onApplicationAccepted(actor: Actor, a: AcceptedApplication): Promise<void>;
    /** Ausstehende Einstellungen (ohne Nummer). */
    pending(): Promise<{
        name: string;
        personnelId: string | null;
        id: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        reason: string;
        userId: string;
        discordId: string | null;
        kind: string;
        applicationId: string;
    }[]>;
    /** Ausstehende Einstellung bestätigen/abschließen: Nummer aus dem Kreis der Zuordnung vergeben. */
    confirmPending(actor: Actor, id: string, display?: string): Promise<{
        display: string;
        old: string | null;
        range: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            active: boolean;
            name: string;
            position: number;
            department: string | null;
            prefix: string;
            suffix: string;
            start: number;
            end: number;
            padLength: number;
            order: string;
            autoAssign: boolean;
            manual: boolean;
            reuse: boolean;
            releaseAs: string;
        };
    }>;
}
