# Phase 42 – Bild-Uploads für das Dashboard-Design

**Stand:** abgeschlossen (2026-10-04). Sechste Phase der Spezifikation „Vollständig anpassbares Dashboard“ (Punkte 3, 4, 21, 48, 49). Logo, Hintergrundbilder sowie Bilder in Widgets und Bannern lassen sich hochladen statt nur per Adresse einzutragen.

## Umfang
- **Hochladen** (`POST design/assets`, Recht `design.edit`): Der Körper ist die Datei selbst, der Name steht URL-kodiert in `X-Filename`. Höchstens 5 MB.
- **Prüfung am Dateikopf** (nicht an Dateiname oder behauptetem Typ): nur PNG, JPEG, GIF, WebP. SVG, HTML, Skripte, Programme, Archive, PDF und leere Dateien werden abgelehnt.
- **Neu-Kodierung und Optimierung** (`sharp`): Das Bild wird dekodiert und neu geschrieben – als WebP (GIF bleibt GIF), höchstens 2560 px, kleine Bilder werden nicht vergrößert, Metadaten (EXIF/GPS) entfallen, angehängte Nutzlasten („Polyglot“-Dateien) überleben nicht. Schutz vor „Dekompressionsbomben“ (höchstens 40 Mio. Pixel).
- **Speicher je Server:** `STORAGE_DIR/<Server-ID>/<zufällige ID>.webp|gif`; Kontingent 100 Bilder und 50 MB je Server; Liste (`GET design/assets`, `design.view`) und Löschen (`DELETE design/assets/:id`) – nur eigene Server. Audit-Log: `design.asset.uploaded/deleted`.
- **Auslieferung** `/uploads/<server>/<id>.webp` (nur Lesen): nur geprüfte Dateinamen, `nosniff`, restriktive CSP (`default-src 'none'; sandbox`), `Cross-Origin-Resource-Policy: cross-origin` (das Dashboard liegt unter anderer Adresse), unveränderlich zwischengespeichert. Keine Verzeichnislisten, keine Pfadtricks.
- **Editor:** Bildfeld mit „⬆ Bild hochladen“, „🖼️ Aus Bibliothek wählen“ und Adresseingabe; Vorschau; Bibliothek mit Größen, Kontingent, Löschen. Eingebaut bei Logo, Seiten-/Globalem Hintergrund, Bild-Widget und Banner (Widget und Seitenbanner). Das Dashboard bildet `/uploads/…` auf die Adresse der API ab (`assetUrl`).
- **Betrieb:** `STORAGE_DIR` in `.env.example`; im Produktions-Compose ein eigenes Volume `nexus-uploads`; `scripts/backup.sh` sichert zusätzlich die Bilder (`nexus-uploads-*.tar.gz`).

## Beim Testen gefundene und behobene Fehler
1. **CORS:** Der Kopf `X-Filename` war nicht freigegeben – ein Browser hätte jeden Upload (Dashboard und API auf verschiedenen Adressen) blockiert. Nur der echte Browsertest hat das gezeigt.
2. **Backup-Skript (bestehender Fehler):** Schlug `pg_dump` fehl, meldete das Skript trotzdem „Sicherung ok“ und legte eine leere 20-Byte-Datei an (kein `pipefail` in `sh`). Jetzt wird erst in eine Datei gedumpt, der Fehlerstatus geprüft, die Abschlusszeile von `pg_dump` verlangt und erst dann gepackt; bei Fehler Exit 1 und keine Datei.

## Tests
- `@nexus/design`: 94 (12 neu: Formaterkennung für 9 Fremdformate, Neu-Kodierung, EXIF, Polyglot, Dekompressionsbombe, Speichern/Listen/Löschen, Servertrennung, Kontingent).
- API: `design`-E2E 25 (Hochladen/Auflisten/Löschen mit Rechten, SVG im PNG-Mantel, 6-MB-Datei), `uploads.test.ts` 3 (Auslieferung, Header, 11 Pfadtricks, nur Lesen).
- Browser (`design-uploads.spec.ts`, echte API): SVG im PNG-Mantel wird mit Meldung abgelehnt; PNG → WebP-Adresse der API; Auslieferung mit `nosniff`/CSP, Pfadtrick ≠ 200, im Browser geladen; Bibliothek; als Hintergrund gewählt; Logo und Hintergrund im Dashboard; Löschen entfernt die Datei (404).
- Backup-Skript von Hand: kaputte DB-Adresse → Exit 1 ohne Datei; echte Datenbank + Bilderordner → beide Archive.

## Grenzen
- Die Adressen enthalten eine zufällige 96-Bit-ID, sind aber **nicht anmeldepflichtig** (ein `<img>` kann keine Anmeldung mitsenden): Wer die genaue Adresse kennt, kann das Bild laden. Für Logos und Hintergründe gedacht, nicht für Vertrauliches.
- Löscht man ein verwendetes Bild, bleibt die Adresse in der Konfiguration (wirkungslos). Beim Löschen eines Servers (Datenbank) bleiben die Dateien im Speicherordner liegen.
- Lokaler Speicher (kein S3). Mehrere API-Instanzen brauchen einen gemeinsamen Speicherordner. S3-Anbindung ist nicht umgesetzt.
- Eigene Webfonts, Suche und Benachrichtigungs-Center fehlen weiterhin.
