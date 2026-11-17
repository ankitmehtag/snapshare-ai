import { cn } from '../lib/cn';

/** Placeholder wordmark until the brand decision (ARCHITECTURAL_GAPS G12). */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 shrink-0">
        <rect width="24" height="24" rx="7" className="fill-primary" />
        <circle
          cx="12"
          cy="12.5"
          r="4.5"
          className="fill-none stroke-primary-foreground"
          strokeWidth="2"
        />
        <circle cx="17.5" cy="7" r="1.3" className="fill-accent" />
      </svg>
      {compact ? <span className="sr-only">SnapShare</span> : <span>SnapShare</span>}
    </span>
  );
}
