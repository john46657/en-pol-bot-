/** Format: scrypt$N$r$p$saltB64$hashB64 — niemals Klartext speichern. */
export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, stored: string): Promise<boolean>;
/** Konstanter Dummy-Hash, damit Login für unbekannte Benutzer gleich lange dauert. */
export declare const DUMMY_HASH: string;
