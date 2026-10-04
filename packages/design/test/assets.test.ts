import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { prisma } from '@nexus/database';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DesignError,
  MAX_ASSETS,
  deleteAsset,
  listAssets,
  processImage,
  saveAsset,
  sniffImage,
  storageDir,
} from '../src/index.js';

const dir = mkdtempSync(path.join(tmpdir(), 'nexus-assets-'));
process.env['STORAGE_DIR'] = dir;
const [A, B] = ['astest-a', 'astest-b'];
const ACTOR = '900000000000880001';
const err = (p: Promise<unknown>, code: string) =>
  expect(p).rejects.toSatisfy((e) => e instanceof DesignError && e.code === code);

const png = (w = 40, h = 30) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
  })
    .png()
    .toBuffer();
const jpeg = (w = 40, h = 30) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 80, b: 200 } } })
    .jpeg()
    .toBuffer();

beforeEach(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  for (const id of [A, B])
    await prisma.guild.create({ data: { id, name: id, settings: { create: {} } } });
});
afterAll(async () => {
  await prisma.guild.deleteMany({ where: { id: { in: [A, B] } } });
  await prisma.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe('Formaterkennung (Dateikopf, nicht Name/Typ)', () => {
  it('erkennt PNG, JPEG, GIF, WebP', async () => {
    expect(sniffImage(await png())).toBe('png');
    expect(sniffImage(await jpeg())).toBe('jpeg');
    expect(sniffImage(Buffer.from('GIF89a......'))).toBe('gif');
    expect(
      sniffImage(
        await sharp(await png())
          .webp()
          .toBuffer(),
      ),
    ).toBe('webp');
  });
  it('lehnt alles andere ab: SVG, HTML, Skripte, Programme, Archive, PDF, leer', () => {
    const samples: Record<string, Buffer> = {
      svg: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      html: Buffer.from('<!doctype html><script>alert(1)</script>'),
      js: Buffer.from('alert(1)'),
      exe: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03]),
      elf: Buffer.from([0x7f, 0x45, 0x4c, 0x46]),
      zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      pdf: Buffer.from('%PDF-1.7'),
      leer: Buffer.alloc(0),
      riffAvi: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('AVI ')]),
    };
    for (const [name, b] of Object.entries(samples)) expect(sniffImage(b), name).toBeNull();
  });
});

