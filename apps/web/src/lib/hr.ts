import { useQuery } from '@tanstack/react-query';
import { REQUEST_STATUS_DEFAULT, type HrConfig, type PromotionCheck, type Requirement, type RequestStatus } from '@enrp/shared';
import { api } from './api';

/** Gemeinsame Typen/Hooks für das Personal-System (Seiten unter pages/hr/). API: /api/v1/hr/*, /api/v1/dienstnummern/*. */
export interface HrRank {
  id: string; name: string; position: number; description: string | null; icon: string | null; color: string; discordRoleIds: string[]; dashboardRoleIds: string[];
  nextRankIds: string[]; approverRankIds: string[]; requirements: Requirement[]; active: boolean;
}
export interface PersonRow {
  id: string; userId: string; name: string; username: string; discordName: string | null; discordId: string | null; avatar: string | null; robloxName: string | null; robloxId: string | null;
  rank: string | null; rankColor: string | null; rankIcon: string | null; rankPosition: number; department: string | null; status: string | null; joinDate: string | null;
  serviceNumber: string | null; callsign: string | null; absentUntil: string | null; counts: { promotions: number; awards: number; warnings: number | null; trainings: number };
}
export interface Overview { rows: PersonRow[]; statuses: HrConfig['statuses']; departments: { name: string; color: string }[]; ranks: { id: string; name: string; color: string; icon: string | null }[] }
export interface HrRecord { id: string; type: string; summary: string; details: string | null; data: Record<string, unknown> | null; status: string | null; expiresAt: string | null; attachments: string[]; createdAt: string; createdById: string; createdByName: string; state?: 'ACTIVE' | 'EXPIRED' | 'REVOKED' }
export interface HrRequest {
  id: string; number: string; kind: 'PROMOTION' | 'TRANSFER'; personnelId: string; status: RequestStatus; fromValue: string | null; toValue: string; fromLabel: string | null; toLabel: string | null;
  reason: string; achievements: string | null; internalNote: string | null; attachments: string[]; requesterId: string; requesterName: string;
  approvals: { userId: string; name: string; stage: string | null; decision: 'APPROVE' | 'REJECT' | 'REVIEW' | 'DEFER'; comment: string | null; at: string }[];
  decidedAt: string | null; executedAt: string | null; createdAt: string; updatedAt: string; version: number;
  personnel?: { id: string; rank: string | null; team: string | null; user: { displayName: string } };
}
export interface HrRequestDetail extends HrRequest {
  check: PromotionCheck | null; stages: { id: string; name: string; roleIds: string[] }[]; needed: number; next: { id: string; name: string } | null;
  can: { approve: boolean; approveWhy: string | null; reject: boolean; review: boolean; execute: boolean; edit: boolean; cancel: boolean };
}
export interface Profile {
  id: string; userId: string; name: string; username: string; discordName: string | null; discordId: string | null; avatar: string | null; robloxName: string | null; robloxId: string | null;
  rank: string | null; rankInfo: { id: string; name: string; color: string; icon: string | null; description: string | null } | null; rankSince: string;
  department: string | null; office: string | null; status: string | null; joinDate: string | null; serviceNumber: string | null; callsign: string | null; customChecks: Record<string, boolean>;
  sections: Record<string, boolean>; next: PromotionCheck[];
  promotions: HrRecord[] | null; transfers: HrRecord[] | null; requests: HrRequest[]; awards: HrRecord[] | null; warnings: HrRecord[] | null; notes: HrRecord[] | null; recommendations: HrRecord[];
  trainings: { id: string; trainingId: string; status: string; progress: number; completedAt: string | null; expiresAt: string | null; certificateNo: string | null; note: string | null; training: { id: string; name: string; certificate: boolean; validDays: number | null } }[] | null;
  exams: { id: string; examId: string; status: string; score: number | null; maxScore: number | null; passed: boolean | null; startedAt: string; submittedAt: string | null; exam: { id: string; title: string; passPercent: number; showResult: boolean } }[] | null;
  absences: { id: string; number: string; startsAt: string; endsAt: string; type: string | null; status: string; reason: string | null; comment: string | null; decidedByName: string | null; createdAt: string }[] | null;
  serviceNumbers: { id: string; display: string; oldDisplay: string | null; action: string; reason: string | null; createdAt: string }[] | null;
  history: { id: string; action: string; at: string; actor: string; before: unknown; after: unknown; reason: string | null }[] | null;
  counts: { promotions: number; trainings: number; awards: number; warnings: number };
}

export const useHrConfig = () => useQuery({ queryKey: ['hr-config'], queryFn: () => api<HrConfig>('/hr/config'), staleTime: 30_000 });
export const useRanks = () => useQuery({ queryKey: ['hr-ranks'], queryFn: () => api<HrRank[]>('/hr/ranks'), staleTime: 30_000 });

/** Status (aus den Einstellungen) als Label mit Emoji/Farbe. */
export function statusInfo(cfg: HrConfig | undefined, key: string | null | undefined) {
  const s = cfg?.statuses.find((x) => x.key === key);
  return { label: s?.label ?? key ?? '—', emoji: s?.emoji ?? '', color: s?.color ?? '#64748b' };
}
/** Antragsstatus mit eigenen Namen aus den Einstellungen. */
export function requestStatus(cfg: HrConfig | undefined, s: RequestStatus) {
  return cfg?.promotion.statusLabels[s] ?? REQUEST_STATUS_DEFAULT[s];
}
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('de-DE') : '—');
