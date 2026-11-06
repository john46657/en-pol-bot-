import { describe, expect, it } from 'vitest';
import { cooldownText, createCooldowns } from '../src/cooldown';
import { loadConfig } from '../src/config';

describe('Wartezeit je Nutzer und Befehl', () => {
  it('erlaubt den ersten Aufruf, sperrt Wiederholungen bis zum Ablauf und rundet die Restzeit auf', () => {
    let t = 1_000_000;
    const c = createCooldowns(3, () => t);
    expect(c.hit('u1', 'dienst')).toBeNull();
    t += 1_200;
    expect(c.hit('u1', 'dienst')).toBe(2);
    t += 1_800; // genau 3 s nach dem ersten Aufruf
    expect(c.hit('u1', 'dienst')).toBeNull();
  });

  it('trennt Nutzer und Befehle', () => {
    const c = createCooldowns(5, () => 0);
    expect(c.hit('u1', 'dienst')).toBeNull();
    expect(c.hit('u2', 'dienst')).toBeNull();
    expect(c.hit('u1', 'shift manage')).toBeNull();
    expect(c.hit('u1', 'dienst')).toBe(5);
  });

  it('0 Sekunden schaltet die Wartezeit aus', () => {
    const c = createCooldowns(0, () => 0);
    expect(c.hit('u1', 'x')).toBeNull();
    expect(c.hit('u1', 'x')).toBeNull();
  });

  it('wächst nicht unbegrenzt (abgelaufene bzw. älteste Einträge fallen weg)', () => {
    let t = 0;
    const c = createCooldowns(1, () => t);
    for (let i = 0; i < 10_050; i++) expect(c.hit(`u${i}`, 'x')).toBeNull();
    // der jüngste Eintrag ist noch gesperrt
    expect(c.hit('u10049', 'x')).toBe(1);
    t += 1_000;
    expect(c.hit('u10049', 'x')).toBeNull();
  });

  it('Text nennt Singular/Plural richtig', () => {
    expect(cooldownText(1)).toContain('1 Sekunde wieder');
    expect(cooldownText(3)).toContain('3 Sekunden');
  });

  it('Konfiguration: Standard 3 s, 0–60 erlaubt, sonst klare Fehlermeldung', () => {
    const base = { DISCORD_TOKEN: 'x'.repeat(30), BOT_API_TOKEN: 'y'.repeat(32) };
    expect(loadConfig(base).COMMAND_COOLDOWN_SECONDS).toBe(3);
    expect(loadConfig({ ...base, COMMAND_COOLDOWN_SECONDS: '0' }).COMMAND_COOLDOWN_SECONDS).toBe(0);
    expect(() => loadConfig({ ...base, COMMAND_COOLDOWN_SECONDS: '999' })).toThrow(/COMMAND_COOLDOWN_SECONDS/);
  });
});
