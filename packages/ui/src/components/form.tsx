import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info } from 'lucide-react';
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useId,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from '../lib/cn';

const control =
  'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-60 aria-[invalid=true]:border-danger';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(control, 'pr-8', className)} {...props} />;
  },
);

/** Password input with a show/hide toggle (helps on phones; WCAG 3.3.8). */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { showLabel?: string; hideLabel?: string }
>(function PasswordInput(
  { className, showLabel = 'Show password', hideLabel = 'Hide password', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(control, 'pr-11', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground [&_svg]:size-4"
      >
        {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
      </button>
    </div>
  );
});

export interface FieldProps {
  label: ReactNode;
  /** The control; receives id, aria-describedby and aria-invalid automatically. */
  children: ReactElement<Record<string, unknown>>;
  hint?: ReactNode;
  error?: string | undefined;
  className?: string;
}

/** Label + control + hint + error, wired together for screen readers. */
export function Field({ label, children, hint, error, className }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const ALERT_TONES = {
  info: { icon: <Info aria-hidden="true" />, className: 'border-primary/30 bg-primary/5' },
  success: {
    icon: <CheckCircle2 aria-hidden="true" />,
    className: 'border-success/40 bg-success/10',
  },
  warning: {
    icon: <AlertTriangle aria-hidden="true" />,
    className: 'border-warning/50 bg-warning/10',
  },
  error: { icon: <AlertTriangle aria-hidden="true" />, className: 'border-danger/40 bg-danger/10' },
} as const;

/** Inline message. Errors are announced (role=alert); others politely (role=status). */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof ALERT_TONES; title?: ReactNode }) {
  const t = ALERT_TONES[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-md border p-3 text-sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
        t.className,
        className,
      )}
      {...props}
    >
      {t.icon}
      <div className="flex flex-col gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className="text-foreground/90">{children}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium',
        className,
      )}
      {...props}
    />
  );
}
