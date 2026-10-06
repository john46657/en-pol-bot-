import { useQuery } from '@tanstack/react-query';
import type { ButtonStyleName, ClaimMode, CloseReasonMode, CloseReasonSource, StatusKind, TicketButtonConfig, TicketQuestion } from '@enrp/shared';
import { api, ApiError } from './api';
import { useServer } from './guilds';

// ---- Support-Tickets: Typen der API-Antworten (Pfad /support-tickets) ----
export interface TicketStatusCfg { id: string; name: string; emoji: string; color: number; position: number; kind: StatusKind; isDefault: boolean; isClaimed: boolean; isEscalation: boolean; isClose: boolean }
export interface TicketPriorityCfg { id: string; name: string; emoji: string; color: number; position: number; isDefault: boolean; allowedRoleNames: string[]; notifyRoleIds: string[] }
export interface TicketReasonCfg { id: string; text: string; position: number }
export interface TicketCategoryCfg {
  id: string; guildId: string | null; name: string; description: string; emoji: string | null; color: number; buttonStyle: ButtonStyleName; position: number; active: boolean;
  discordCategoryId: string | null; channelNameFormat: string; staffRoleIds: string[]; extraRoleIds: string[]; requiredRoleIds: string[]; allowedUserIds: string[]; accessRoleNames: string[];
  maxOpen: number; cooldownMinutes: number; defaultPriorityId: string | null; questions: TicketQuestion[];
  welcomeTitle: string; welcomeMessage: string; mentionStaff: boolean; mentionText: string; buttons: TicketButtonConfig[];
  claimMode: ClaimMode; claimMessage: string; claimNotifyStaff: boolean;
  creatorCanClose: boolean; closeReasonMode: CloseReasonMode; closeReasonSource: CloseReasonSource; closeRemovesAccess: boolean; allowReopen: boolean;
  transcriptOnClose: boolean; transcriptChannelId: string | null; transcriptToUser: boolean; ratingEnabled: boolean; ratingQuestion: string;
  autoCloseMinutes: number; autoCloseWarnMinutes: number; autoCloseMessage: string; deleteAfterMinutes: number;
  escalationRoleIds: string[]; escalationPriorityId: string | null; escalationMessage: string;
  welcomeImageUrl: string | null; capacity: number; creatorCanAddUsers: boolean; claimDiscordCategoryId: string | null; claimLocksChat: boolean;
  autoClaimOnMessage: boolean; autoUnclaimMinutes: number; staffAlertMinutes: number; closeRequestCloses: boolean;
}
export interface TicketPanelCfg {
  id: string; guildId: string | null; name: string; title: string; description: string; emoji: string | null; color: number; thumbnailUrl: string | null; imageUrl: string | null; bannerUrl: string | null;
  footer: string | null; footerIconUrl: string | null; authorName: string | null; authorIconUrl: string | null; style: 'BUTTONS' | 'DROPDOWN'; placeholder: string;
  channelId: string | null; categoryIds: string[]; allowedRoleIds: string[]; showLoad: boolean; position: number; messageChannelId: string | null; messageId: string | null;
}
export interface TicketSettingsCfg {
  logChannelId: string | null; transcriptChannelId: string | null; closedTitle: string; closedMessage: string; closedColor: number;
  reopenedMessage: string; ratingMessage: string; ratingThanks: string; transcriptRetentionDays: number;
  ratingChannelId: string | null; ratingPublicChannelId: string | null; ratingPublicFields: RatingField[];
}
export const RATING_FIELDS = { creator: 'Creator', category: 'Category', staff: 'Staff', duration: 'Handling time', comment: 'Comment' } as const;
export type RatingField = keyof typeof RATING_FIELDS;
export interface TicketConfig { categories: TicketCategoryCfg[]; panels: TicketPanelCfg[]; statuses: TicketStatusCfg[]; priorities: TicketPriorityCfg[]; reasons: TicketReasonCfg[]; settings: TicketSettingsCfg }

export interface TicketRow {
  id: string; number: string; name: string; guildId?: string; creatorId: string; creatorName: string; claimers: string[]; locked: boolean; createdAt: string; closedAt: string | null; deletedAt: string | null; escalatedAt: string | null;
  category: { id: string; name: string; emoji: string | null } | null; status: TicketStatusCfg | null; priority: TicketPriorityCfg | null;
}
export interface TicketAttachment { name: string; size: number; contentType: string | null; url: string; storageKey?: string | null }
export interface TicketDetail extends Omit<TicketRow, 'category'> {
  channelId: string | null; guildId: string; closeReason: string | null; closedByName: string | null; firstResponseAt: string | null; lastActivityAt: string; deleteAt: string | null;
  answers: { label: string; value: string }[];
  category: { id: string; name: string; emoji: string | null; claimMode: ClaimMode; closeReasonMode: CloseReasonMode; closeReasonSource: CloseReasonSource; allowReopen: boolean };
  access: { id: string; targetId: string; kind: 'USER' | 'ROLE'; expiresAt: string | null; createdAt: string }[];
  messages: { id: string; authorId: string; authorName: string; authorAvatar: string | null; isStaff: boolean; isBot: boolean; content: string; attachments: TicketAttachment[]; embeds: { title?: string; description?: string }[]; createdAt: string }[];
  notes: { id: string; authorName: string; text: string; createdAt: string }[] | null;
  logs: { id: string; action: string; actorName: string | null; detail: Record<string, unknown>; createdAt: string }[];
  transcripts: { id: string; createdAt: string; createdByName: string | null; sizeBytes: number }[] | null;
  rating: { stars: number; comment: string | null; createdAt: string } | null;
  /** Discord-ID → Anzeigename (Bearbeiter, hinzugefügte Benutzer). */
  names: Record<string, string>;
}
export interface TicketOptions { closed: boolean; statuses: TicketStatusCfg[]; priorities: TicketPriorityCfg[]; categories: { id: string; name: string; emoji: string | null }[]; reasons: TicketReasonCfg[]; close: { mode: CloseReasonMode; source: CloseReasonSource } }
export interface RatingSummary { count: number; average: number | null; positive: number; negative: number; perStaff: { discordId: string; count: number; average: number | null }[]; perCategory: { id: string; name: string; count: number; average: number | null }[] }
export interface TicketStats {
  total: number; open: number; closed: number; archived: number; today: number; week: number; month: number; avgFirstResponseMinutes: number | null; avgCloseMinutes: number | null; escalations: number;
  perCategory: { id: string; name: string; total: number; open: number }[]; perStaff: { discordId: string; tickets: number; closed: number }[]; ratings: RatingSummary; names: Record<string, string>;
}

