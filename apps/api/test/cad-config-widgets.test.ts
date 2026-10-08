import { describe, expect, it } from 'vitest';
import { DEFAULT_CAD_CONFIG } from '@enrp/shared';
import { cadConfigSchema } from '../src/cad/cad-config.service';

describe('CAD-Konfiguration: Startseiten-Kacheln', () => {
  it('entfernte Kacheln aus älteren Einstellungen werden verworfen, der Rest bleibt gültig', () => {
    const r = cadConfigSchema.safeParse({ ...DEFAULT_CAD_CONFIG, widgets: ['activeIncidents', 'erlcPlayers', 'erlcQueue', 'staffOnline', 'map'] });
    expect(r.success).toBe(true);
    expect(r.data?.widgets).toEqual(['activeIncidents', 'map']);
  });
});
