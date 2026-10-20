import { Prisma } from '@prisma/client';
import { type RadioRoleRules } from '@enrp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, Actor } from '../audit/audit.service';
import { DiscordService } from '../discord/discord.service';
import { DiscordLiveService } from '../discord/discord-live.service';
import { NotifyService } from '../notifications/notify.service';
import { ZelloWorkClient, type ZelloCredentials } from './zello-work.client';
export interface RadioWhitelistConfig {
    roleSync: RadioRoleRules;
    /** Discord-Rolle(n), die Mitglieder mit aktiver Freigabe tragen (leer = Funkrolle aus Einstellungen → Discord). */
    radioRoleIds: string[];
    /** `approveRoleIds`: Discord-Rollen, die das Mitglied zusätzlich bekommt, wenn sein Antrag genehmigt wird (bleiben danach bestehen). */
    requests: {
        enabled: boolean;
        preventDuplicates: boolean;
        notifyChannelId: string | null;
        approveRoleIds: string[];
        panel: RequestPanel;
        form: RequestForm;
    };
    /** Mitglieder per Discord-DM über Änderungen informieren (Antragsentscheidungen immer). */
    notifyMembers: boolean;
}
/** Antrags-Panel in Discord: Nachricht mit Button „Funkfreigabe beantragen“ (öffnet das Formular). */
export interface RequestPanel {
    channelId: string | null;
    title: string;
    text: string;
    buttonLabel: string;
    color: string;
}
export declare const DEFAULT_PANEL: RequestPanel;
/**
 * Antragsformular in Discord (Modal, höchstens 5 Felder). `reason` ist immer dabei und Pflicht; `rank`/`department` landen in
 * eigenen Spalten, alle anderen Felder als Antworten (`answers`).
 */
export interface RequestFormField {
    key: string;
    label: string;
    placeholder: string;
    paragraph: boolean;
    required: boolean;
    maxLength: number;
}
export interface RequestForm {
    title: string;
    fields: RequestFormField[];
}
export declare const DEFAULT_FORM: RequestForm;
/** Formular immer gültig halten: Begründung vorhanden und Pflicht, höchstens 5 Felder, Schlüssel eindeutig. */
export declare function normalizeForm(f: Partial<RequestForm> | undefined): RequestForm;
export declare const DEFAULT_CONFIG: RadioWhitelistConfig;
/** Funkdienste, für die die Anbindung angeboten wird – mit ehrlicher Angabe, was per API möglich ist. */
export declare const RADIO_PROVIDERS: readonly [{
    readonly key: "NONE";
    readonly name: "Kein Funkdienst angebunden";
    readonly apiSupported: false;
    readonly note: "Die Whitelist wird nur im Dashboard und in Discord geführt.";
}, {
    readonly key: "ZELLO_WORK";
    readonly name: "Zello Work (Server-API)";
    readonly apiSupported: true;
    readonly note: "Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.";
    readonly verified: "Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.";
}, {
    readonly key: "ZELLO_APP";
    readonly name: "Zello (kostenlose App, Kanal)";
    readonly apiSupported: false;
    readonly note: "Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.";
}, {
    readonly key: "OTHER_MANUAL";
    readonly name: "Anderer Funkdienst (manuell)";
    readonly apiSupported: false;
    readonly note: "Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.";
}];
export type RadioProvider = (typeof RADIO_PROVIDERS)[number]['key'];
type StatusFilter = 'active' | 'suspended' | 'expired' | 'pending' | 'disabled' | 'revoked' | 'all' | 'open';
export interface GrantInput {
    discordId: string;
    discordName?: string | null;
    rank?: string | null;
    department?: string | null;
    externalName?: string | null;
    reason: string;
    expiresAt?: Date | null;
    status?: 'ACTIVE' | 'PENDING';
}
/**
 * Funk-Whitelist für einen externen Funkdienst – genau ein fest konfigurierter Discord-Server (keine Multi-Server-Logik).
 * Alle Berechtigungsprüfungen laufen im Backend; jede Änderung landet im (unveränderlichen) Audit-Log.
 */
