import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from '../src/components/DataTable';

afterEach(() => vi.unstubAllGlobals());
const desktop = () => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
const columns = [{ key: 'name', label: 'Name' }];
const many = Array.from({ length: 500 }, (_, i) => ({ id: String(i), name: `Person ${i}` }));

describe('large table pages', () => {
  it('render only the visible rows (virtualized) from 60 rows on', () => {
    desktop();
    render(<DataTable columns={columns} rows={many} total={500} page={1} pageSize={500} onPage={() => undefined} loading={false} empty={{ text: '-' }} />);
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeLessThan(100);
    expect(screen.getByRole('table').getAttribute('aria-rowcount')).toBe('501');
  });
  it('small pages stay a plain table', () => {
    desktop();
    render(<DataTable columns={columns} rows={many.slice(0, 25)} total={500} page={1} pageSize={25} onPage={() => undefined} loading={false} empty={{ text: '-' }} />);
    expect(screen.getAllByRole('row')).toHaveLength(26);
  });
  it('lets the user pick rows per page', async () => {
    desktop();
    const pick = vi.fn();
    render(<DataTable columns={columns} rows={many.slice(0, 25)} total={500} page={1} pageSize={25} onPage={() => undefined} onPageSize={pick} loading={false} empty={{ text: '-' }} />);
    await userEvent.selectOptions(screen.getByLabelText('Zeilen pro Seite'), '250');
    expect(pick).toHaveBeenCalledWith(250);
  });
});
