import { describe, expect, it } from 'vitest';
import { logCategoryOf, logChannelFor, logTypeLabel, loggingConfigSchema } from '../src/logging';

const CH = '700000000000000001', CH2 = '700000000000000002';
describe('Logging', () => {
  it('readable type names', () => {
    expect(logTypeLabel('cad.incident.create')).toBe('Einsatz angelegt');
    expect(logTypeLabel('application.accepted')).toBe('Bewerbung angenommen');
    expect(logTypeLabel('dutyreport.return')).toBe('Tages-/Wochenbericht zur Nachbesserung');
    expect(logTypeLabel('foo.bar')).toBe('foo bar');
  });
  it('channel: category, type override, off, default off, disabled', () => {
    const cfg = loggingConfigSchema.parse({ categories: { einsaetze: CH }, types: { 'cad.radio': 'off', 'cad.incident.create': CH2, 'personnel.read': 'on' } });
    expect(logCategoryOf('cad')).toBe('einsaetze');
    expect(logChannelFor(cfg, 'cad', 'cad.unit.status')).toBe(CH);
    expect(logChannelFor(cfg, 'cad', 'cad.incident.create')).toBe(CH2);
    expect(logChannelFor(cfg, 'cad', 'cad.radio')).toBeNull();
    expect(logChannelFor(cfg, 'persons', 'person.create')).toBeNull(); // Kategorie ohne Kanal
    expect(logChannelFor({ ...cfg, categories: { personal: CH } }, 'personnel', 'personnel.read')).toBe(CH); // ausdrücklich an
    expect(logChannelFor({ ...cfg, types: {}, categories: { personal: CH } }, 'personnel', 'personnel.read')).toBeNull(); // standardmäßig aus
    expect(logChannelFor({ ...cfg, enabled: false }, 'cad', 'cad.unit.status')).toBeNull();
  });
});
