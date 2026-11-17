import { AppShell, type NavItem } from '@snapshare/ui';
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CreditCard,
  Flag,
  HardDrive,
  Heart,
  Home,
  Images,
  LayoutDashboard,
  ListChecks,
  ScanFace,
  ScrollText,
  Settings,
  Shield,
  Activity,
  Building2,
  Cpu,
  Users,
  UsersRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet, useParams } from 'react-router';
import { PreferenceControls } from './preferences';
import { RouterNavLink } from './router-link';

export function StudioShell() {
  const { t } = useTranslation();
  const { studioSlug } = useParams();
  const base = `/studio/${studioSlug ?? ''}`;
  const nav: NavItem[] = [
    { to: base, label: t('nav.dashboard'), icon: <LayoutDashboard aria-hidden />, end: true },
    { to: `${base}/events`, label: t('nav.events'), icon: <CalendarDays aria-hidden /> },
    { to: `${base}/clients`, label: t('nav.clients'), icon: <UsersRound aria-hidden /> },
    { to: `${base}/portfolio`, label: t('nav.portfolio'), icon: <Briefcase aria-hidden /> },
    { to: `${base}/team`, label: t('nav.team'), icon: <Users aria-hidden /> },
    { to: `${base}/analytics`, label: t('nav.analytics'), icon: <BarChart3 aria-hidden /> },
    { to: `${base}/billing`, label: t('nav.billing'), icon: <CreditCard aria-hidden /> },
    { to: `${base}/settings/profile`, label: t('nav.settings'), icon: <Settings aria-hidden /> },
  ];
  return (
    <AppShell
      area="studio"
      areaLabel={t('areas.studio')}
      nav={nav}
      linkComponent={RouterNavLink}
      topbar={<PreferenceControls />}
    >
      <Outlet />
    </AppShell>
  );
}

export function PersonalShell() {
  const { t } = useTranslation();
  const nav: NavItem[] = [
    { to: '/me', label: t('nav.home'), icon: <Home aria-hidden />, end: true },
    { to: '/me/albums', label: t('nav.albums'), icon: <Images aria-hidden /> },
    { to: '/me/groups', label: t('nav.groups'), icon: <UsersRound aria-hidden /> },
    { to: '/me/photos-of-me', label: t('nav.photosOfMe'), icon: <ScanFace aria-hidden /> },
    { to: '/me/events', label: t('nav.eventPhotos'), icon: <CalendarDays aria-hidden /> },
    { to: '/me/favorites', label: t('nav.favorites'), icon: <Heart aria-hidden /> },
    { to: '/me/storage', label: t('nav.storage'), icon: <HardDrive aria-hidden /> },
    { to: '/me/privacy', label: t('nav.privacy'), icon: <Shield aria-hidden /> },
    { to: '/me/billing', label: t('nav.billing'), icon: <CreditCard aria-hidden /> },
  ];
  return (
    <AppShell
      area="personal"
      areaLabel={t('areas.personal')}
      nav={nav}
      linkComponent={RouterNavLink}
      topbar={<PreferenceControls />}
    >
      <Outlet />
    </AppShell>
  );
}

export function AdminShell() {
  const { t } = useTranslation();
  const nav: NavItem[] = [
    { to: '/admin', label: t('nav.overview'), icon: <LayoutDashboard aria-hidden />, end: true },
    { to: '/admin/users', label: t('nav.users'), icon: <Users aria-hidden /> },
    { to: '/admin/studios', label: t('nav.studios'), icon: <Building2 aria-hidden /> },
    { to: '/admin/billing', label: t('nav.billing'), icon: <CreditCard aria-hidden /> },
    { to: '/admin/queues', label: t('nav.queues'), icon: <ListChecks aria-hidden /> },
    { to: '/admin/ai', label: t('nav.ai'), icon: <Cpu aria-hidden /> },
    { to: '/admin/health', label: t('nav.health'), icon: <Activity aria-hidden /> },
    { to: '/admin/audit', label: t('nav.audit'), icon: <ScrollText aria-hidden /> },
    { to: '/admin/flags', label: t('nav.flags'), icon: <Flag aria-hidden /> },
  ];
  return (
    <AppShell
      area="admin"
      areaLabel={t('areas.admin')}
      nav={nav}
      linkComponent={RouterNavLink}
      topbar={<PreferenceControls />}
    >
      <Outlet />
    </AppShell>
  );
}