export declare class RadioWhitelistService {
    private readonly prisma;
    private readonly audit;
    private readonly discord;
    private readonly live;
    private readonly notify;
    private readonly log;
    private syncing;
    /** In Tests ersetzbar (gemockter Funkdienst). */
    zelloFactory: (c: ZelloCredentials) => Pick<ZelloWorkClient, 'login' | 'logout' | 'channelExists' | 'addToChannel' | 'removeFromChannel'>;
    constructor(prisma: PrismaService, audit: AuditService, discord: DiscordService, live: DiscordLiveService, notify: NotifyService);
    config(): Promise<RadioWhitelistConfig>;
    /** „Nur über Discord-Rolle“: manuelle Wege (Freischalten, Anträge, Import) sind dann gesperrt. */
    private assertNotRoleOnly;
    private saveConfig;
    updateRoleConfig(actor: Actor, b: {
        roleSync: RadioRoleRules;
        radioRoleIds: string[];
    }): Promise<RadioWhitelistConfig>;
    updateRequestConfig(actor: Actor, b: {
        requests: RadioWhitelistConfig['requests'];
        notifyMembers: boolean;
    }): Promise<RadioWhitelistConfig>;
    /** Antrags-Panel in den eingestellten Kanal setzen bzw. dort aktualisieren (gleiche Nachricht, kein Doppel). */
    postRequestPanel(actor: Actor): Promise<{
        queued: boolean;
    }>;
    /** Meldung eines Antrags für die Leitung: offen mit Buttons Genehmigen/Ablehnen, nach der Entscheidung ohne Buttons. */
    private requestMessage;
    /** Der eine fest konfigurierte Discord-Server: DISCORD_GUILD_ID, sonst Einstellungen → Discord, sonst der einzige gemeldete Server. */
    mainGuildId(): Promise<string | null>;
    private radioRoleIds;
    private where;
    list(f: {
        status?: StatusFilter;
        q?: string;
        page: number;
        pageSize: number;
    }): Promise<{
        items: {
            id: string;
            discordId: string | null;
            discordName: string | null;
            userId: string | null;
            userName: string | null;
            rank: string | null;
            department: string | null;
            externalName: string | null;
            status: string;
            effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
            authorized: boolean;
            source: string;
            reason: string | null;
            expiresAt: Date | null;
            suspendedUntil: Date | null;
            suspendReason: string | null;
            roleRevoked: boolean;
            grantedAt: Date | null;
            grantedByName: string | null;
            archivedAt: Date | null;
            externalStatus: string;
            externalSyncedAt: Date | null;
            externalError: string | null;
            version: number;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    counts(): Promise<{
        openRequests: number;
        manualTodo: number;
    }>;
    get(id: string): Promise<{
        history: {
            actorName: string;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            action: string;
            actorUserId: string | null;
        }[];
        requests: {
            decidedByName: string | null;
            id: string;
            status: string;
            createdAt: Date;
            reason: string;
            guildId: string | null;
            discordId: string;
            discordName: string | null;
            department: string | null;
            rank: string | null;
            decidedAt: Date | null;
            decidedById: string | null;
            decisionReason: string | null;
            answers: Prisma.JsonValue | null;
            grantExpiresAt: Date | null;
            grantId: string | null;
        }[];
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private userNames;
    private views;
    /** Vorbelegung aus vorhandenen Daten (Dashboard-Konto, Leitstellen-Teamdaten mit Zello-Namen, Discord-Livedaten). */
    private prefill;
    /** Neue Freigabe oder Wiederherstellung einer archivierten (gleiche Discord-ID = gleicher Eintrag, Historie bleibt). */
    private upsertGrant;
    private summary;
    create(actor: Actor, b: GrantInput): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /**
     * Zustandswechsel mit optimistischer Sperre (version). `from` = erlaubte tatsächliche Ausgangsstatus.
     */
    private transition;
    update(actor: Actor, id: string, b: {
        version: number;
        discordName?: string | null;
        rank?: string | null;
        department?: string | null;
        externalName?: string | null;
        reason?: string | null;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    activate(actor: Actor, id: string, b: {
        reason?: string | null;
        expiresAt?: Date | null;
        version?: number;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    deactivate(actor: Actor, id: string, b: {
        reason: string;
        version?: number;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    extend(actor: Actor, id: string, b: {
        expiresAt: Date | null;
        reason?: string | null;
        version?: number;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    suspend(actor: Actor, id: string, b: {
        reason: string;
        until?: Date | null;
        version?: number;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    unsuspend(actor: Actor, id: string, b: {
        reason?: string | null;
        version?: number;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Freigabe entziehen = archivieren (nie löschen). */
    revoke(actor: Actor, id: string, b: {
        reason: string;
        version?: number;
    }, action?: string): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Archivierte/entzogene Freigabe erneut erteilen (gleicher Eintrag, Historie bleibt). */
    restore(actor: Actor, id: string, b: {
        reason: string;
        expiresAt?: Date | null;
    }): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Discord-ID bei übernommenen Alt-Einträgen nachtragen. */
    setDiscordId(actor: Actor, id: string, discordId: string): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    /** Manueller Funkdienst: Änderung im Funkdienst erledigt (z. B. in der Zello-App als vertrauenswürdig markiert). */
    markExternalDone(actor: Actor, id: string): Promise<{
        id: string;
        discordId: string | null;
        discordName: string | null;
        userId: string | null;
        userName: string | null;
        rank: string | null;
        department: string | null;
        externalName: string | null;
        status: string;
        effectiveStatus: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED";
        authorized: boolean;
        source: string;
        reason: string | null;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        suspendReason: string | null;
        roleRevoked: boolean;
        grantedAt: Date | null;
        grantedByName: string | null;
        archivedAt: Date | null;
        externalStatus: string;
        externalSyncedAt: Date | null;
        externalError: string | null;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    private day;
    /**
     * Folgen einer Änderung (nach dem Commit, Fehler stören den Fachprozess nicht): Discord-Funkrolle, Funkdienst, DM an das Mitglied.
     */
    private afterChange;
    /** Abgelaufene Freigaben und abgelaufene Sperren speichern (jede Minute; mehrere Instanzen sicher über version). */
    tick(now?: Date): Promise<{
        expired: number;
        unsuspended: number;
    }>;
    private requestViews;
    listRequests(f: {
        status: 'PENDING' | 'DONE' | 'ALL';
        q?: string;
        page: number;
        pageSize: number;
    }): Promise<{
        items: {
            decidedByName: string | null;
            id: string;
            status: string;
            createdAt: Date;
            reason: string;
            guildId: string | null;
            discordId: string;
            discordName: string | null;
            department: string | null;
            rank: string | null;
            decidedAt: Date | null;
            decidedById: string | null;
            decisionReason: string | null;
            answers: Prisma.JsonValue | null;
            grantExpiresAt: Date | null;
            grantId: string | null;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    /** Antrag über Discord (Bot-Dienst; Identität = Discord-ID der Interaktion). */
    createRequest(b: {
        guildId: string | null;
        discordId: string;
        discordName?: string | null;
        rank?: string | null;
        department?: string | null;
        reason: string;
        answers?: Record<string, string>;
    }): Promise<{
        id: string;
        status: string;
        createdAt: Date;
    }>;
    decide(actor: Actor, id: string, b: {
        decision: 'APPROVE' | 'REJECT';
        reason?: string | null;
        expiresAt?: Date | null;
    }): Promise<{
        decidedByName: string | null;
        id: string;
        status: string;
        createdAt: Date;
        reason: string;
        guildId: string | null;
        discordId: string;
        discordName: string | null;
        department: string | null;
        rank: string | null;
        decidedAt: Date | null;
        decidedById: string | null;
        decisionReason: string | null;
        answers: Prisma.JsonValue | null;
        grantExpiresAt: Date | null;
        grantId: string | null;
    }>;
    /** Status für das Mitglied selbst (Bot: `/funkantrag status`). */
    memberStatus(discordId: string): Promise<{
        status: "PENDING" | "ACTIVE" | "DISABLED" | "EXPIRED" | "SUSPENDED" | "REVOKED" | null;
        authorized: boolean;
        expiresAt: Date | null;
        suspendedUntil: Date | null;
        pendingSince: Date | null;
        requestsEnabled: boolean;
        roleOnly: boolean;
        form: RequestForm;
    }>;
    syncTargets(): Promise<{
        enabled: boolean;
        guildId: string | null;
        roleIds: string[];
        discordIds: string[];
    }>;
    requestRoleSync(actor: Actor): Promise<{
        queued: boolean;
    }>;
    roleSyncStatus(): Promise<Record<string, unknown>>;
    /**
     * Rollenstand von Mitgliedern (vom Bot gemeldet) anwenden. Die Entscheidung trifft allein der Server anhand der Regeln.
     * `roleIds: null` = nicht (mehr) auf dem Server.
     */
    applyRoleSnapshot(guildId: string, members: {
        discordId: string;
        name?: string | null;
        roleIds: string[] | null;
    }[], full?: boolean): Promise<{
        enabled: boolean;
        checked: number;
        changed: number;
        failed: number;
    }>;
    private applyMember;
    private integrationRow;
    integration(): Promise<{
        provider: string;
        displayName: string;
        network: string | null;
        channel: string | null;
        endpoint: string | null;
        adminUsername: string | null;
        hasPassword: boolean;
        hasApiKey: boolean;
        autoSync: boolean;
        status: string;
        apiSupported: boolean;
        lastTestAt: Date | null;
        lastSuccessAt: Date | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string | null;
        lastError: string | null;
        version: number;
        providers: readonly [{
            readonly key: "NONE";
            readonly name: "Kein Funkdienst angebunden";
            readonly apiSupported: false;
            readonly note: "Die Whitelist wird nur im Dashboard und in Discord geführt.";
        }, {
            readonly key: "ZELLO_WORK";
            readonly name: "Zello Work (Server-API)";
            readonly apiSupported: true;
            readonly note: "Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.";
            readonly verified: "Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.";
        }, {
            readonly key: "ZELLO_APP";
            readonly name: "Zello (kostenlose App, Kanal)";
            readonly apiSupported: false;
            readonly note: "Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.";
        }, {
            readonly key: "OTHER_MANUAL";
            readonly name: "Anderer Funkdienst (manuell)";
            readonly apiSupported: false;
            readonly note: "Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.";
        }];
    }>;
    updateIntegration(actor: Actor, b: {
        provider: RadioProvider;
        displayName: string;
        network?: string | null;
        channel?: string | null;
        adminUsername?: string | null;
        password?: string;
        apiKey?: string;
        clearCredentials?: boolean;
        autoSync: boolean;
        version: number;
    }): Promise<{
        provider: string;
        displayName: string;
        network: string | null;
        channel: string | null;
        endpoint: string | null;
        adminUsername: string | null;
        hasPassword: boolean;
        hasApiKey: boolean;
        autoSync: boolean;
        status: string;
        apiSupported: boolean;
        lastTestAt: Date | null;
        lastSuccessAt: Date | null;
        lastSyncAt: Date | null;
        lastSyncStatus: string | null;
        lastError: string | null;
        version: number;
        providers: readonly [{
            readonly key: "NONE";
            readonly name: "Kein Funkdienst angebunden";
            readonly apiSupported: false;
            readonly note: "Die Whitelist wird nur im Dashboard und in Discord geführt.";
        }, {
            readonly key: "ZELLO_WORK";
            readonly name: "Zello Work (Server-API)";
            readonly apiSupported: true;
            readonly note: "Offizielle Server-API (zellowork.com/api, Version 1.1.0). Verwendet: Anmeldung (gettoken/auth mit API-Schlüssel), Kanal prüfen, Benutzer zum Kanal hinzufügen und aus dem Kanal entfernen. Die Zello-Benutzer müssen im Zello-Work-Netzwerk bereits existieren – angelegt oder gelöscht werden keine Konten.";
            readonly verified: "Endpunkte gegen die offizielle Dokumentation geprüft (16.10.2026). Nicht gegen ein echtes Zello-Work-Netzwerk getestet.";
        }, {
            readonly key: "ZELLO_APP";
            readonly name: "Zello (kostenlose App, Kanal)";
            readonly apiSupported: false;
            readonly note: "Für Kanäle der kostenlosen Zello-App gibt es keine offizielle API zur Mitgliederverwaltung. Vertrauenswürdige Mitglieder („Trusted“) setzen Moderatoren in der App. Automatische Synchronisierung ist nicht verfügbar – nutze die Liste „Im Funkdienst zu erledigen“ und den CSV-Export.";
        }, {
            readonly key: "OTHER_MANUAL";
            readonly name: "Anderer Funkdienst (manuell)";
            readonly apiSupported: false;
            readonly note: "Keine geprüfte API. Verwaltung manuell über die Liste „Im Funkdienst zu erledigen“ sowie CSV-Export/-Import.";
        }];
    }>;
    private credentials;
    testConnection(actor: Actor): Promise<{
        ok: boolean;
        message: string;
    }>;
    /**
     * Abgleich mit Zello Work: freigegebene Mitglieder (mit Zello-Benutzernamen) in den Kanal, alle anderen hinaus.
     * `ids` = nur diese Einträge. Läuft nie doppelt parallel.
     */
    runSync(actor: Actor | null, ids?: string[]): Promise<{
        ok: boolean;
        message: string;
        added: number;
        removed: number;
        failed: number;
    }>;
    exportCsv(status: StatusFilter): Promise<string>;
    /**
     * CSV-Import (dokumentiert in docs/radio-whitelist.md): neue Discord-IDs werden als aktive manuelle Freigabe angelegt,
     * vorhandene nur um Name/Zello-Name/Dienstgrad/Abteilung ergänzt – Status werden NIE per Import geändert, nichts wird gelöscht.
     */
    importCsv(actor: Actor, text: string, dryRun: boolean): Promise<{
        created: number;
        updated: number;
        unchanged: number;
        errors: {
            line: number;
            message: string;
        }[];
        dryRun: boolean;
    }>;
    logs(f: {
        page: number;
        pageSize: number;
        q?: string;
    }): Promise<{
        items: {
            actorName: string;
            result: string;
            id: string;
            createdAt: Date;
            reason: string | null;
            entityId: string | null;
            entityType: string | null;
            action: string;
            actorUserId: string | null;
            before: Prisma.JsonValue;
            after: Prisma.JsonValue;
        }[];
        total: number;
        page: number;
        pageSize: number;
    }>;
    private resolveTarget;
    private findByTarget;
    legacyList(): Promise<{
        id: string;
        userId: string | null;
        discordId: string | null;
        displayName: string;
        callsign: string | null;
        rank: string | null;
        since: Date;
    }[]>;
    legacyCheck(t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        whitelisted: boolean;
        displayName: string;
    }>;
    legacyAdd(actor: Actor, t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        userId: string | null;
        discordId: string;
        displayName: string;
        whitelisted: boolean;
    }>;
    legacyRemove(actor: Actor, t: {
        userId?: string;
        discordId?: string;
    }): Promise<{
        userId: string | null;
        discordId: string | null;
        displayName: string;
        whitelisted: boolean;
    }>;
}
export {};
