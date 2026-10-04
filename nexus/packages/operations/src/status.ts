export const STATUSES = ['REQUESTED', 'EN_ROUTE', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type OpStatus = (typeof STATUSES)[number];
export const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type OpPriority = (typeof PRIORITIES)[number];

export const STATUS_LABEL: Record<OpStatus, string> = {
  REQUESTED: 'Angefordert',
  EN_ROUTE: 'Angefahren',
  ACTIVE: 'Aktiv',
  COMPLETED: 'Abgeschlossen',
  CANCELLED: 'Abgebrochen',
};
export const PRIORITY_LABEL: Record<OpPriority, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };

/** Erlaubte Statuswechsel. Abgeschlossen/Abgebrochen sind endgültig. */
export const TRANSITIONS: Record<OpStatus, readonly OpStatus[]> = {
  REQUESTED: ['EN_ROUTE', 'ACTIVE', 'CANCELLED'],
  EN_ROUTE: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
export const isOpen = (s: OpStatus) => s !== 'COMPLETED' && s !== 'CANCELLED';
export const canTransition = (from: OpStatus, to: OpStatus) => TRANSITIONS[from].includes(to);
export const formatNumber = (n: number) => `E-${String(n).padStart(4, '0')}`;
