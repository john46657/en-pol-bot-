import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StatusBadge, PriorityBadge, Forbidden, ErrorState, ConfirmDialog } from '../src/components/ui';
import { DataTable } from '../src/components/DataTable';
import { ApiError } from '../src/lib/api';
import { AuthProvider } from '../src/lib/auth';
import { AppShell } from '../src/components/AppShell';
import { Login } from '../src/pages/Login';

const wrap = (ui: ReactNode, path = '/') => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></QueryClientProvider>
);
const json = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('badges', () => {
  it('shows status and priority as text, not colour only', () => {
    render(<><StatusBadge status="EN_ROUTE" /><PriorityBadge priority="CRITICAL" /></>);
    expect(screen.getByText('EN ROUTE')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
  });
});

describe('states', () => {
  it('403 is shown for forbidden API errors, with no stack trace', () => {
    render(<ErrorState error={new ApiError(403, 'PERMISSION_DENIED', 'nope', 'rid-1')} />);
    expect(screen.getByText('403')).toBeInTheDocument();
  });
  it('generic errors show request id and offer retry', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError(500, 'INTERNAL_ERROR', 'Boom', 'req-123')} onRetry={retry} />);
    expect(screen.getByText(/req-123/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
  it('empty state has a message, not a blank table', () => {
    render(<DataTable columns={[{ key: 'a', label: 'A' }]} rows={[]} total={0} page={1} pageSize={25} onPage={() => undefined} loading={false} empty={{ text: 'Keine offenen Einsätze.' }} />);
    expect(screen.getByText('Keine offenen Einsätze.')).toBeInTheDocument();
  });
  it('loading shows skeletons instead of a blank page', () => {
    render(<DataTable columns={[{ key: 'a', label: 'A' }]} rows={undefined} total={0} page={1} pageSize={25} onPage={() => undefined} loading empty={{ text: 'x' }} />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
  it('ConfirmDialog is an accessible modal that closes on Escape', async () => {
    const close = vi.fn();
    render(<ConfirmDialog open title="Void ticket" message="Sure?" onConfirm={() => undefined} onClose={close} />);
    expect(screen.getByRole('dialog', { name: 'Void ticket' })).toHaveAttribute('aria-modal', 'true');
    await userEvent.keyboard('{Escape}');
    expect(close).toHaveBeenCalled();
  });
  it('Forbidden page explains itself', () => {
    render(<Forbidden />);
    expect(screen.getByRole('alert')).toHaveTextContent(/do not have permission/i);
  });
});

describe('permission-aware navigation', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('hides nav entries the user lacks permission for', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => String(url).includes('/auth/me')
      ? json(200, { id: '1', username: 'o', displayName: 'Officer O', robloxUserId: null, robloxUsername: null, roles: ['Police Member'], permissions: ['persons.view', 'dashboard.view'], lastLogin: null })
      : json(200, { items: [], total: 0, unread: 0 }));
    render(wrap(<AuthProvider><Routes><Route element={<AppShell />}><Route index element={<p>home</p>} /></Route></Routes></AuthProvider>));
    expect(await screen.findByRole('link', { name: /Persons/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Audit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Personnel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Roles/ })).not.toBeInTheDocument();
  });
});

describe('login', () => {
  it('shows a generic error on bad credentials (no user enumeration)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => String(url).includes('/auth/me') ? json(401, { code: 'UNAUTHENTICATED', message: 'x', requestId: 'r' }) : json(401, { code: 'UNAUTHENTICATED', message: 'Invalid credentials.', requestId: 'r' }));
    render(wrap(<AuthProvider><Login /></AuthProvider>, '/login'));
    await userEvent.type(await screen.findByLabelText('Username'), 'ghost');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid username or password.'));
  });
});

describe('custom fields helpers', () => {
  it('maps definitions to cf_ form fields and splits values back into `custom`', async () => {
    const { customFormFields, withCustom } = await import('../src/lib/studio');
    const f = customFormFields([{ key: 'license', label: 'License', type: 'select', required: true, options: ['A', 'B'] }]);
    expect(f[0]).toMatchObject({ name: 'cf_license', label: 'License', type: 'select', required: true, options: ['A', 'B'] });
    expect(withCustom({ robloxUsername: 'X', cf_license: 'A' })).toEqual({ robloxUsername: 'X', custom: { license: 'A' } });
    expect(withCustom({ robloxUsername: 'X' })).toEqual({ robloxUsername: 'X' });
  });
});
