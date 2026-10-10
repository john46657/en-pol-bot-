import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

afterEach(() => vi.restoreAllMocks());
function Boom({ fail }: { fail: boolean }) { if (fail) throw new Error('kaputte Daten'); return <p>Seite ok</p>; }

describe('Absturz-Schutz', () => {
  it('shows a message only where the error happened; retry and page change reset it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function Host() {
      const [fail, setFail] = useState(true);
      const [path, setPath] = useState('/a');
      return (
        <>
          <p>Menü bleibt</p>
          <button type="button" onClick={() => setFail(false)}>reparieren</button>
          <button type="button" onClick={() => setPath('/b')}>andere Seite</button>
          <ErrorBoundary resetKey={path}><Boom fail={fail} /></ErrorBoundary>
        </>
      );
    }
    const u = userEvent.setup();
    render(<Host />);
    expect(screen.getByRole('alert').textContent).toContain('Diese Seite konnte nicht angezeigt werden');
    expect(screen.getByRole('alert').textContent).toContain('kaputte Daten');
    expect(screen.getByText('Menü bleibt')).toBeTruthy(); // Rest des Dashboards läuft weiter
    await u.click(screen.getByRole('button', { name: 'reparieren' }));
    await u.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(screen.getByText('Seite ok')).toBeTruthy();
  });

  it('after an update (missing page file) it reloads once instead of showing an error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    function Old(): never { throw new TypeError('Failed to fetch dynamically imported module: /assets/Settings-abc.js'); }
    render(<ErrorBoundary><Old /></ErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('alert').textContent).toContain('Das Dashboard wurde aktualisiert');
    vi.unstubAllGlobals();
  });
});
