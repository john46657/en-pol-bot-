import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscordPreview } from '../src/components/DiscordPreview';
import { ApiError } from '../src/lib/api';
import { errText, fromHex, hex, idsFromText, oneId } from '../src/lib/tickets';

describe('ticket panel preview', () => {
  it('shows embed, buttons and dropdown like Discord', () => {
    render(<DiscordPreview message={{ content: 'Hallo', embeds: [{ title: '🎫 Support', description: '**Wichtig:** bitte *kurz* `fassen`', color: 0x3b82f6, footer: 'EN Polizei' }], buttons: [{ id: 'a', label: 'Support', emoji: '🎫', style: 'primary' }], select: { id: 's', placeholder: 'Kategorie wählen', options: [{ label: 'Bewerbung', value: 'b', description: 'Fragen zur Bewerbung' }] } }} />);
    expect(screen.getByText('🎫 Support')).toBeTruthy();
    expect(screen.getByText('Wichtig:').tagName).toBe('STRONG');
    expect(screen.getByText('fassen').tagName).toBe('CODE');
    expect(screen.getByText('Support', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('Kategorie wählen')).toBeTruthy();
    expect(screen.getByText('Fragen zur Bewerbung')).toBeTruthy();
  });
  it('never renders texts as HTML and ignores non-https images', () => {
    const { container } = render(<DiscordPreview message={{ embeds: [{ description: '<img src=x onerror=alert(1)>', thumbnail: 'javascript:alert(1)', image: 'http://insecure/x.png' }] }} />);
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
  });
  it('helpers: colors and Discord ID lists', () => {
    expect(hex(0x3b82f6)).toBe('#3b82f6');
    expect(fromHex('#ef4444')).toBe(0xef4444);
    expect(idsFromText('1, 2;3\n 4')).toEqual(['1', '2', '3', '4']);
  });
  it('accepts Discord mentions and pasted IDs with spaces', () => {
    expect(idsFromText('<@&123456789012345678> <@&223456789012345678>,<#323456789012345678>')).toEqual(['123456789012345678', '223456789012345678', '323456789012345678']);
    expect(idsFromText('<@&123456789012345678><@&223456789012345678>')).toEqual(['123456789012345678', '223456789012345678']);
    expect(oneId('  <#1213940450260684801> ')).toBe('1213940450260684801');
    expect(oneId('   ')).toBeNull();
  });
  it('validation errors name the field instead of only „Request validation failed“', () => {
    const e = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed.', 'r1', [{ path: 'staffRoleIds.0', message: 'Discord ID (15–25 digits)' }, { path: 'questions.1.label', message: 'too short' }]);
    expect(errText(e)).toBe('Bitte prüfen: Team-Rollen (Eintrag 1): Discord ID (15–25 digits) · Frage 2 – Text: too short (Anfrage-ID r1)');
    expect(errText(new ApiError(409, 'CONFLICT', 'In use.'))).toBe('In use.');
    expect(errText(new ApiError(400, 'VALIDATION_FAILED', 'x', undefined, [{ path: 'police.settings.timeLimitMinutes', message: 'Number must be greater than or equal to 5' }]))).toBe('Bitte prüfen: Polizei-Bewerbung › Einstellungen › Zeitlimit: Number must be greater than or equal to 5');
  });
});
