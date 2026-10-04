import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import express from 'express';
import { DesignError, MAX_UPLOAD_BYTES } from '@nexus/design';

/** Liest den Anfrage-Körper bis höchstens `max` Bytes; bricht bei Überschreitung sofort ab (kein Puffern beliebig großer Uploads). */
export function readBody(req: Request, max: number = MAX_UPLOAD_BYTES + 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > max) {
      reject(
        new DesignError(
          'invalid',
          `Die Datei ist zu groß (höchstens ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
        ),
      );
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        req.destroy();
        reject(
          new DesignError(
            'invalid',
            `Die Datei ist zu groß (höchstens ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Liefert hochgeladene Bilder unter `/uploads/<server>/<datei>` aus. Nur Dateien aus dem Speicherordner; keine
 * Verzeichnislisten, keine versteckten Dateien. Die Adressen enthalten eine zufällige ID und sind unveränderlich
 * (lange Zwischenspeicherung). `nosniff` und eine leere CSP verhindern, dass ein Browser etwas anderes als ein Bild daraus macht.
 */
export function uploadsMiddleware(storageDir: string): RequestHandler {
  const files = express.static(path.resolve(storageDir), {
    index: false,
    dotfiles: 'ignore',
    redirect: false,
    fallthrough: false,
    maxAge: '365d',
    immutable: true,
    extensions: false,
  });
  return (req: Request, res: Response, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).end();
      return;
    }
    if (!/^\/[0-9A-Za-z_-]{1,64}\/[0-9a-f]{24}\.(webp|gif)$/.test(req.path)) {
      res.status(404).end(); // andere Pfade (auch Verzeichnisse, „..“) gibt es nicht
      return;
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // das Dashboard liegt unter einer anderen Adresse
    res.setHeader('Content-Disposition', 'inline');
    files(req, res, (err?: unknown) => {
      if (err) res.status(404).end();
      else next();
    });
  };
}
