export declare const STEP_SECONDS = 30;
export declare function base32Encode(buf: Buffer): string;
export declare function base32Decode(s: string): Buffer;
export declare const newSecret: () => string;
export declare function hotp(secret: string, counter: number): string;
export declare const totpNow: (secret: string, now?: number) => string;
/** Prüft einen Code mit ±1 Zeitfenster. Gibt den verwendeten Zeitschritt zurück (gegen Wiederverwendung) oder `null`. */
export declare function verifyTotp(secret: string, code: string, now?: number, lastStep?: number | null): number | null;
export declare const otpauthUrl: (secret: string, account: string, issuer: string) => string;
/** Wiederherstellungscodes: 10 × „xxxxx-xxxxx“, gespeichert nur als SHA-256. */
export declare function newRecoveryCodes(n?: number): string[];
export declare const normalizeRecovery: (code: string) => string;
