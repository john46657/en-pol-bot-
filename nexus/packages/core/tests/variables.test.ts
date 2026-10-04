import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../src/index.js';

describe('Variablen-Renderer (§59)', () => {
  it('ersetzt einfache Variablen', () => {
    const out = renderTemplate('Hallo {username}, deine Bewerbung {applicationName}!', {
      username: 'john',
      applicationName: 'Polizei Bewerbung',
    });
    expect(out).toBe('Hallo john, deine Bewerbung Polizei Bewerbung!');
  });

  it('{user} → Mention, Fallback username', () => {
    expect(renderTemplate('Hi {user}!', { userMention: '<@123>', username: 'john' })).toBe(
      'Hi <@123>!',
    );
    expect(renderTemplate('Hi {user}!', { username: 'john' })).toBe('Hi john!');
  });

  it('ersetzt {answer.<questionId>} und Arrays kommagetrennt', () => {
    expect(renderTemplate('Du hast {answer.alter} angegeben.', { answers: { alter: '21' } })).toBe(
      'Du hast 21 angegeben.',
    );
    expect(
      renderTemplate('Auswahl: {answers.interessen}', {
        answers: { interessen: ['Polizei', 'Medic'] },
      }),
    ).toBe('Auswahl: Polizei, Medic');
  });

  it('lässt unbekannte Variablen unverändert', () => {
    expect(renderTemplate('Hallo {gibtsnicht}', {})).toBe('Hallo {gibtsnicht}');
  });

  it('verarbeitet leere/undefined Templates', () => {
    expect(renderTemplate(undefined, {})).toBe('');
    expect(renderTemplate('', {})).toBe('');
  });

  it('verarbeitet mehrere Variablen in einem Text', () => {
    const out = renderTemplate('{guildId}:{userId}:{status}', {
      guildId: 'g1',
      userId: 'u1',
      status: 'ACCEPTED',
    });
    expect(out).toBe('g1:u1:ACCEPTED');
  });
});
