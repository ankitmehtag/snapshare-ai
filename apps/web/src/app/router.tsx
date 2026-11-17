import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { ComingSoon } from '../pages/coming-soon';
import { Landing } from '../pages/landing';
import { NotFound } from '../pages/not-found';
import { RouteError } from '../pages/route-error';
import { GalleryShell, PublicShell } from '../shells/public-shell';
import { SCREENS, type AppArea, type Screen } from './screens';

/** Implemented screens. Everything else renders <ComingSoon> until its phase. */
const IMPLEMENTED: Record<string, ReactNode> = {
  'PUB-01': <Landing />,
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