describe('Neu-Kodierung', () => {
  it('PNG/JPEG werden zu WebP; große Bilder werden auf 2560 px begrenzt, kleine nicht vergrößert', async () => {
    const small = await processImage(await png(), 'png');
    expect(small).toMatchObject({ ext: 'webp', mime: 'image/webp', width: 40, height: 30 });
    expect(sniffImage(small.data)).toBe('webp');
    const big = await processImage(await jpeg(4000, 1000), 'jpeg');
    expect(big.width).toBe(2560);
    expect(big.height).toBe(640);
  });
  it('Metadaten (EXIF) werden entfernt', async () => {
    const withExif = await sharp(await jpeg())
      .withMetadata({ exif: { IFD0: { Copyright: 'GEHEIM-COPYRIGHT' } } })
      .jpeg()
      .toBuffer();
    expect(withExif.toString('latin1')).toContain('GEHEIM-COPYRIGHT');
    const out = await processImage(withExif, 'jpeg');
    expect(out.data.toString('latin1')).not.toContain('GEHEIM-COPYRIGHT');
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
  });
  it('angehängte Nutzlast (Polyglot) überlebt die Neu-Kodierung nicht', async () => {
    const poisoned = Buffer.concat([
      await png(),
      Buffer.from('<script>alert("x")</script>MZ-PAYLOAD'),
    ]);
    expect(sniffImage(poisoned)).toBe('png'); // sieht wie ein PNG aus …
    const out = await processImage(poisoned, 'png');
    expect(out.data.toString('latin1')).not.toContain('<script>');
    expect(out.data.toString('latin1')).not.toContain('MZ-PAYLOAD');
  });
  it('GIF bleibt GIF', async () => {
    const gif = await sharp(await png())
      .gif()
      .toBuffer();
    expect(sniffImage(gif)).toBe('gif');
    expect(await processImage(gif, 'gif')).toMatchObject({ ext: 'gif', mime: 'image/gif' });
  });
  it('kaputte und übergroße (Dekompressionsbombe) Bilder werden abgelehnt', async () => {
    await err(
      processImage(Buffer.concat([(await png()).subarray(0, 40), Buffer.from('kaputt')]), 'png'),
      'invalid',
    );
    const bomb = await sharp({
      create: { width: 7000, height: 7000, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024); // klein als Datei …
    await err(processImage(bomb, 'png'), 'invalid'); // … aber 49 Mio. Pixel
  }, 60_000);
});

describe('Speichern je Server', () => {
  it('speichert Datei + Eintrag, getrennt nach Server, mit Audit', async () => {
    const a = await saveAsset({
      guildId: A,
      actorId: ACTOR,
      bytes: await png(),
      originalName: '../../etc/passwd',
    });
    expect(a.url).toMatch(new RegExp(`^/uploads/${A}/[0-9a-f]{24}\\.webp$`));
    expect(a.originalName).not.toContain('/');
    const file = path.join(storageDir(), A, a.url.split('/').pop()!);
    expect(existsSync(file)).toBe(true);
    expect(sniffImage(readFileSync(file))).toBe('webp');
    expect((await listAssets(A)).assets.map((x) => x.id)).toEqual([a.id]);
    expect((await listAssets(B)).assets).toEqual([]);
    const audit = await prisma.auditLog.findMany({
      where: { guildId: A, action: 'design.asset.uploaded' },
    });
    expect(audit).toHaveLength(1);
  });
  it('lehnt SVG, leere und zu große Dateien ab', async () => {
    await err(
      saveAsset({ guildId: A, actorId: ACTOR, bytes: Buffer.from('<svg onload=alert(1)>') }),
      'invalid',
    );
    await err(saveAsset({ guildId: A, actorId: ACTOR, bytes: Buffer.alloc(0) }), 'invalid');
    await err(
      saveAsset({
        guildId: A,
        actorId: ACTOR,
        bytes: Buffer.concat([await png(), Buffer.alloc(6 * 1024 * 1024)]),
      }),
      'invalid',
    );
    expect((await listAssets(A)).assets).toHaveLength(0);
  });
  it('Servertrennung beim Löschen; Löschen entfernt Datei und Eintrag', async () => {
    const a = await saveAsset({ guildId: A, actorId: ACTOR, bytes: await png() });
    await err(deleteAsset(B, a.id, ACTOR), 'not-found');
    const file = path.join(storageDir(), A, a.url.split('/').pop()!);
    expect(existsSync(file)).toBe(true);
    await deleteAsset(A, a.id, ACTOR);
    expect(existsSync(file)).toBe(false);
    expect((await listAssets(A)).assets).toEqual([]);
    await err(deleteAsset(A, a.id, ACTOR), 'not-found');
  });
  it('Kontingent: höchstens 100 Bilder je Server', async () => {
    await prisma.dashboardAsset.createMany({
      data: Array.from({ length: MAX_ASSETS }, (_, i) => ({
        id: `q${String(i).padStart(23, '0')}`,
        guildId: A,
        file: `f${i}.webp`,
        mime: 'image/webp',
        bytes: 10,
        width: 1,
        height: 1,
        originalName: 'x',
      })),
    });
    await err(saveAsset({ guildId: A, actorId: ACTOR, bytes: await png() }), 'conflict');
    expect((await saveAsset({ guildId: B, actorId: ACTOR, bytes: await png() })).id).toBeTruthy(); // anderer Server unberührt
  });
  it('unbekannter Server', async () => {
    await err(
      saveAsset({ guildId: 'gibts-nicht', actorId: ACTOR, bytes: await png() }),
      'not-found',
    );
  });
});
