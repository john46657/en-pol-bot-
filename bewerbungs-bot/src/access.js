/**
 * Wer darf was?
 * - Admin: „Server verwalten“ oder eine Admin-Rolle → alles inkl. Einrichtung
 * - Prüfer: eine Prüfer-Rolle oder Manager-Rolle irgendeiner Bewerbungsart → Bewerbungen sehen, entscheiden, Sperren
 * Hat eine Bewerbungsart eigene Manager-Rollen, dürfen (neben Admins) nur diese über sie entscheiden.
 */
export function accessLevel(cfg, member) {
  if (!member) return null;
  const has = (ids) => (ids ?? []).some((r) => member.roles.includes(r));
  if (member.manageGuild || has(cfg.access?.adminRoles)) return 'admin';
  if (has(cfg.access?.reviewerRoles) || cfg.types.some((t) => has(t.roles?.managers))) return 'reviewer';
  return null;
}

export function canDecide(cfg, type, member) {
  const level = accessLevel(cfg, member);
  if (level === 'admin') return true;
  if (!level) return false;
  const managers = type?.roles?.managers ?? [];
  return managers.length ? managers.some((r) => member.roles.includes(r)) : (cfg.access?.reviewerRoles ?? []).some((r) => member.roles.includes(r));
}

/** Welche Bewerbungsarten ein Prüfer sehen darf (Admins: alle). */
export function visibleTypes(cfg, member) {
  const level = accessLevel(cfg, member);
  if (level === 'admin') return null;
  if (!level) return new Set();
  const reviewer = (cfg.access?.reviewerRoles ?? []).some((r) => member.roles.includes(r));
  return new Set(cfg.types.filter((t) => (t.roles?.managers?.length ? t.roles.managers.some((r) => member.roles.includes(r)) : reviewer)).map((t) => t.key));
}
