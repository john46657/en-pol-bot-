import { describe, expect, it } from 'vitest';
import { imageSize } from '../src/cad/map-image';

describe('Kartenbild: Bildgröße aus dem Dateikopf', () => {
  it('PNG', () => {
    const b = Buffer.alloc(32); b.writeUInt32BE(0x89504e47, 0); b.writeUInt32BE(5355, 16); b.writeUInt32BE(4096, 20);
    expect(imageSize(b)).toEqual({ width: 5355, height: 4096 });
  });
  it('JPEG (SOF0)', () => {
    const b = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x03, 0x00, 0x03, 0, 0, 0, 0]);
    expect(imageSize(b)).toEqual({ width: 768, height: 512 });
  });
  it('unbekannt → null', () => expect(imageSize(Buffer.from('<html></html>'))).toBeNull());
});
