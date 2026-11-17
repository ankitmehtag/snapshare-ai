import { LoadingSkeleton } from '@snapshare/ui';
import { Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth } from '../lib/session';
import { ComingSoon } from '../pages/coming-soon';
import { Landing } from '../pages/landing';
import { NotFound } from '../pages/not-found';
import { RouteError } from '../pages/route-error';
import { GalleryShell, PublicShell } from '../shells/public-shell';
import { SCREENS, type AppArea, type Screen } from './screens';

// Phase 2 screens share one lazy chunk, so the landing page never downloads forms.
const loadPages = () => import('../pages/phase2');
type Pages = Awaited<ReturnType<typeof loadPages>>;
function page(name: keyof Pages, wrap?: (el: ReactNode) => ReactNode) {
  const Page = lazy(() => loadPages().then((m) => ({ default: m[name] as ComponentType })));
  const el = (
    <Suspense fallback={<LoadingSkeleton label="Loading" />}>
      <Page />
    </Suspense>
  );
  return wrap ? wrap(el) : el;
}
const guest = (el: ReactNode) => <GuestOnly>{el}</GuestOnly>;
const signedIn = (el: ReactNode) => <RequireAuth>{el}</RequireAuth>;

/** Implemented screens. Everything else renders <ComingSoon> until its phase. */
const IMPLEMENTED: Record<string, ReactNode> = {
  'PUB-01': <Landing />,
  'PUB-03': page('LegalPage'),
  'AUTH-01': page('SignupPage', guest),
  'AUTH-02': page('LoginPage', guest),
  'AUTH-03': page('VerifyEmailPage'),
  'AUTH-04': page('ForgotPasswordPage', guest),
  'AUTH-05': page('ResetPasswordPage'),
  'AUTH-06': page('InvitePage'),
  'ONB-01': page('OnboardingPage', signedIn),
  'ONB-02': page('StudioSetupPage', signedIn),
  'GL-02': page('AccountPage', signedIn),
  'GL-03': page('SessionsPage', signedIn),
  'ST-02': page('StudioProfilePage'),
  'ST-40': page('TeamPage'),
  'ST-41': page('ActivityPage'),
};

function toRoute(screen: Screen): RouteObject {
  const element = screen.ready ? IMPLEMENTED[screen.id] : <ComingSoon screen={screen} />;
  return screen.path === '' ? { index: true, element } : { path: screen.path, element };
}

const childrenOf = (...areas: AppArea[]) =>
  SCREENS.filter((s) => areas.includes(s.area) && s.id !== 'AD-00').map(toRoute);

const adminLogin = SCREENS.find((s) => s.id === 'AD-00')!;

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        path: '/',
        element: <PublicShell />,
        children: [
          ...childrenOf('public', 'auth', 'account'),
          { path: 'admin/login', element: <ComingSoon screen={adminLogin} /> },
          { path: '*', element: <NotFound /> },
        ],
      },
      { element: <GalleryShell />, children: childrenOf('gallery') },
      // Signed-in areas are code-split so the public landing page stays small (LCP on 4G).
      {
        path: '/studio/:studioSlug',
        lazy: () => import('../shells/app-shells').then((m) => ({ Component: m.StudioShell })),
        children: childrenOf('studio'),
      },
      {
        path: '/me',
        lazy: () => import('../shells/app-shells').then((m) => ({ Component: m.PersonalShell })),
        children: childrenOf('personal'),
      },
      {
        path: '/admin',
        lazy: () => import('../shells/app-shells').then((m) => ({ Component: m.AdminShell })),
        children: childrenOf('admin'),
      },
    ],
  },
];
