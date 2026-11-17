import type { Workspace } from '@snapshare/types';
import { Alert, Button, ErrorState, LoadingSkeleton, buttonVariants } from '@snapshare/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError, apiFetch, json } from '../../lib/api';
import { ME_KEY, useMe, useSignOut } from '../../lib/session';
import { AuthLayout } from './auth-layout';

interface Preview {
  studioName: string;
  roleKey: string;
  inviterName: string;
  emailHint: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
}

/** AUTH-06: preview, sign in/up to accept, and the wrong-account warning. */
export function InvitePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const signOut = useSignOut();
  const here = `/invite/${token}`;

  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: ({ signal }) => apiFetch<Preview>(`/invitations/${token}`, { signal }),
  });
  const accept = useMutation({
    mutationFn: () => apiFetch<Workspace>(`/invitations/${token}/accept`, json('POST')),
    onSuccess: async (ws) => {
      await qc.invalidateQueries({ queryKey: ME_KEY });
      navigate(`/studio/${ws.slug ?? ''}`, { replace: true });
    },
  });

  if (preview.isPending || me.isPending) {
    return (
      <AuthLayout title={t('auth.invite.title')}>
        <LoadingSkeleton label={t('common.loading')} />
      </AuthLayout>
    );
  }
  if (preview.isError) {
    const missing = preview.error instanceof ApiError && preview.error.status === 404;
    return (
      <AuthLayout title={missing ? t('auth.invite.notFound') : t('auth.invite.title')}>
        {missing ? (
          <p className="text-sm text-muted-foreground">{t('auth.invite.askAgain')}</p>
        ) : (
          <ErrorState onRetry={() => void preview.refetch()} />
        )}
      </AuthLayout>
    );
  }

  const p = preview.data;
  const role = t(`team.roles.${p.roleKey}`);
  if (p.status !== 'pending') {
    return (
      <AuthLayout title={t(`auth.invite.${p.status}`)}>
        <p className="text-sm text-muted-foreground">{t('auth.invite.askAgain')}</p>
      </AuthLayout>
    );
  }

  const mismatch =
    accept.error instanceof ApiError && accept.error.problem.meta?.reason === 'email_mismatch';
  return (
    <AuthLayout
      title={t('auth.invite.title')}
      subtitle={t('auth.invite.body', { inviter: p.inviterName, studio: p.studioName, role })}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t('auth.invite.sentTo', { email: p.emailHint })}
        </p>
        {mismatch ? (
          <Alert tone="warning" title={t('auth.invite.wrongAccount')}>
            {t('auth.invite.wrongAccountBody', { email: p.emailHint })}
          </Alert>
        ) : accept.error ? (
          <Alert tone="error">{(accept.error as Error).message}</Alert>
        ) : null}
        {me.data ? (
          mismatch ? (
            <Button
              variant="outline"
              onClick={() => void signOut(`/login?next=${encodeURIComponent(here)}`)}
            >
              {t('common.signOut')}
            </Button>
          ) : (
            <Button onClick={() => accept.mutate()} disabled={accept.isPending}>
              {t('auth.invite.accept')}
            </Button>
          )
        ) : (
          <>
            <Link to={`/login?next=${encodeURIComponent(here)}`} className={buttonVariants()}>
              {t('auth.invite.signInToAccept')}
            </Link>
            <Link
              to={`/signup?next=${encodeURIComponent(here)}`}
              className={buttonVariants({ variant: 'outline' })}
            >
              {t('auth.invite.signUpToAccept')}
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  );
}
