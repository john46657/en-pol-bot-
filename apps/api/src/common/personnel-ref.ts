/**
 * Personalakte in verschachtelten Abfragen (Benutzer → Akte): `personnel: { ...onePersonnel(), select: {…} }` und danach
 * `user.personnel[0]`. Maßgeblich ist die Akte des Bestands; nur falls es (aus der früheren Multi-Server-Zeit) zusätzlich eine
 * separat belassene Akte gibt, kommt diese erst danach.
 */
export const onePersonnel = () => ({ orderBy: { serverId: { sort: 'asc' as const, nulls: 'first' as const } }, take: 1 });
