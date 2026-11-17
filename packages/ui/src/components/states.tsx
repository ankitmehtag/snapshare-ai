import { AlertTriangle, Inbox, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

interface StateProps {
  title: string;
  /** Use 'h1' when the state is the whole page (e.g. not-found). */
  headingLevel?: 'h1' | 'h2';
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

function StateLayout({
  icon,
  title,
  description,
  action,
  className,
  role,
  headingLevel: Heading = 'h2',
}: StateProps & { icon: ReactNode; role?: 'alert' | 'status' }) {
  return (
    <div
      role={role}
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-muted text-muted-foreground [&_svg]:size-6">
        {icon}
      </div>
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Nothing to show yet. Always offer the next useful action when there is one. */
export function EmptyState({ icon, ...props }: StateProps & { icon?: ReactNode }) {
  return <StateLayout icon={icon ?? <Inbox aria-hidden="true" />} {...props} />;
}

/** Something failed. Shows a retry button when `onRetry` is given. */
export function ErrorState({
  title = 'Something went wrong',
  description = 'Please try again. If it keeps happening, contact support.',
  onRetry,
  requestId,
  className,
}: Partial<StateProps> & { onRetry?: () => void; requestId?: string }) {
  return (
    <StateLayout
      role="alert"
      icon={<AlertTriangle aria-hidden="true" />}
      title={title}
      description={
        <>
          {description}
          {requestId ? (
            <span className="mt-2 block font-mono text-xs">Reference: {requestId}</span>
          ) : null}
        </>
      }
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
      {...(className ? { className } : {})}
    />
  );
}

/** No access (or the resource does not exist — the API returns 404 for both). */
export function Forbidden({
  title = 'You don’t have access to this page',
  description = 'Ask the workspace owner for access, or switch to another workspace.',
  action,
}: Partial<StateProps>) {
  return (
    <StateLayout
      icon={<Lock aria-hidden="true" />}
      title={title}
      description={description}
      action={action}
    />
  );
}
