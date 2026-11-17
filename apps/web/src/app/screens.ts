/**
 * Every screen from docs/SCREEN_INVENTORY.md, registered as a route from day one.
 * Until its phase ships, a screen renders an honest "Coming in Phase N" page —
 * never mock data (MASTER_SPEC §19). When a phase implements a screen, replace
 * its entry's `element` in router.tsx and set `ready: true` here.
 */
export type AppArea = 'public' | 'auth' | 'studio' | 'personal' | 'admin' | 'gallery' | 'account';

export interface Screen {
  id: string;
  title: string;
  /** Path relative to the area's base route ('' = area index). */
  path: string;
  area: AppArea;
  phase: number | '3b';
  ready?: boolean;
}

export const AREA_BASE: Record<AppArea, string> = {
  public: '/',
  auth: '/',
  account: '/',
  gallery: '/',
  studio: '/studio/:studioSlug',
  personal: '/me',
  admin: '/admin',
};

export const SCREENS: Screen[] = [
  // 1. Public & marketing
  { id: 'PUB-01', title: 'Home', path: '', area: 'public', phase: 1, ready: true },
  { id: 'PUB-02', title: 'Pricing', path: 'pricing', area: 'public', phase: 6 },
  { id: 'PUB-03', title: 'Legal', path: 'legal/:doc', area: 'public', phase: 2 },
  { id: 'PUB-04', title: 'Report abuse', path: 'report', area: 'public', phase: 9 },

  // 2. Authentication & onboarding
  { id: 'AUTH-01', title: 'Sign up', path: 'signup', area: 'auth', phase: 2 },
  { id: 'AUTH-02', title: 'Log in', path: 'login', area: 'auth', phase: 2 },
  { id: 'AUTH-03', title: 'Verify email', path: 'verify', area: 'auth', phase: 2 },
  { id: 'AUTH-04', title: 'Forgot password', path: 'forgot', area: 'auth', phase: 2 },
  { id: 'AUTH-05', title: 'Reset password', path: 'reset', area: 'auth', phase: 2 },
  { id: 'AUTH-06', title: 'Accept invitation', path: 'invite/:token', area: 'auth', phase: 2 },
  { id: 'ONB-01', title: 'Choose workspace', path: 'onboarding', area: 'auth', phase: 2 },
  { id: 'ONB-02', title: 'Studio setup', path: 'onboarding/studio', area: 'auth', phase: 2 },
  { id: 'ONB-03', title: 'Choose a plan', path: 'onboarding/plan', area: 'auth', phase: 6 },

  // 3. Global (account)
  { id: 'GL-02', title: 'Account settings', path: 'account', area: 'account', phase: 2 },
  { id: 'GL-03', title: 'Sessions & devices', path: 'account/sessions', area: 'account', phase: 2 },

  // 4. Photographer studio
  { id: 'ST-01', title: 'Dashboard', path: '', area: 'studio', phase: 3 },
  {
    id: 'ST-02',
    title: 'Studio profile & branding',
    path: 'settings/profile',
    area: 'studio',
    phase: 2,
  },
  { id: 'ST-10', title: 'Events', path: 'events', area: 'studio', phase: 3 },
  { id: 'ST-11', title: 'Create event', path: 'events/new', area: 'studio', phase: 3 },
  { id: 'ST-11E', title: 'Edit event', path: 'events/:eventId/edit', area: 'studio', phase: 3 },
  { id: 'ST-12', title: 'Event photos', path: 'events/:eventId', area: 'studio', phase: 3 },
  {
    id: 'ST-13',
    title: 'Upload manager',
    path: 'events/:eventId/upload',
    area: 'studio',
    phase: 3,
  },
  { id: 'ST-14', title: 'Albums', path: 'events/:eventId/albums', area: 'studio', phase: 3 },
  {
    id: 'ST-15',
    title: 'Photo detail',
    path: 'events/:eventId/photos/:photoId',
    area: 'studio',
    phase: 3,
  },
  {
    id: 'ST-16',
    title: 'Sharing & access',
    path: 'events/:eventId/share',
    area: 'studio',
    phase: 5,
  },
  {
    id: 'ST-17',
    title: 'Guests & invitations',
    path: 'events/:eventId/guests',
    area: 'studio',
    phase: 5,
  },
  { id: 'ST-18', title: 'Event AI settings', path: 'events/:eventId/ai', area: 'studio', phase: 4 },
  {
    id: 'ST-19',
    title: 'Event analytics',
    path: 'events/:eventId/analytics',
    area: 'studio',
    phase: 5,
  },
  {
    id: 'ST-20',
    title: 'Proofing setup',
    path: 'events/:eventId/proofing',
    area: 'studio',
    phase: 5,
  },
  {
    id: 'ST-21',
    title: 'Proofing review',
    path: 'events/:eventId/proofing/review',
    area: 'studio',
    phase: 5,
  },
  { id: 'ST-22', title: 'Videos', path: 'events/:eventId/videos', area: 'studio', phase: '3b' },
  {
    id: 'ST-23',
    title: 'Digital album builder',
    path: 'events/:eventId/album-design',
    area: 'studio',
    phase: 8,
  },
  { id: 'ST-30', title: 'Watermarks', path: 'settings/watermarks', area: 'studio', phase: 3 },
  { id: 'ST-31', title: 'Gallery themes', path: 'settings/themes', area: 'studio', phase: 8 },
  { id: 'ST-32', title: 'Custom domains', path: 'settings/domains', area: 'studio', phase: 8 },
  { id: 'ST-33', title: 'Portfolio builder', path: 'portfolio', area: 'studio', phase: 8 },
  { id: 'ST-40', title: 'Team & roles', path: 'team', area: 'studio', phase: 2 },
  { id: 'ST-41', title: 'Team activity', path: 'team/activity', area: 'studio', phase: 2 },
  { id: 'ST-50', title: 'Clients', path: 'clients', area: 'studio', phase: 8 },
  { id: 'ST-51', title: 'Client profile', path: 'clients/:clientId', area: 'studio', phase: 8 },
  { id: 'ST-52', title: 'Leads', path: 'leads', area: 'studio', phase: 8 },
  { id: 'ST-53', title: 'Bookings', path: 'bookings', area: 'studio', phase: 8 },
  { id: 'ST-54', title: 'Invoices', path: 'invoices', area: 'studio', phase: 8 },
  { id: 'ST-60', title: 'Analytics', path: 'analytics', area: 'studio', phase: 5 },
  { id: 'ST-70', title: 'Billing & subscription', path: 'billing', area: 'studio', phase: 6 },

  // 5. Public gallery & client proofing
  { id: 'PUB-10', title: 'Gallery', path: 'g/:code', area: 'gallery', phase: 3 },
  { id: 'PUB-11', title: 'Unlock gallery', path: 'g/:code/unlock', area: 'gallery', phase: 5 },
  { id: 'PUB-12', title: 'Album', path: 'g/:code/a/:albumId', area: 'gallery', phase: 3 },
  { id: 'PUB-13', title: 'Find my photos', path: 'g/:code/find-me', area: 'gallery', phase: 4 },
  { id: 'PUB-14', title: 'Verify', path: 'g/:code/verify', area: 'gallery', phase: 4 },
  { id: 'PUB-15', title: 'Take a selfie', path: 'g/:code/selfie', area: 'gallery', phase: 4 },
  { id: 'PUB-16', title: 'My photos', path: 'g/:code/me', area: 'gallery', phase: 4 },
  { id: 'PUB-17', title: 'Downloads', path: 'g/:code/downloads', area: 'gallery', phase: 5 },
  { id: 'PUB-18', title: 'Favorites', path: 'g/:code/favorites', area: 'gallery', phase: 5 },
  { id: 'PUB-20', title: 'Proofing gallery', path: 'p/:code', area: 'gallery', phase: 5 },
  { id: 'PUB-30', title: 'Portfolio', path: 'portfolio/:studioSlug', area: 'gallery', phase: 8 },

  // 6. Personal
  { id: 'ME-01', title: 'Home', path: '', area: 'personal', phase: 7 },
  { id: 'ME-10', title: 'Albums', path: 'albums', area: 'personal', phase: 7 },
  { id: 'ME-11', title: 'Album', path: 'albums/:albumId', area: 'personal', phase: 7 },
  { id: 'ME-12', title: 'Upload', path: 'albums/:albumId/upload', area: 'personal', phase: 7 },
  { id: 'ME-20', title: 'Groups', path: 'groups', area: 'personal', phase: 7 },
  { id: 'ME-21', title: 'Group', path: 'groups/:groupId', area: 'personal', phase: 7 },
  { id: 'ME-30', title: 'Photos of me', path: 'photos-of-me', area: 'personal', phase: 7 },
  { id: 'ME-31', title: 'My event photos', path: 'events', area: 'personal', phase: 5 },
  { id: 'ME-32', title: 'Search', path: 'search', area: 'personal', phase: 7 },
  { id: 'ME-33', title: 'Favorites', path: 'favorites', area: 'personal', phase: 7 },
  { id: 'ME-40', title: 'Privacy & face data', path: 'privacy', area: 'personal', phase: 4 },
  { id: 'ME-41', title: 'Storage', path: 'storage', area: 'personal', phase: 7 },
  { id: 'ME-42', title: 'Billing', path: 'billing', area: 'personal', phase: 6 },
  { id: 'ME-50', title: 'Your data', path: 'data', area: 'personal', phase: 7 },

  // 7. Super admin
  { id: 'AD-00', title: 'Admin login', path: 'login', area: 'admin', phase: 9 },
  { id: 'AD-01', title: 'Overview', path: '', area: 'admin', phase: 9 },
  { id: 'AD-10', title: 'Users', path: 'users', area: 'admin', phase: 9 },
  { id: 'AD-11', title: 'Studios', path: 'studios', area: 'admin', phase: 9 },
  { id: 'AD-12', title: 'Account detail', path: ':kind/:id', area: 'admin', phase: 9 },
  { id: 'AD-13', title: 'Subscriptions & payments', path: 'billing', area: 'admin', phase: 9 },
  { id: 'AD-14', title: 'Plans & entitlements', path: 'plans', area: 'admin', phase: 6 },
  { id: 'AD-15', title: 'Revenue', path: 'revenue', area: 'admin', phase: 9 },
  { id: 'AD-20', title: 'Moderation', path: 'moderation', area: 'admin', phase: 9 },
  { id: 'AD-30', title: 'Queues & jobs', path: 'queues', area: 'admin', phase: 9 },
  { id: 'AD-31', title: 'AI & GPU', path: 'ai', area: 'admin', phase: 9 },
  { id: 'AD-32', title: 'Storage', path: 'storage', area: 'admin', phase: 9 },
  { id: 'AD-33', title: 'System health', path: 'health', area: 'admin', phase: 9 },
  { id: 'AD-40', title: 'Audit logs', path: 'audit', area: 'admin', phase: 9 },
  { id: 'AD-41', title: 'Feature flags', path: 'flags', area: 'admin', phase: 9 },
];

/** Inventory screens that are components/overlays rather than routes. */
export const NON_ROUTE_SCREENS = ['GL-01', 'GL-04', 'GL-05', 'PUB-12a', 'PUB-21'] as const;

export function screensFor(area: AppArea): Screen[] {
  return SCREENS.filter((s) => s.area === area);
}
