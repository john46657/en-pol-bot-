import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useDocList } from '../src/lib/doclist';

describe('useDocList', () => {
  it('shows documents that are already cached (e.g. templates loaded by another tab) instead of loading forever', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    qc.setQueryData(['report-templates', ''], [{ id: 't1', name: 'Tagesbericht' }]);
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useDocList<{ id: string; name: string }>({ path: '/duty-reports/templates', key: 'report-templates', manage: false, valid: () => true, label: 'Vorlage' }), { wrapper });
    await waitFor(() => expect(result.current.docs).toEqual([{ id: 't1', name: 'Tagesbericht' }]));
  });
});
