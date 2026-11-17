import { Menu, X } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { Brand } from './brand';
import { Button } from './button';

export interface NavItem {
  to: string;
  label: string;
  icon?: ReactNode;
  /** Match only the exact path (for index routes). */
  end?: boolean;
}

export interface NavLinkProps {
  to: string;
  end?: boolean;
  className: string;
  children: ReactNode;
  onClick?: () => void;
}

export interface AppShellProps {
  /** Which experience this shell belongs to; shown to assistive tech and used for theming. */
  area: 'studio' | 'personal' | 'admin';
  areaLabel: string;
  nav: NavItem[];
  /** Router-specific link that sets aria-current="page" when active (e.g. React Router NavLink). */
  linkComponent: ComponentType<NavLinkProps>;
  topbar?: ReactNode;
  children: ReactNode;
}

const linkClass =
  'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary [&_svg]:size-4';

/** Authenticated app layout: sidebar navigation, top bar, skip link and mobile drawer. */
export function AppShell({
  area,
  areaLabel,
  nav,
  linkComponent: Link,
  topbar,
  children,
}: AppShellProps) {
  const [open, setOpen] = useState(false);
  const navList = (
    <ul className="flex flex-col gap-1">
      {nav.map((item) => (
        <li key={item.to}>
          <Link
            to={item.to}
            {...(item.end ? { end: true } : {})}
            className={linkClass}
            onClick={() => setOpen(false)}
          >
            {item.icon}
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div data-area={area} className="min-h-dvh bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-border bg-surface p-4 lg:flex">
        <Brand className="px-2 pb-1" />
        <p className="px-2 pb-4 text-xs uppercase tracking-wide text-muted-foreground">
          {areaLabel}
        </p>
        <nav aria-label={`${areaLabel} navigation`}>{navList}</nav>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${areaLabel} menu`}
            className="absolute inset-y-0 left-0 w-72 bg-surface p-4 shadow-lg"
          >
            <div className="flex items-center justify-between pb-4">
              <Brand />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              >
                <X />
              </Button>
            </div>
            <nav aria-label={`${areaLabel} navigation`}>{navList}</nav>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <div className="lg:hidden">
            <Brand compact />
          </div>
          <div className="ml-auto flex items-center gap-2">{topbar}</div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
