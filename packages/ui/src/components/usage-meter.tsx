import { cn } from '../lib/cn';

export interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  format?: (n: number) => string;
}

/** Plan usage (storage, AI photos, seats). Turns amber at 80 % and red at 100 %. */
export function UsageMeter({ label, used, limit, format = String }: UsageMeterProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-primary';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {format(used)} / {format(limit)}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        aria-valuetext={`${pct}%`}
        className="h-2 overflow-hidden rounded-full bg-surface-muted"
      >
        <div
          className={cn('h-full rounded-full transition-[width]', tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
