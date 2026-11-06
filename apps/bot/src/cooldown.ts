/**
 * Wartezeit je Nutzer und Slash-Befehl (Schutz vor Spam und versehentlichem Mehrfach-Absenden).
 * Begrenzt nur die Nutzung des Bots – kein Eingriff gegen Mitglieder. `seconds = 0` schaltet die Wartezeit aus.
 */
export interface Cooldowns {
  /** `null` = darf ausführen (und die Wartezeit beginnt); sonst verbleibende Sekunden (aufgerundet). */
  hit(userId: string, key: string): number | null;
}

/** Obergrenze der gemerkten Einträge, damit der Speicher nicht wächst. */
const MAX_ENTRIES = 10_000;

export function createCooldowns(seconds: number, now: () => number = Date.now): Cooldowns {
  const ms = Math.max(0, seconds) * 1000;
  const last = new Map<string, number>();
  return {
    hit(userId, key) {
      if (ms === 0) return null;
      const id = `${userId}:${key}`;
      const t = now();
      const prev = last.get(id);
      if (prev !== undefined && t - prev < ms) return Math.ceil((ms - (t - prev)) / 1000);
      if (last.size >= MAX_ENTRIES) {
        for (const [k, v] of last) if (t - v >= ms) last.delete(k);
        if (last.size >= MAX_ENTRIES) last.delete(last.keys().next().value!); // ältesten Eintrag verwerfen
      }
      last.delete(id); // neu einfügen → Reihenfolge = Alter
      last.set(id, t);
      return null;
    },
  };
}

/** Verständlicher Hinweis für den Nutzer. */
export const cooldownText = (left: number) => `⏳ Bitte kurz warten – du kannst diesen Befehl in ${left} Sekunde${left === 1 ? '' : 'n'} wieder nutzen.`;
