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

describe('CAD-Konfiguration: Discord-Zuordnungen', () => {
  it('Zuordnungen zu entfernten Ereignissen werden verworfen, der Rest bleibt gültig', () => {
    const route = (event: string) => ({ id: event, guildId: '610000000000000001', event, channelIds: ['620000000000000001'], pingRoleIds: [], enabled: true });
    const r = cadConfigSchema.safeParse({ ...DEFAULT_CAD_CONFIG, routes: [route('incident.created'), route('air.requested')] });
    expect(r.success).toBe(true);
    expect(r.data?.routes.map((x) => x.event)).toEqual(['incident.created']);
  });
});
