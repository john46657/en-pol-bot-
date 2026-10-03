/** Roblox-User-IDs sind positive Ganzzahlen (als String gespeichert, um Präzisionsverlust zu vermeiden). */
export const isValidRobloxUserId = (v: string): boolean => /^[1-9]\d{0,17}$/.test(v);
