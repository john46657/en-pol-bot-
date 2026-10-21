import { describe, expect, it } from 'vitest';
import { checkBrandingImage, configAssetIds, defaultServerConfig, imageInfo, missingBotPermissions, readableTextOn, serverConfigSchema } from '../src';

/** Minimal gültige Dateiköpfe der drei Formate (nur so viel, wie zum Lesen der Maße nötig ist). */
export function png(w: number, h: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w); new DataView(b.buffer).setUint32(20, h);
  return b;
}
export function jpeg(w: number, h: number) {
  // SOI, APP0 (Länge 16), SOF0 mit Höhe/Breite
  const app0 = [0xff, 0xe0, 0x00, 0x10, ...Array(14).fill(0)];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, ...Array(9).fill(0)];
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}
export function webpX(w: number, h: number) {
  const b = new Uint8Array(40);
  b.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0); b.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8); b.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
  const W = w - 1, H = h - 1;
  b.set([W & 255, (W >> 8) & 255, (W >> 16) & 255], 24); b.set([H & 255, (H >> 8) & 255, (H >> 16) & 255], 27);
  return b;
}

describe('image header parsing', () => {
  it('reads real type and size of PNG, JPEG and WebP', () => {
    expect(imageInfo(png(512, 256))).toEqual({ mime: 'image/png', width: 512, height: 256 });
    expect(imageInfo(jpeg(1200, 300))).toEqual({ mime: 'image/jpeg', width: 1200, height: 300 });
    expect(imageInfo(webpX(1920, 1080))).toEqual({ mime: 'image/webp', width: 1920, height: 1080 });
  });
  it('rejects SVG, HTML, GIF and truncated files even with an image extension', () => {
    const t = (s: string) => new TextEncoder().encode(s);
    expect(imageInfo(t('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toBeNull();
    expect(imageInfo(t('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(imageInfo(t('GIF89a\x01\x00\x01\x00'))).toBeNull();
    expect(imageInfo(png(10, 10).subarray(0, 12))).toBeNull();
    expect(imageInfo(png(0, 10))).toBeNull();
  });
});

describe('branding rules', () => {
  it('checks type, file size, dimensions and aspect ratio per image kind', () => {
    expect(checkBrandingImage('logo', { mime: 'image/png', size: 1000, width: 256, height: 256 })).toBeNull();
    expect(checkBrandingImage('logo', { mime: 'image/gif', size: 1000, width: 256, height: 256 })).toContain('PNG, JPG oder WebP');
    expect(checkBrandingImage('logo', { mime: 'image/png', size: 3 * 1024 * 1024, width: 256, height: 256 })).toContain('zu groß');
    expect(checkBrandingImage('logo', { mime: 'image/png', size: 1000, width: 32, height: 32 })).toContain('zu klein');
    expect(checkBrandingImage('avatar', { mime: 'image/png', size: 1000, width: 400, height: 200 })).toContain('Seitenverhältnis');
    expect(checkBrandingImage('banner', { mime: 'image/webp', size: 1000, width: 1500, height: 300 })).toBeNull();
  });
  it('validates the stored configuration strictly (only own uploaded images, colors as #rrggbb, no unknown fields)', () => {
    const c = defaultServerConfig('EN Polizei Emden');
    expect(c.design).toMatchObject({ mode: 'user', primary: '#1e3a8a' });
    expect(serverConfigSchema.safeParse({ ...c, design: { ...c.design, primary: 'red' } }).success).toBe(false);
    expect(serverConfigSchema.safeParse({ ...c, branding: { ...c.branding, logo: 'https://evil.example/x.png' } }).success).toBe(false);
    expect(serverConfigSchema.safeParse({ ...c, extra: 1 }).success).toBe(false);
    expect(serverConfigSchema.safeParse({ ...c, general: { ...c.general, displayName: ' ' } }).success).toBe(false);
    const id = '11111111-1111-4111-8111-111111111111';
    expect(configAssetIds({ ...c, branding: { ...c.branding, logo: id, areas: { ...c.branding.areas, team: id } } })).toEqual([id, id]);
  });
  it('reports missing bot permissions (unknown, admin, missing)', () => {
    expect(missingBotPermissions(null)).toBeNull();
    expect(missingBotPermissions({ administrator: true })).toEqual([]);
    expect(missingBotPermissions({ viewChannel: true, sendMessages: true, embedLinks: true, attachFiles: true, readMessageHistory: true })).toEqual(['manageChannels', 'manageRoles']);
  });
  it('picks a readable text color', () => {
    expect(readableTextOn('#1e3a8a')).toBe('#ffffff');
    expect(readableTextOn('#fde047')).toBe('#111827');
  });
});
