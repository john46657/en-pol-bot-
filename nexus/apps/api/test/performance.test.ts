import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Schema-Prüfung (ohne Datenbank): Jede Tabelle mit `guildId` muss Abfragen „alles eines Servers“ über einen Index
 * bedienen können – sonst wird sie mit vielen Servern zum Full-Scan. Neue Tabellen ohne Index lassen den Test scheitern.
 */
const schema = readFileSync(new URL('../../../packages/database/prisma/schema.prisma', import.meta.url), 'utf8');
const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)].map((m) => ({ name: m[1]!, body: m[2]! }));

/** Tabellen, die bewusst nur über den Primärschlüssel/Fremdschlüssel einer Elterntabelle gelesen werden. */
const CHILD_TABLES = new Set([
  'ApplicationDMState', 'PersonnelEvent', 'ShiftEvent', 'UnitEvent', 'OperationUnit', 'OperationParticipant',
  'OperationEvent', 'WantedEvent', 'VehicleDamage', 'VehicleEvent', 'TrainingEvent', 'TicketEvent',
]);

describe('Datenbankindizes', () => {
  const withGuild = models.filter((m) => /^\s+guildId\s/m.test(m.body));
  it('es gibt Modelle mit guildId (Plausibilität)', () => expect(withGuild.length).toBeGreaterThan(30));

  it.each(withGuild.map((m) => [m.name, m.body] as const))('%s: guildId ist vorderste Spalte eines Index/Unique (oder Primärschlüssel)', (name, body) => {
    if (CHILD_TABLES.has(name)) {
      // Kindtabellen werden über das Elternobjekt gelesen → dort muss ein Index/Schlüssel mit der Eltern-ID beginnen
      expect(/@@(?:index|unique)\(\[\s*\w+Id\b/.test(body) || /^\s+\w+Id\s+String\s+@id/m.test(body), `${name}: kein Index über die Eltern-ID`).toBe(true);
      return;
    }
    const lead = /@@(?:index|unique)\(\[\s*guildId\b/.test(body) || /^\s+guildId\s+\S+.*@(?:unique|id)\b/m.test(body) || /@@id\(\[\s*guildId\b/.test(body);
    expect(lead, `${name} hat keinen Index mit guildId an erster Stelle`).toBe(true);
  });
});
