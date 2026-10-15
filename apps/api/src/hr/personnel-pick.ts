/**
 * Welche von mehreren Personalakten derselben Person in Listen erscheint: die aus dem Bestand (`serverId` = NULL), dann die mit
 * Dienstnummer, dann die zuletzt geänderte. Mehrere Akten gibt es nur aus der Zeit mit mehreren Discord-Servern (Archiv der
 * Umstellung, siehe archive-scope.ts) – sonst stünde jede betroffene Person doppelt in Teamliste und Personal-Übersicht.
 */
export function preferPersonnel<T extends { serverId: string | null; serviceNumber: string | null; updatedAt: Date }>(a: T, b: T): T {
  if ((a.serverId === null) !== (b.serverId === null)) return a.serverId === null ? a : b;
  if (!!a.serviceNumber !== !!b.serviceNumber) return a.serviceNumber ? a : b;
  return a.updatedAt >= b.updatedAt ? a : b;
}
