import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WebBackendStatus } from '../components/WebBackendStatus';
import { getWebBackendHealth } from './webApi';


afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Django web API integration', () => {
  it('reads the live health endpoint through the development API proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ok', service: 'specforge-web', database: 'sqlite',
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getWebBackendHealth()).resolves.toMatchObject({ status: 'ok', database: 'sqlite' });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health/', expect.objectContaining({
      headers: { Accept: 'application/json' },
    }));
  });

  it('surfaces API errors using the standard error envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { status: 503, code: 'database_unavailable', message: 'Database is unavailable', details: null },
    }), { status: 503, headers: { 'content-type': 'application/json' } })));

    await expect(getWebBackendHealth()).rejects.toMatchObject({
      status: 503,
      message: 'Database is unavailable',
    });
  });

  it('renders loading and unavailable connection states and allows retry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><WebBackendStatus /></QueryClientProvider>);

    expect(screen.getByRole('status')).toHaveTextContent('Checking the hosted web API');
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('could not be reached'), { timeout: 3_000 });
    expect(screen.getByRole('button', { name: 'Check connection' })).toBeEnabled();
    queryClient.clear();
  });
});
