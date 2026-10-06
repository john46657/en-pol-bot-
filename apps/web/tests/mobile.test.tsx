import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../src/components/DataTable';

const mockWidth = (phone: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone && q.includes('max-width'), media: q, addEventListener() {}, removeEventListener() {} }));
afterEach(() => vi.unstubAllGlobals());

const columns = [{ key: 'name', label: 'Roblox username' }, { key: 'status', label: 'Status' }];
const rows = [{ id: '1', name: 'Alex_Racer', status: 'ACTIVE' }, { id: '2', name: 'Bella_Banks', status: 'ARCHIVED' }];
const props = { columns, rows, total: 2, page: 1, pageSize: 25, onPage: () => undefined, loading: false, empty: { text: 'No rows.' } };

describe('data tables on phones', () => {
  it('render each row as a tappable card with labels instead of a cramped table', async () => {
    mockWidth(true);
    const click = vi.fn();
    render(<DataTable {...props} onRowClick={click} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getAllByText('Status')).toHaveLength(2); // Beschriftung je Karte
    await userEvent.click(screen.getByRole('button', { name: /Bella_Banks/ }));
    expect(click).toHaveBeenCalledWith(rows[1]);
  });
  it('keep the table on tablets and desktops', () => {
    mockWidth(false);
    render(<DataTable {...props} />);
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });
});
