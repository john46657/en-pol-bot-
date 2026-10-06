import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../src/lib/auth';
import { Login } from '../src/pages/Login';

const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
const show = (providers: { discord: boolean; password: boolean }, path = '/login') => {
  vi.spyOn(globalThis, 'fetch').mockImplementation((url) => (String(url).includes('/auth/providers') ? json(200, providers) : json(401, { code: 'UNAUTHENTICATED', message: 'x' })));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><AuthProvider><Login /></AuthProvider></MemoryRouter></QueryClientProvider>);
};
afterEach(() => vi.restoreAllMocks());

describe('login page', () => {
  it('shows only “Mit Discord anmelden” once Discord login is set up', async () => {
    show({ discord: true, password: false }, '/login?discord=not_member');
    expect(await screen.findByRole('link', { name: /Mit Discord anmelden/ })).toHaveAttribute('href', '/api/v1/auth/discord');
    expect(screen.queryByLabelText('Password')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('nicht auf unserem Discord-Server');
  });
  it('keeps the password form while Discord is not set up (first setup)', async () => {
    show({ discord: false, password: true });
    expect(await screen.findByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mit Discord anmelden/ })).toBeNull();
  });
});
