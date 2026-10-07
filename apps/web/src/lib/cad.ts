import { useQuery } from '@tanstack/react-query';
import { DEFAULT_CAD_CONFIG, type CadConfig, type CadOption } from '@enrp/shared';
import { api } from './api';
import { usePrefs, type Preferences } from './prefs';
import { useRealtime } from './realtime';

export type { CadConfig, CadOption };
export interface CadUnitRow {
  id: string; callsign: string; name: string | null; type: string | null; color: string | null; icon: string | null; status: string; discordRoleId: string | null; guildId: string | null;
  erlcTeam: string | null; operational: boolean; vehicle: string | null; notes: string | null; mapX: number | null; mapZ: number | null;
  crew: { id: string; discordName: string | null; discordId: string | null; robloxName: string | null; erlcName: string | null; callsign: string | null; team: string | null; inGame: boolean }[];
  memberNames: string[]; current: { id: string; number: string; title: string; status: string } | null;
  position: { x: number; z: number; source: 'erlc' | 'manual'; street: string | null; postal: string | null } | null;
}
export interface CadIncidentRow {
  id: string; number: string; title: string; type: string | null; keyword: string | null; priority: string; status: string; location: string | null; description: string | null;
  involved: string | null; requiredUnits: string | null; internalNotes: string | null; mapX: number | null; mapZ: number | null; dispatcherId: string | null; guildId: string | null;
  source: string; createdAt: string; updatedAt: string; closedAt: string | null;
  units: { unitId: string; clearedAt: string | null; assignedAt: string; unit: { id: string; callsign: string; name: string | null; type: string | null; status: string } }[];
  calls?: { id: string; callNumber: number }[];
}
export interface CadIncidentDetail extends CadIncidentRow {
  log: { id: string; kind: string; text: string; unitId: string | null; authorId: string | null; guildId: string | null; createdAt: string }[];
  calls: CadCallRow[]; names: Record<string, string>;
}
export interface CadCallRow {
  id: string; serverId: string; callNumber: number; team: string | null; callerRobloxId: string | null; callerName: string | null; description: string | null; positionDescriptor: string | null;
  mapX: number | null; mapZ: number | null; startedAt: string; status: string; incidentId: string | null; source: string; server?: { id: string; name: string }; incident?: { id: string; number: string; status: string } | null;
}
export interface CadRadioRow { id: string; callsign: string | null; text: string; incidentId: string | null; incidentNumber: string | null; authorName: string | null; guildId: string | null; createdAt: string }
export interface ErlcPlayer { name: string; id: string | null; team: string | null; callsign: string | null; permission: string | null; wantedStars: number; location: { x: number; z: number; postal: string | null; street: string | null; building: string | null } | null }
export interface ErlcServerView {
  id: string; name: string; serverRef: string | null; description: string | null; logoUrl: string | null; guildId: string | null; active: boolean; pollSeconds: number; features: string[]; webhookEnabled: boolean;
  settings: { criticalCommands: string[]; blockedCommands: string[] }; status: string; statusLabel: string; lastSyncAt: string | null; lastError: string | null; lastErrorAt: string | null; latencyMs: number | null;
  rateLimit: { blockedUntil: number | null; buckets: { bucket: string; limit: number | null; remaining: number | null; resetAt: number | null }[] }; hasKey: boolean; keyMasked: string; webhookPath: string | null; paused: boolean;
}
export interface ErlcSnapshot {
  fetchedAt: string; server: { name: string; currentPlayers: number; maxPlayers: number; joinKey: string | null; accVerifiedReq: string | null; teamBalance: boolean | null };
  players?: ErlcPlayer[]; staff?: { admins: { id: string; name: string }[]; mods: { id: string; name: string }[]; helpers: { id: string; name: string }[] }; queue?: string[];
  vehicles?: { name: string; owner: string; plate: string | null; texture: string | null; colorHex: string | null; colorName: string | null }[];
  emergencyCalls?: { callNumber: number; team: string | null; caller: string | null; x: number | null; z: number | null; startedAt: number; description: string | null; positionDescriptor: string | null }[];
  modCalls?: { caller: string; moderator: string | null; timestamp: number }[]; joinLogs?: { join: boolean; player: string; timestamp: number }[];
  killLogs?: { killed: string; killer: string; timestamp: number }[]; commandLogs?: { player: string; command: string; timestamp: number }[]; webhookEvents?: { at: string; summary: string }[];
}
export interface CadMapObject { id: string; kind: 'POI' | 'ZONE'; name: string; description: string | null; category: string | null; layer: string; icon: string | null; color: string | null; x: number | null; z: number | null; points: [number, number][] | null; roleIds: string[]; incidentType: string | null; autoAction: string | null }
export interface CadMapData {
  incidents: CadIncidentRow[]; calls: CadCallRow[]; units: CadUnitRow[]; objects: CadMapObject[];
  players: (ErlcPlayer & { serverId: string; staff: boolean })[]; vehicles: { name: string; owner: string; plate: string | null; colorHex: string | null; x: number; z: number; serverId: string }[]; stale: boolean;
}
export interface CadOverview {
  config: CadConfig; incidents: CadIncidentRow[]; units: CadUnitRow[]; calls: CadCallRow[]; radio: CadRadioRow[];
  erlc: { id: string; name: string; logoUrl: string | null; status: string; lastSyncAt: string | null; lastError: string | null; latencyMs: number | null; players: number | null; maxPlayers: number | null; queue: number | null; staffOnline: number | null }[];
  counts: { persons: number | null; vehicles: number | null };
}

/** Alle CAD-Ansichten aktualisieren sich live (Server sendet nur „geändert“, Daten kommen über die API). */
export function useCadLive() {
  useRealtime('cad', ['cad.changed', 'call.created', 'erlc.snapshot', 'erlc.status', 'cad.incident.created', 'cad.incident.status', 'cad.incident.assigned', 'cad.incident.closed', 'cad.radio'],
    [['cad-overview'], ['cad-incidents'], ['cad-incident'], ['cad-units'], ['cad-calls'], ['cad-radio'], ['cad-map'], ['cad-members'], ['erlc-live'], ['erlc-servers']]);
}

export function useCadConfig() {
  const q = useQuery({ queryKey: ['cad-config'], queryFn: () => api<CadConfig>('/cad/config'), staleTime: 30_000 });
  return { ...q, cfg: q.data ?? DEFAULT_CAD_CONFIG };
}

export const optLabel = (list: CadOption[], key: string | null | undefined) => { const o = list.find((x) => x.key === key); return o ? `${o.emoji ? `${o.emoji} ` : ''}${o.label}` : (key ?? '—'); };
export const optColor = (list: CadOption[], key: string | null | undefined) => list.find((x) => x.key === key)?.color;

/** Persönliche CAD-Ansicht (Widgets, Layer, Zoom …) – gilt nur für den eigenen Benutzer. */
export function useCadPrefs() {
  const { prefs, update } = usePrefs();
  const cad = prefs.cad ?? {};
  const set = (patch: NonNullable<Preferences['cad']>) => update({ cad: { ...cad, ...patch } });
  return { cad, set };
}

export const ERLC_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { CONNECTED: 'success', LIMITED: 'warning', OFFLINE: 'danger', ERROR: 'danger', UNKNOWN: 'neutral', DISABLED: 'neutral' };
export const ago = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `vor ${s} s` : s < 3600 ? `vor ${Math.floor(s / 60)} min` : s < 86400 ? `vor ${Math.floor(s / 3600)} h` : `vor ${Math.floor(s / 86400)} T`;
};
export const unixTime = (t: number) => new Date(t * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
