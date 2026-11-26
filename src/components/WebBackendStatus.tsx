import { useQuery } from '@tanstack/react-query';
import { getWebBackendHealth } from '../services/webApi';


export function WebBackendStatus() {
  const health = useQuery({
    queryKey: ['web-backend-health'],
    queryFn: getWebBackendHealth,
    retry: 1,
    refetchInterval: 60_000,
  });

  const message = health.isPending
    ? 'Checking the hosted web API…'
    : health.isError
      ? health.error.message
      : `Connected · ${health.data.database}`;

  return (
    <section className="web-api-status" aria-labelledby="web-api-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="eyebrow">WEB SERVICE</span>
          <h2 id="web-api-heading">Django API connection</h2>
          <p className="page-subheading" role="status" aria-live="polite">{message}</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void health.refetch()}
          disabled={health.isFetching}
        >
          {health.isFetching ? 'Checking…' : 'Check connection'}
        </button>
      </div>
    </section>
  );
}
