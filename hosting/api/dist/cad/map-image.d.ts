/** Breite/Höhe aus dem Dateikopf (PNG, JPEG, WebP) – ohne Bildbibliothek. */
export declare function imageSize(b: Buffer): {
    width: number;
    height: number;
} | null;
/**
 * Lädt ein Kartenbild von einer https-Adresse (max. `maxBytes`). Gibt eine Datei zurück, die wie ein Upload
 * gespeichert werden kann. Webseiten statt Bilddateien werden mit einem verständlichen Hinweis abgelehnt.
 */
export declare function fetchMapImage(url: string, maxBytes: number): Promise<{
    originalname: string;
    mimetype: string;
    buffer: Buffer<ArrayBuffer>;
    size: number;
}>;
