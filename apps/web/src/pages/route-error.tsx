import { ErrorState } from '@snapshare/ui';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { NotFound } from './not-found';

/** Error boundary for every route: unexpected render errors never show a blank page. */
export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <ErrorState onRetry={() => window.location.reload()} />
    </div>
  );
}
