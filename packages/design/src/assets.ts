import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertGuildId, auditRepository, prisma } from '@nexus/database';
import sharp from 'sharp';
import { DesignError } from './service.js';

/** Hochgeladene Bilder (Logo, Hintergrund, Widgets): geprüft, neu kodiert, je Server getrennt gespeichert. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_ASSETS = 100;
export const MAX_ASSET_TOTAL_BYTES = 50 * 1024 * 1024;
export const MAX_DIMENSION = 2560;
const MAX_INPUT_PIXELS = 40_000_000; // Schutz vor „Dekompressionsbomben“

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';
/**
 * Erkennt das Bildformat am Dateikopf – nie am Dateinamen oder am vom Client behaupteten Typ.
 * Alles andere (SVG, HTML, Skripte, Programme, Archive, PDF …) ergibt `null` und wird abgelehnt.
 */
export function sniffImage(b: Buffer): ImageKind | null {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (
    b.length >= 6 &&
    (b.subarray(0, 6).toString('latin1') === 'GIF87a' ||
      b.subarray(0, 6).toString('latin1') === 'GIF89a')
  )
    return 'gif';
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'webp';
  return null;
}

export interface ProcessedImage {
  data: Buffer;
  ext: 'webp' | 'gif';
  mime: 'image/webp' | 'image/gif';
  width: number;
  height: number;
}
/**
 * Dekodiert das Bild und kodiert es neu: Metadaten (EXIF/GPS) und eingebettete Nutzlasten entfallen, die Größe wird auf
 * 2560 px begrenzt, Fotos/Grafiken werden zu WebP (GIFs bleiben GIF, damit Animationen erhalten bleiben).
 */
export async function processImage(input: Buffer, kind: ImageKind): Promise<ProcessedImage> {
  try {
    const base = sharp(input, {
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: kind === 'gif' || kind === 'webp',
      failOn: 'error',
    });
    const meta = await base.metadata();
    if (!meta.width || !meta.height) throw new Error('Keine Bildgröße');
    const pipeline = base.rotate().resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    });
    const animated = (meta.pages ?? 1) > 1;
    const out =
      kind === 'gif'
        ? await pipeline.gif().toBuffer({ resolveWithObject: true })
        : await pipeline.webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
    const height = animated && out.info.pageHeight ? out.info.pageHeight : out.info.height;
    return {
      data: out.data,
      ext: kind === 'gif' ? 'gif' : 'webp',
      mime: kind === 'gif' ? 'image/gif' : 'image/webp',
      width: out.info.width,
      height,
    };
  } catch {
    throw new DesignError('invalid', 'Die Bilddatei ist beschädigt oder zu groß.');
  }
}

export const storageDir = () =>
  path.resolve(process.env['STORAGE_DIR'] ?? path.join(process.cwd(), 'data', 'uploads'));
export const assetUrl = (guildId: string, file: string) => `/uploads/${guildId}/${file}`;
const cleanName = (n: string) =>
  [...n.normalize('NFC')]
    .filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127)
    .join('')
    .replace(/[\\/]+/g, '_')
    .slice(0, 80) || 'bild';

export interface AssetInfo {
  id: string;
  url: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
  createdAt: Date;
}
const info = (a: {
  id: string;
  guildId: string;
  file: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  originalName: string;
  createdAt: Date;
}): AssetInfo => ({
  id: a.id,
  url: assetUrl(a.guildId, a.file),
  mime: a.mime,
  bytes: a.bytes,
  width: a.width,
  height: a.height,
  originalName: a.originalName,
  createdAt: a.createdAt,
});

export async function saveAsset(i: {
  guildId: string;
  actorId: string;
  bytes: Buffer;
  originalName?: string;
}): Promise<AssetInfo> {
  const gid = assertGuildId(i.guildId);
  if (i.bytes.length === 0) throw new DesignError('invalid', 'Die Datei ist leer.');
  if (i.bytes.length > MAX_UPLOAD_BYTES)
    throw new DesignError(
      'invalid',
      `Die Datei ist zu groß (höchstens ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
    );
  const kind = sniffImage(i.bytes);
  if (!kind) throw new DesignError('invalid', 'Nur Bilder (PNG, JPEG, GIF, WebP) sind erlaubt.');
  const guild = await prisma.guild.findUnique({ where: { id: gid }, select: { id: true } });
  if (!guild) throw new DesignError('not-found', 'Server nicht gefunden.');
  const used = await prisma.dashboardAsset.aggregate({
    where: { guildId: gid },
    _count: { _all: true },
    _sum: { bytes: true },
  });
  if (used._count._all >= MAX_ASSETS)
    throw new DesignError(
      'conflict',
      `Mehr als ${MAX_ASSETS} Bilder sind nicht möglich – bitte nicht mehr benötigte löschen.`,
    );
  const img = await processImage(i.bytes, kind);
  if ((used._sum.bytes ?? 0) + img.data.length > MAX_ASSET_TOTAL_BYTES)
    throw new DesignError(
      'conflict',
      'Der Speicherplatz für Bilder ist voll – bitte nicht mehr benötigte löschen.',
    );

  const id = randomBytes(12).toString('hex');
  const file = `${id}.${img.ext}`;
  const dir = path.join(storageDir(), gid);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), img.data, { mode: 0o640 });
  try {
    const row = await prisma.dashboardAsset.create({
      data: {
        id,
        guildId: gid,
        file,
        mime: img.mime,
        bytes: img.data.length,
        width: img.width,
        height: img.height,
        originalName: cleanName(i.originalName ?? ''),
        createdBy: i.actorId,
      },
    });
    await auditRepository.createRaw({
      data: {
        guildId: gid,
        actorType: 'USER',
        actorId: i.actorId,
        action: 'design.asset.uploaded',
        resourceType: 'DashboardAsset',
        resourceId: id,
        after: { name: row.originalName, bytes: row.bytes, width: row.width, height: row.height },
        permission: 'design.edit',
        result: 'success',
      },
    });
    return info(row);
  } catch (e) {
    await rm(path.join(dir, file), { force: true });
    throw e;
  }
}

export async function listAssets(
  guildId: string,
): Promise<{ assets: AssetInfo[]; usedBytes: number; maxBytes: number; maxFiles: number }> {
  const gid = assertGuildId(guildId);
  const rows = await prisma.dashboardAsset.findMany({
    where: { guildId: gid },
    orderBy: { createdAt: 'desc' },
  });
  return {
    assets: rows.map(info),
    usedBytes: rows.reduce((s, r) => s + r.bytes, 0),
    maxBytes: MAX_ASSET_TOTAL_BYTES,
    maxFiles: MAX_ASSETS,
  };
}

export async function deleteAsset(guildId: string, id: string, actorId: string): Promise<void> {
  const gid = assertGuildId(guildId);
  const row = await prisma.dashboardAsset.findFirst({ where: { id, guildId: gid } }); // Servertrennung: nur eigene Bilder
  if (!row) throw new DesignError('not-found', 'Bild nicht gefunden.');
  await prisma.dashboardAsset.delete({ where: { id: row.id } });
  await rm(path.join(storageDir(), gid, row.file), { force: true });
  await auditRepository.createRaw({
    data: {
      guildId: gid,
      actorType: 'USER',
      actorId,
      action: 'design.asset.deleted',
      resourceType: 'DashboardAsset',
      resourceId: id,
      before: { name: row.originalName },
      permission: 'design.edit',
      result: 'success',
    },
  });
}
