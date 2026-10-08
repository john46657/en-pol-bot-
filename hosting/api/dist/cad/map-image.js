"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageSize = imageSize;
exports.fetchMapImage = fetchMapImage;
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const errors_1 = require("../common/errors");
/** Private/interne Netze: der Server lädt Kartenbilder nur aus dem öffentlichen Internet. */
const PRIVATE = new node_net_1.BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3]])
    PRIVATE.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]])
    PRIVATE.addSubnet(a, p, 'ipv6');
async function assertPublicHttps(raw) {
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        throw new errors_1.AppError('VALIDATION_FAILED', 'Ungültige Adresse.');
    }
    if (u.protocol !== 'https:')
        throw new errors_1.AppError('VALIDATION_FAILED', 'Die Bild-Adresse muss mit https:// beginnen.');
    const host = u.hostname.replace(/^\[|\]$/g, '');
    const addrs = (0, node_net_1.isIP)(host) ? [{ address: host, family: (0, node_net_1.isIP)(host) }] : await (0, promises_1.lookup)(host, { all: true }).catch(() => []);
    if (!addrs.length)
        throw new errors_1.AppError('VALIDATION_FAILED', `Der Server „${host}“ ist nicht erreichbar.`);
    // IPv4 in IPv6 (::ffff:10.0.0.1) wie IPv4 prüfen
    const blocked = (ip, fam) => { const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1]; return v4 ? PRIVATE.check(v4, 'ipv4') : PRIVATE.check(ip, fam === 6 ? 'ipv6' : 'ipv4'); };
    if (addrs.some((x) => blocked(x.address, x.family)))
        throw new errors_1.AppError('VALIDATION_FAILED', 'Diese Adresse ist nicht erlaubt.');
}
/** Breite/Höhe aus dem Dateikopf (PNG, JPEG, WebP) – ohne Bildbibliothek. */
function imageSize(b) {
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47)
        return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (b.length > 30 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
        const kind = b.toString('ascii', 12, 16);
        if (kind === 'VP8X')
            return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
        if (kind === 'VP8 ')
            return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
        if (kind === 'VP8L') {
            const v = b.readUInt32LE(21);
            return { width: 1 + (v & 0x3fff), height: 1 + ((v >> 14) & 0x3fff) };
        }
        return null;
    }
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
        let i = 2;
        while (i + 9 < b.length) {
            if (b[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = b[i + 1];
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
                return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
            i += 2 + b.readUInt16BE(i + 2);
        }
    }
    return null;
}
/**
 * Lädt ein Kartenbild von einer https-Adresse (max. `maxBytes`). Gibt eine Datei zurück, die wie ein Upload
 * gespeichert werden kann. Webseiten statt Bilddateien werden mit einem verständlichen Hinweis abgelehnt.
 */
async function fetchMapImage(url, maxBytes) {
    let current = url;
    let res;
    for (let hop = 0; hop < 5; hop++) {
        await assertPublicHttps(current);
        res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(60_000), headers: { accept: 'image/png,image/jpeg,image/webp,image/*;q=0.8' } })
            .catch(() => { throw new errors_1.AppError('VALIDATION_FAILED', 'Die Bild-Adresse konnte nicht geladen werden.'); });
        const loc = res.headers.get('location');
        if (res.status >= 300 && res.status < 400 && loc) {
            current = new URL(loc, current).toString();
            continue;
        }
        break;
    }
    if (!res || !res.ok)
        throw new errors_1.AppError('VALIDATION_FAILED', `Die Bild-Adresse konnte nicht geladen werden (${res?.status ?? 'Weiterleitungen'}).`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type === 'text/html')
        throw new errors_1.AppError('VALIDATION_FAILED', 'Das ist eine Webseite, keine Bilddatei. Öffne das Bild, mach einen Rechtsklick → „Bildadresse kopieren“ (endet meist auf .png/.jpg) und füge diese Adresse ein.');
    if (!/^image\/(png|jpeg|webp)$/.test(type))
        throw new errors_1.AppError('VALIDATION_FAILED', 'Unter dieser Adresse liegt kein PNG-, JPG- oder WebP-Bild.');
    if (Number(res.headers.get('content-length') ?? 0) > maxBytes)
        throw new errors_1.AppError('VALIDATION_FAILED', `Das Bild ist zu groß (max. ${Math.round(maxBytes / 1048576)} MB).`);
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
        size += chunk.length;
        if (size > maxBytes)
            throw new errors_1.AppError('VALIDATION_FAILED', `Das Bild ist zu groß (max. ${Math.round(maxBytes / 1048576)} MB).`);
        chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const name = decodeURIComponent(new URL(current).pathname.split('/').pop() || 'karte') || 'karte';
    return { originalname: name, mimetype: type, buffer, size: buffer.length };
}
//# sourceMappingURL=map-image.js.map