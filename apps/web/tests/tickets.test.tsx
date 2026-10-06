import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscordPreview } from '../src/components/DiscordPreview';
import { fromHex, hex, idsFromText } from '../src/lib/tickets';

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
});
