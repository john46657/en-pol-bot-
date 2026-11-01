import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

let perms: string[] = [];
vi.mock('../src/lib/auth', () => ({ useAuth: () => ({ can: (p: string) => perms.includes(p), logout: vi.fn() }) }));
const { AppSwitcher, appOf } = await import('../src/components/AppSwitcher');
const show = (path: string) => render(<MemoryRouter initialEntries={[path]}><AppSwitcher /></MemoryRouter>);

describe('App-Umschalter Dashboard · MDT · Leitstelle', () => {
  it('shows only the apps the user may open and marks the current one', () => {
    perms = ['dashboard.view', 'cad.view', 'dashboard.cad.view'];
    show('/cad/units');
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/dashboard', '/mdt', '/cad']);
    expect(links[2]!.getAttribute('aria-current')).toBe('page');
  });
  it('hides the Leitstelle without CAD rights and itself with only one app', () => {
    perms = ['dashboard.view'];
    show('/mdt');
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(['/dashboard', '/mdt']);
  });
  it('maps paths to apps', () => {
    expect([appOf('/mdt'), appOf('/mdt/citizens'), appOf('/cad'), appOf('/cadx'), appOf('/persons')]).toEqual(['mdt', 'mdt', 'cad', 'dashboard', 'dashboard']);
  });
});
