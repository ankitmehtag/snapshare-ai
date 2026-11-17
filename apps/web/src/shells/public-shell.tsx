import { Brand, buttonVariants } from '@snapshare/ui';
import { Link, Outlet } from 'react-router';
import { PreferenceControls } from './preferences';

/** Marketing, auth and account pages. */
export function PublicShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:gap-4">
          <Link to="/" aria-label="SnapShare home">
            <Brand className="max-sm:[&>span:last-child]:sr-only" />
          </Link>
          <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-2">
            <Link
              to="/pricing"
              className={buttonVariants({
                variant: 'ghost',
                size: 'sm',
                className: 'max-sm:hidden',
              })}
            >
              Pricing
            </Link>
            <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Log in
            </Link>
          </nav>
          <PreferenceControls />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} SnapShare</span>
          <Link to="/legal/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/legal/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/report" className="hover:text-foreground">
            Report abuse
          </Link>
        </div>
      </footer>
    </div>
  );
}

/**
 * Guest gallery & proofing shell. Studio branding replaces the SnapShare header
 * once galleries load real data (Phase 3); no SnapShare marketing navigation here.
 */
export function GalleryShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4">
          <Brand />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
