import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary, isChunkLoadError } from '../src/components/ErrorBoundary';

const Boom = ({ msg }: { msg: string }): never => { throw new Error(msg); };

describe('ErrorBoundary', () => {
  it('zeigt eine Meldung statt einer leeren Seite und erholt sich nach dem Navigieren', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(<ErrorBoundary resetKey="/a"><Boom msg="kaputt" /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('Diese Seite konnte nicht angezeigt werden');
    expect(screen.getByText('kaputt')).toBeInTheDocument();
    rerender(<ErrorBoundary resetKey="/b"><p>wieder da</p></ErrorBoundary>);
    expect(screen.getByText('wieder da')).toBeInTheDocument();
    spy.mockRestore();
  });

  it('erkennt fehlende Seiten-Dateien nach einem Update', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Settings-abc.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('x is undefined'))).toBe(false);
  });
});
