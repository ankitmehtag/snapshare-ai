import { zodResolver } from '@hookform/resolvers/zod';
import type { Me } from '@snapshare/types';
import { Alert, Button, Field, Input, PasswordInput } from '@snapshare/ui';
import { loginBody } from '@snapshare/validators';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Turnstile } from '../../components/turnstile';
import { ApiError, apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { homePath, ME_KEY, safeNext } from '../../lib/session';
import { useUiStore } from '../../stores/ui';
import { AuthLayout } from './auth-layout';

const schema = loginBody.omit({ turnstileToken: true });
type Values = z.infer<typeof schema>;

/** AUTH-02. Shows the captcha only after the API asks for it; lockout shows the wait. */
export function LoginPage() {
  const { t } = useTranslation();
  const language = useUiStore((s) => s.language);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [captcha, setCaptcha] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiFetch(
        '/auth/login',
        json('POST', { ...values, ...(token ? { turnstileToken: token } : {}) }),
      );
      const me = await apiFetch<Me>('/me');
      qc.setQueryData(ME_KEY, me);
      navigate(next ?? homePath(me), { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CAPTCHA_REQUIRED') {
        setCaptcha(true);
        setToken(null);
        setFormError(t('auth.login.captcha'));
        return;
      }
      if (err instanceof ApiError && err.code === 'LOCKED') {
        const seconds = Number(err.problem.meta?.retryAfterSeconds ?? 900);
        setFormError(t('auth.login.locked', { minutes: Math.max(1, Math.ceil(seconds / 60)) }));
        return;
      }
      setFormError(applyApiError(err, form.setError, ['email', 'password']));
      // A fresh token is needed for every attempt once the captcha is on.
      if (captcha) setToken(null);
    }
  });

  return (
    <AuthLayout
      title={t('auth.login.title')}
      footer={
        <>
          {t('auth.login.noAccount')}{' '}
          <Link
            to={next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
            className="font-medium text-primary hover:underline"
          >
            {t('auth.login.signup')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field label={t('common.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field label={t('common.password')} error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            showLabel={t('common.showPassword')}
            hideLabel={t('common.hidePassword')}
            {...form.register('password')}
          />
        </Field>
        <Link to="/forgot" className="-mt-2 self-end text-sm text-primary hover:underline">
          {t('auth.login.forgot')}
        </Link>
        {captcha ? (
          <div role="group" aria-label={t('common.securityCheck')}>
            <Turnstile onToken={setToken} language={language} />
          </div>
        ) : null}
        <Button type="submit" disabled={isSubmitting || (captcha && !token)}>
          {isSubmitting ? t('common.loading') : t('auth.login.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
