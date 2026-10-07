export declare function encryptSecret(plain: string): string;
/** `null`, wenn der Wert nicht (mehr) entschlüsselt werden kann. Wirft nie – damit der Key nie in Fehlermeldungen landet. */
export declare function decryptSecret(stored: string): string | null;
