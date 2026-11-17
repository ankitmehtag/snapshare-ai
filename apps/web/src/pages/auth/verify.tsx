import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Field, Input, LoadingSkeleton, buttonVariants } from '@snapshare/ui';
import { emailOnlyBody } from '@snapshare/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { ApiError, apiFetch, json } from '../../lib/api';
import { ME_KEY, useMe } from '../../lib/session';
import { AuthLayout } from './auth-layout';

type Outcome = 'verified' | 'already_verified' | 'expired' | 'invalid' | 'used';
const resendSchema = emailOnlyBody.pick({ email: true });

/** AUTH-03: success, expired, already verified and invalid states, plus resend. */
export function VerifyEmailPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const qc = useQueryClient();
  const me = useMe();
  const started = useRef(false);

  const verify = useMutation({
    mutationFn: (tok: string) =>
      apiFetch<{ status: 'verified' | 'already_verified' }>(
        '/auth/verify-email',
        json('POST', { token: tok }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ME_KEY }),
  });

  useEffect(() => {
    // Verification consumes the token: run it exactly once, even in StrictMode.
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  let outcome: Outcome | null = null;
  if (!token) outcome = 'invalid';
  else if (verify.data) outcome = verify.data.status;
  else if (verify.error instanceof ApiError && verify.error.code === 'TOKEN_INVALID') {
    outcome = (verify.error.problem.meta?.reason as Outcome | undefined) ?? 'invalid';
  }

  if (!outcome && !verify.isError) {
    return (
      <AuthLayout title={t('auth.verify.title')}>
        <LoadingSkeleton label={t('auth.verify.verifying')} />
      </AuthLayout>
    );
  }

  const ok = outcome === 'verified' || outcome === 'already_verified';
  const titleKey = outcome
    ? `auth.verify.${outcome === 'already_verified' ? 'alreadyVerified' : outcome}`
    : 'auth.verify.invalid';
  return (
    <AuthLayout title={t(titleKey)}>
      {ok ? (
        <Link to={me.data ? '/onboarding' : '/login'} className={buttonVariants()}>
          {t('auth.verify.continue')}
        </Link>
      ) : (
        <ResendForm defaultEmail={me.data?.email} />
      )}
    </AuthLayout>
  );
}

function ResendForm({ defaultEmail }: { defaultEmail?: string | undefined }) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const form = useForm<z.infer<typeof resendSchema>>({
    resolver: zodResolver(resendSchema),
    defaultValues: { email: defaultEmail ?? '' },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    await apiFetch('/auth/resend-verification', json('POST', values)).catch(() => undefined);
    setSent(true);
  });
  if (sent) return <Alert tone="success">{t('auth.verify.resent')}</Alert>;
  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm font-medium">{t('auth.verify.resendTitle')}</p>
      <Field label={t('common.email')} error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </Field>
      <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
        {t('auth.verify.resend')}
      </Button>
    </form>
  );
}

/** Shown in signed-in areas until the email is confirmed. */
export function VerifyEmailBanner() {
  const { t } = useTranslation();
  const me = useMe();
  const [sent, setSent] = useState(false);
  if (!me.data || me.data.emailVerified) return null;
  return (
    <Alert tone="warning" className="mb-4">
      {t('auth.verify.banner', { email: me.data.email })}{' '}
      {sent ? (
        <span className="font-medium">{t('auth.verify.resent')}</span>
      ) : (
        <button
          type="button"
          className="font-medium text-primary underline"
          onClick={() => {
            void apiFetch('/auth/resend-verification', json('POST', { email: me.data!.email }));
            setSent(true);
          }}
        >
          {t('auth.verify.bannerAction')}
        </button>
      )}
    </Alert>
  );
}
