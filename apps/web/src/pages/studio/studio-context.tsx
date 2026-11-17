import { ErrorState, Forbidden, LoadingSkeleton, buttonVariants } from '@snapshare/ui';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, apiFetch } from '../../lib/api';
import { useMe } from '../../lib/session';

export interface StudioView {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'pending_deletion';
  deletionRequestedAt: string | null;
  contact: {
    email?: string;
    phone?: string;
    website?: string;
    instagram?: string;
    address?: string;
  };
  branding: { primaryColor?: string; accentColor?: string };
  billingProfile?: { legalName?: string; gstin?: string; stateCode?: string; address?: string };
  role: string;
  permissions: string[];
  seats: { used: number; limit: number };
}

interface StudioCtx {
  studio: StudioView;
  can: (permission: string) => boolean;
}

const Ctx = createContext<StudioCtx | null>(null);

export const studioKey = (id: string) => ['studio', id] as const;

/**
 * Resolves /studio/:studioSlug to the user's membership. Buttons are hidden with
 * `can()` for convenience only — the API enforces every permission itself.
 */
export function StudioProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { studioSlug } = useParams();
  const me = useMe();
  const workspace = me.data?.workspaces.find((w) => w.type === 'studio' && w.slug === studioSlug);
  const studio = useQuery({
    queryKey: studioKey(workspace?.id ?? 'none'),
    queryFn: ({ signal }) => apiFetch<StudioView>(`/studios/${workspace!.id}`, { signal }),
    enabled: Boolean(workspace),
  });

  if (me.isPending || (workspace && studio.isPending)) {
    return <LoadingSkeleton label={t('common.loading')} />;
  }
  if (!workspace || (studio.error instanceof ApiError && studio.error.status === 404)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-10">
        <Forbidden
          title={t('workspace.noAccess')}
          description={t('workspace.noAccessBody')}
          action={
            <Link to="/onboarding" className={buttonVariants({ variant: 'outline' })}>
              {t('workspace.newStudio')}
            </Link>
          }
        />
      </div>
    );
  }
  if (studio.isError) return <ErrorState onRetry={() => void studio.refetch()} />;
  const value: StudioCtx = {
    studio: studio.data!,
    can: (p) => studio.data!.permissions.includes(p),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStudio outside StudioProvider');
  return ctx;
}
