/** Neu eingereichte Bewerbung (Polizei = POLICE, Einheit/Qualifikation = QUALIFICATION) – Dashboard/Web und Discord. */
export interface SubmittedApplication {
  kind: 'POLICE' | 'QUALIFICATION';
  id: string;
  number: string;
  guildId: string | null;
  /** Discord-Kanal, in dem die Bewerbung gepostet wurde (für die Meldung „KI-Analyse fertig“) */
  channelKey: 'applications' | 'qualifications';
  channelId?: string | null;
}
type Handler = (a: SubmittedApplication) => void;

/**
 * Entkoppelt das Einreichen einer Bewerbung von Folgeaufgaben (z. B. automatische KI-Prüfung), ohne Modul-Abhängigkeit im Kreis.
 * Die Folgeaufgabe läuft im Hintergrund: Fehler dort stoppen oder verzögern das Speichern der Bewerbung nie.
 */
export const applicationEvents = {
  handlers: [] as Handler[],
  on(h: Handler) { this.handlers.push(h); return () => { this.handlers = this.handlers.filter((x) => x !== h); }; },
  submitted(a: SubmittedApplication) {
    for (const h of this.handlers) {
      try { h(a); } catch (e) { console.error(`application follow-up failed for ${a.number}: ${e instanceof Error ? e.message : e}`); }
    }
  },
};
