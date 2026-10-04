/** Prompt-Sanitizing: Steuerzeichen und Rahmenmarker entfernen, Länge begrenzen, Roblox-IDs/Mail-Adressen maskieren (Datensparsamkeit). */
export declare function sanitize(input: unknown, max?: number): string;
export declare const SYSTEM_PROMPT: string;
export declare const wrapData: (label: string, body: string) => string;