/** Einstellungen für den gewählten Server (Kategorien/Panels dieses Servers + die für alle Server). */
export const useTicketConfig = () => {
  const [server] = useServer();
  return useQuery({ queryKey: ['ticket-config', server], queryFn: () => api<TicketConfig>('/support-tickets/config', { query: { guildId: server } }) });
};

export const hex = (n: number) => `#${(n >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
export const fromHex = (s: string) => parseInt(s.replace('#', ''), 16) || 0;
export const duration = (min: number | null) => (min === null ? '—' : min < 60 ? `${min} min` : min < 1440 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`);
/** Lesbare Feldnamen für Prüf-Fehler der API (z. B. `staffRoleIds.0`, `questions.1.label`). */
const FIELD: Record<string, string> = {
  name: 'Name', emoji: 'Emoji', description: 'Description', channelNameFormat: 'Channel name format', discordCategoryId: 'Discord category ID', channelId: 'Target channel',
  staffRoleIds: 'Staff roles', extraRoleIds: 'Additional roles', requiredRoleIds: 'Required Discord roles', allowedUserIds: 'Only these users', escalationRoleIds: 'Roles added on escalation',
  allowedRoleIds: 'Visible for Discord roles', notifyRoleIds: 'Notify Discord roles', accessRoleNames: 'Dashboard access roles', allowedRoleNames: 'May be set by system roles',
  transcriptChannelId: 'Transcript channel ID', logChannelId: 'Log channel ID', questions: 'Question', units: 'Unit', policeForm: 'Police application – question', minLength: 'min. length', maxLength: 'max. length', pingRoleIds: 'Ping roles', roleId: 'role ID', police: 'Police application', settings: 'Settings', messages: 'Messages', roles: 'Roles', timeLimitMinutes: 'Time limit', cooldownMinutes: 'Cooldown', acceptedChannelId: 'Accepted channel', deniedChannelId: 'Denied channel', accepted: 'Accepted', denied: 'Denied', confirmation: 'Confirmation', completion: 'Completion', buttons: 'Button', welcomeTitle: 'Title', welcomeMessage: 'Message',
  thumbnailUrl: 'Thumbnail', imageUrl: 'Image', bannerUrl: 'Banner', footerIconUrl: 'Footer icon', authorIconUrl: 'Author icon', placeholder: 'Placeholder', text: 'Reason', label: 'text', options: 'options',
};
const fieldName = (path: string) => {
  const parts = path.split('.');
  // tiefe Pfade (z. B. units.0.questions.1.options): „units 1 › Question 2 › options“
  if (parts.length > 3 || (parts[1] !== undefined && !/^\d+$/.test(parts[1]))) return parts.reduce<string[]>((out, p) => { if (/^\d+$/.test(p)) out[out.length - 1] = `${out[out.length - 1]} ${Number(p) + 1}`; else out.push(FIELD[p] ?? p); return out; }, []).join(' › ');
  const [k = '', i, sub] = parts;
  const base = FIELD[k] ?? k;
  if (i === undefined) return base;
  const n = Number(i) + 1;
  return `${base}${['questions', 'buttons'].includes(k) ? ` ${n}` : ` (entry ${n})`}${sub ? ` – ${FIELD[sub] ?? sub}` : ''}`;
};
export const errText = (e: unknown) => {
  if (!(e instanceof ApiError)) return 'Failed';
  const details = Array.isArray(e.details) ? (e.details as { path?: string; message?: string }[]).filter((d) => d.message) : [];
  const list = details.slice(0, 5).map((d) => (d.path ? `${fieldName(d.path)}: ${d.message}` : d.message)).join(' · ');
  return `${list ? `Please check: ${list}` : e.message}${e.requestId ? ` (Request ID ${e.requestId})` : ''}`;
};
/** Discord-IDs aus Text (Komma/Leerzeichen/Zeilen getrennt). */
/** Eine Discord-ID aus Eingaben wie `123…`, `<@&123…>`, `<#123…>` oder mit Leerzeichen. */
export const oneId = (s: string) => { const t = s.trim(); return t ? (t.match(/\d{15,25}/)?.[0] ?? t) : null; };
export const idsFromText = (s: string) => s.replace(/></g, '> <').split(/[\s,;]+/).map((x) => oneId(x)).filter((x): x is string => !!x);
export const idsToText = (a: string[]) => a.join(', ');
export const label = (x: { emoji?: string | null; name: string } | null | undefined) => (x ? `${x.emoji ? `${x.emoji} ` : ''}${x.name}` : '—');
