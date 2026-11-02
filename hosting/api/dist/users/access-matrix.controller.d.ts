import { type AccessArea, type AccessLevel } from '@enrp/shared';
import type { Actor } from '../audit/audit.service';
import { AccessMatrixService } from './access-matrix.service';
/** Zentraler Berechtigungseditor: Matrix Rolle × Bereich × Zugriffsstufe. */
export declare class AccessMatrixController {
    private readonly s;
    constructor(s: AccessMatrixService);
    matrix(): Promise<{
        areas: {
            key: "teamchance" | "ticket" | "personnel" | "vehicles" | "tickets" | "team" | "qualifications" | "modules" | "settings" | "notifications" | "incidents" | "documents" | "wanted" | "roles" | "users" | "training" | "exam" | "dispatch" | "applications" | "sek" | "cad" | "leave" | "qualification" | "dashboard" | "persons" | "fleet" | "reports" | "complaints" | "promotion" | "transfer" | "warning" | "awards" | "dienstnummer" | "academy" | "radiowhitelist" | "radio" | "dutyreports" | "communication" | "analytics" | "shiftplan" | "calendar" | "meetings" | "announce" | "audit" | "studio" | "servers" | "org" | "backup" | "help" | "messagebuilder";
            actions: readonly ["view", "manage"] | readonly ["view", "create", "claim", "close", "reopen", "delete", "add_user", "remove_user", "change_status", "change_priority", "change_category", "rename", "move", "lock", "escalate", "transcript", "transcript_delete", "internal_notes", "rate", "manage", "settings", "assign", "archive", "change_department", "transcript_export", "transcript_manage", "departments", "audit", "bypass_limits", "forward", "remind", "automation"] | readonly ["view", "view_sensitive", "create", "edit", "delete", "promote", "discipline", "view_unit", "notes_view", "notes_create", "notes_confidential", "documents"] | readonly ["view", "create", "edit", "archive"] | readonly ["view", "create", "edit", "void"] | readonly ["view", "decide", "delete", "manage"] | readonly ["manage"] | readonly ["view", "create", "edit", "close", "delete"] | readonly ["view", "upload", "manage", "confidential"] | readonly ["view", "create", "edit", "activate", "clear"] | readonly ["view", "create", "manage", "materials"] | readonly ["view", "create", "manage", "grade", "conduct", "results"] | readonly ["view", "create", "edit", "assign", "close", "manage"] | readonly ["view", "review", "decide", "delete", "auto_assign_dienstnummer"] | readonly ["view", "report", "manage"] | readonly ["view", "create_incident", "edit_incident", "close_incident", "assign_unit", "manage_units", "view_persons", "view_vehicles", "manage_map", "view_erlc", "manage_erlc", "erlc_command", "erlc_command_critical", "manage_cross_server", "view_logs", "manage_settings", "radio", "handover", "view_stats"] | readonly ["view", "request", "manage"] | readonly ["view", "grant", "revoke", "manage"] | readonly ["view", "customize", "tickets.view", "applications.view", "team.view", "offices.view", "voice.view", "radio.view", "teamchance.view", "logs.view", "settings.view", "cad.view"] | readonly ["view", "create", "edit", "archive", "merge"] | readonly ["view", "view_details", "edit", "assign", "manage_catalog", "manage"] | readonly ["view", "create", "edit", "submit", "review", "approve", "reject", "archive"] | readonly ["view", "create", "assign", "investigate", "resolve", "close"] | readonly ["view", "create", "edit", "review", "approve", "reject", "execute", "manage_ranks", "manage_requirements", "view_history", "manage_settings", "manage", "request"] | readonly ["view", "create", "approve", "reject", "request", "review"] | readonly ["view", "create", "manage"] | readonly ["view", "create", "assign", "edit", "release", "block", "history", "manage_ranges", "manage_settings"] | readonly ["view", "grant", "suspend", "remove", "requests", "roles", "integration", "logs"] | readonly ["view", "create", "view_all", "edit_all", "review", "manage"] | readonly ["view", "send", "moderate"] | readonly ["view", "leaderboard", "personal_all", "export"] | readonly ["view", "signup", "manage"] | readonly ["view", "organize", "minutes", "view_private"] | readonly ["view", "create", "publish", "mention", "manage"] | readonly ["view", "export"] | readonly ["view", "edit", "hierarchy"] | readonly ["view", "create", "download", "verify", "archive", "restore", "settings"] | readonly ["view", "create", "templates_create", "templates_edit", "templates_delete", "send", "history", "channels", "webhooks", "roles", "edit", "edit_others"];
            module: string;
            moduleName: string;
        }[];
        roles: {
            id: string;
            name: string;
            priority: number;
            color: string | null;
            active: boolean;
            guildId: string | null;
            system: boolean;
            members: number;
            levels: {
                [k: string]: import("@enrp/shared").AccessLevelState;
            };
        }[];
        priority: string;
    }>;
    preview(q: {
        roleId: string;
        area: AccessArea;
        level: AccessLevel;
    }): Promise<{
        added: string[];
        removed: string[];
    }>;
    set(a: Actor, roleId: string, ar: AccessArea, b: {
        level: AccessLevel;
    }): Promise<{
        _count: {
            users: number;
        };
        permissions: {
            permissionKey: string;
            effect: string;
        }[];
    } & {
        guildId: string | null;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        color: string | null;
        description: string | null;
        priority: number;
        active: boolean;
        name: string;
        icon: string | null;
        discordRoleIds: string[];
        system: boolean;
    }>;
    user(id: string): Promise<{
        area: "teamchance" | "ticket" | "personnel" | "vehicles" | "tickets" | "team" | "qualifications" | "modules" | "settings" | "notifications" | "incidents" | "documents" | "wanted" | "roles" | "users" | "training" | "exam" | "dispatch" | "applications" | "sek" | "cad" | "leave" | "qualification" | "dashboard" | "persons" | "fleet" | "reports" | "complaints" | "promotion" | "transfer" | "warning" | "awards" | "dienstnummer" | "academy" | "radiowhitelist" | "radio" | "dutyreports" | "communication" | "analytics" | "shiftplan" | "calendar" | "meetings" | "announce" | "audit" | "studio" | "servers" | "org" | "backup" | "help" | "messagebuilder";
        allowed: ("request" | "send" | "create" | "delete" | "report" | "confidential" | "settings" | "automation" | "channels" | "documents" | "roles" | "results" | "radio" | "audit" | "view" | "manage" | "teamchance.view" | "claim" | "close" | "reopen" | "add_user" | "remove_user" | "change_status" | "change_priority" | "change_category" | "rename" | "move" | "lock" | "escalate" | "transcript" | "transcript_delete" | "internal_notes" | "rate" | "assign" | "archive" | "change_department" | "transcript_export" | "transcript_manage" | "departments" | "bypass_limits" | "forward" | "remind" | "view_sensitive" | "edit" | "promote" | "discipline" | "view_unit" | "notes_view" | "notes_create" | "notes_confidential" | "void" | "tickets.view" | "team.view" | "decide" | "settings.view" | "upload" | "activate" | "clear" | "materials" | "grade" | "conduct" | "review" | "auto_assign_dienstnummer" | "applications.view" | "create_incident" | "edit_incident" | "close_incident" | "assign_unit" | "manage_units" | "view_persons" | "view_vehicles" | "manage_map" | "view_erlc" | "manage_erlc" | "erlc_command" | "erlc_command_critical" | "manage_cross_server" | "view_logs" | "manage_settings" | "handover" | "view_stats" | "cad.view" | "grant" | "revoke" | "customize" | "offices.view" | "voice.view" | "radio.view" | "logs.view" | "merge" | "view_details" | "manage_catalog" | "submit" | "approve" | "reject" | "investigate" | "resolve" | "execute" | "manage_ranks" | "manage_requirements" | "view_history" | "release" | "block" | "history" | "manage_ranges" | "suspend" | "remove" | "requests" | "integration" | "logs" | "view_all" | "edit_all" | "moderate" | "leaderboard" | "personal_all" | "export" | "signup" | "organize" | "minutes" | "view_private" | "publish" | "mention" | "hierarchy" | "download" | "verify" | "restore" | "templates_create" | "templates_edit" | "templates_delete" | "webhooks" | "edit_others")[];
        actions: {
            allowed: boolean;
            source: import("@enrp/shared").ResolutionSource;
            action: "request" | "send" | "create" | "delete" | "report" | "confidential" | "settings" | "automation" | "channels" | "documents" | "roles" | "results" | "radio" | "audit" | "view" | "manage" | "teamchance.view" | "claim" | "close" | "reopen" | "add_user" | "remove_user" | "change_status" | "change_priority" | "change_category" | "rename" | "move" | "lock" | "escalate" | "transcript" | "transcript_delete" | "internal_notes" | "rate" | "assign" | "archive" | "change_department" | "transcript_export" | "transcript_manage" | "departments" | "bypass_limits" | "forward" | "remind" | "view_sensitive" | "edit" | "promote" | "discipline" | "view_unit" | "notes_view" | "notes_create" | "notes_confidential" | "void" | "tickets.view" | "team.view" | "decide" | "settings.view" | "upload" | "activate" | "clear" | "materials" | "grade" | "conduct" | "review" | "auto_assign_dienstnummer" | "applications.view" | "create_incident" | "edit_incident" | "close_incident" | "assign_unit" | "manage_units" | "view_persons" | "view_vehicles" | "manage_map" | "view_erlc" | "manage_erlc" | "erlc_command" | "erlc_command_critical" | "manage_cross_server" | "view_logs" | "manage_settings" | "handover" | "view_stats" | "cad.view" | "grant" | "revoke" | "customize" | "offices.view" | "voice.view" | "radio.view" | "logs.view" | "merge" | "view_details" | "manage_catalog" | "submit" | "approve" | "reject" | "investigate" | "resolve" | "execute" | "manage_ranks" | "manage_requirements" | "view_history" | "release" | "block" | "history" | "manage_ranges" | "suspend" | "remove" | "requests" | "integration" | "logs" | "view_all" | "edit_all" | "moderate" | "leaderboard" | "personal_all" | "export" | "signup" | "organize" | "minutes" | "view_private" | "publish" | "mention" | "hierarchy" | "download" | "verify" | "restore" | "templates_create" | "templates_edit" | "templates_delete" | "webhooks" | "edit_others";
        }[];
    }[]>;
}
