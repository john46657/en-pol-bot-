import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import express from 'express';

/**
 * Liefert das gebaute Dashboard (statische Dateien) aus der API aus, damit eine einzige Adresse genügt
 * (`DASHBOARD_STATIC_DIR`). Dateien aus `assets/` sind unveränderlich zwischengespeichert (Hash im Namen); jede andere
 * GET-Anfrage, die keine API-, Upload-, Doku- oder Health-Adresse ist, bekommt `index.html` (Routing im Browser).
 * Das Dashboard muss dafür mit leerer `VITE_API_URL` gebaut sein (gleiche Herkunft).
 */
const NOT_SPA = /^\/(api|uploads|docs|health)(\/|$)/;
const CSP = "default-src 'self'; img-src 'self' https://cdn.discordapp.com data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'";

export function dashboardStatic(dir: string): RequestHandler[] {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, 'index.html'))) throw new Error(`DASHBOARD_STATIC_DIR enthält keine index.html: ${root}`);
  const html = (res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
  };
  const files = express.static(root, {
    index: false,
    setHeaders: (res, file) => {
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else if (file.endsWith('.html')) html(res);
      else res.setHeader('Cache-Control', 'no-cache');
    },
  });
  const fallback: RequestHandler = (req: Request, res: Response, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || NOT_SPA.test(req.path) || path.extname(req.path)) return next();
    html(res);
    res.sendFile(path.join(root, 'index.html'));
  };
  return [files, fallback];
}
