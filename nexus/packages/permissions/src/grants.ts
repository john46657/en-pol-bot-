import type { PermissionEffect, PermissionScope } from '@nexus/types';
import { PERMISSIONS, permissionLabel } from '@nexus/types';
import { moduleOf } from './engine.js';

/**
 * Auswertung von Erlaubnissen und Sperren (reine Logik).
 *
 * Ebenen: GLOBAL = Discord-Besitzer/Administrator (`bypass`, außerhalb dieser Funktionen), SERVER/TEAM/RECORD =
 * Geltungsbereich einer Zuordnung, MODUL = Präfix des Schlüssels (`<modul>.manage`), BENUTZER = Zuordnungen
 * mit `source.kind === 'user'`. Regeln: (1) eine passende **Sperre schlägt jede Erlaubnis**, (2) ohne Erlaubnis
 * gilt „nein“, (3) `<modul>.manage` erlaubt alles im Modul, sperrt aber nur sich selbst.
 */
export interface GrantSource {
  kind: 'role' | 'profile' | 'user';
  roleId?: string | undefined;
  roleName?: string | undefined;
  profileId?: string | undefined;
  profileName?: string | undefined;
  note?: string | undefined;
}

export interface Grant {
  key: string;
  effect: PermissionEffect;
  scope: PermissionScope;
  /** Team-/Datensatz-ID; leer = „eigenes Team“ (TEAM) bzw. n/a. */
  scopeRef: string;
  source: GrantSource;
}

/** Datensatz, auf den sich eine Aktion bezieht. */
export interface Resource {
  teamId?: string | undefined;
  recordId?: string | undefined;
}

/** Wer handelt (für Team-Bezug). */
export interface Subject {
  teamIds?: readonly string[] | undefined;
}

const keyMatches = (g: Grant, key: string): { match: boolean; viaManage: boolean } => {
  if (g.key === key) return { match: true, viaManage: false };
  // Erlaubnisse über `<modul>.manage`; Sperren gelten nur für ihren exakten Schlüssel.
  if (g.effect === 'ALLOW' && g.key === `${moduleOf(key)}.manage` && g.key !== key) {
    return { match: true, viaManage: true };
  }
  return { match: false, viaManage: false };
};

/** Gilt die Zuordnung für diese Ressource? Ohne Ressource decken nur SERVER-Zuordnungen ab. */
export function scopeCovers(g: Grant, resource: Resource = {}, subject: Subject = {}): boolean {
  if (g.scope === 'SERVER') return true;
  if (g.scope === 'TEAM') {
    if (!resource.teamId) return false;
    return g.scopeRef
      ? g.scopeRef === resource.teamId
      : !!subject.teamIds?.includes(resource.teamId);
  }
  return !!resource.recordId && g.scopeRef === resource.recordId; // RECORD
}

export interface Decision {
  allowed: boolean;
  state: 'allowed' | 'denied' | 'none';
  /** Zuordnungen, die entschieden haben (Sperren bei „denied“, Erlaubnisse bei „allowed“). */
  by: Grant[];
}

export function decide(
  grants: readonly Grant[],
  key: string,
  resource: Resource = {},
  subject: Subject = {},
): Decision {
  const applicable = grants.filter(
    (g) => keyMatches(g, key).match && scopeCovers(g, resource, subject),
  );
  const denies = applicable.filter((g) => g.effect === 'DENY');
  if (denies.length > 0) return { allowed: false, state: 'denied', by: denies };
  const allows = applicable.filter((g) => g.effect === 'ALLOW');
  return allows.length > 0
    ? { allowed: true, state: 'allowed', by: allows }
    : { allowed: false, state: 'none', by: [] };
}

export type EffectiveState = 'allowed' | 'limited' | 'denied' | 'none';

/** Zustand eines Schlüssels ohne konkrete Ressource: allowed = serverweit, limited = nur teil-/datensatzbezogen. */
export function stateOf(grants: readonly Grant[], key: string): EffectiveState {
  const matching = grants.filter((g) => keyMatches(g, key).match);
  if (matching.some((g) => g.effect === 'DENY' && g.scope === 'SERVER')) return 'denied';
  if (matching.some((g) => g.effect === 'ALLOW' && g.scope === 'SERVER')) return 'allowed';
  if (matching.some((g) => g.effect === 'ALLOW')) return 'limited';
  return matching.some((g) => g.effect === 'DENY') ? 'denied' : 'none';
}

export function effective(grants: readonly Grant[], keys: readonly string[] = PERMISSIONS) {
  return keys.map((key) => ({ key, state: stateOf(grants, key) }));
}

export interface ExplainedEntry extends Grant {
  /** Der Schlüssel wirkt über `<modul>.manage`. */
  viaManage: boolean;
}

/** Alle Zuordnungen, die für den Schlüssel eine Rolle spielen – Grundlage der „Warum?“-Ansicht. */
export function explain(grants: readonly Grant[], key: string) {
  const entries: ExplainedEntry[] = grants
    .map((g) => ({ g, m: keyMatches(g, key) }))
    .filter((x) => x.m.match)
    .map((x) => ({ ...x.g, viaManage: x.m.viaManage }));
  return { key, state: stateOf(grants, key), entries };
}

/** Verständliche Beschriftung der fehlenden Rechte – ohne interne Schlüssel (für Nutzer-Meldungen). */
export function describeMissing(keys: readonly string[]): string {
  const labels = [...new Set(keys.map((k) => permissionLabel(k) ?? 'eine passende Berechtigung'))];
  return labels.join(' oder ');
}

export function permissionDeniedMessage(keys: readonly string[]): string {
  return `Keine Berechtigung. Du benötigst: ${describeMissing(keys)}. Wende dich an einen Administrator.`;
}
