import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Field, Input, PasswordInput, buttonVariants } from '@snapshare/ui';
import { forgotPasswordBody, resetPasswordBody } from '@snapshare/validators';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { z } from 'zod';
import { Turnstile } from '../../components/turnstile';
import { ApiError, apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { useUiStore } from '../../stores/ui';
import { AuthLayout } from './auth-layout';

const forgotSchema = forgotPasswordBody.pick({ email: true });

/** AUTH-04. Always the same confirmation, whether or not the account exists. */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const language = useUiStore((s) => s.language);
  const [token, setToken] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    if (!token) {
      setFormError(t('common.securityCheckHint'));
      return;
    }
    try {
      await apiFetch('/auth/forgot-password', json('POST', { ...values, turnstileToken: token }));
      setSentTo(values.email);
    } catch (err) {
      setFormError(applyApiError(err, form.setError, ['email']));
    }
  });

  const back = (
    <Link to="/login" className="font-medium text-primary hover:underline">
      {t('auth.forgot.back')}
    </Link>
  );
  if (sentTo) {
    return (
      <AuthLayout title={t('auth.forgot.sentTitle')} footer={back}>
        <Alert tone="success">{t('auth.forgot.sentBody', { email: sentTo })}</Alert>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} footer={back}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field label={t('common.email')} error={form.formState.errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <div role="group" aria-label={t('common.securityCheck')}>
          <Turnstile onToken={setToken} language={language} />
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.forgot.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}

const resetSchema = resetPasswordBody.pick({ password: true });

/** AUTH-05. An expired or used link offers to send a new one. */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [linkProblem, setLinkProblem] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiFetch('/auth/reset-password', json('POST', { token, password: values.password }));
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'TOKEN_INVALID') {
        setLinkProblem(String(err.problem.meta?.reason ?? 'invalid'));
        return;
      }
      setFormError(applyApiError(err, form.setError, ['password']));
    }
  });

  if (done) {
    return (
      <AuthLayout title={t('auth.reset.title')}>
        <Alert tone="success">{t('auth.reset.done')}</Alert>
        <Link to="/login" className={buttonVariants({ className: 'mt-6 w-full' })}>
          {t('auth.signup.login')}
        </Link>
      </AuthLayout>
    );
  }
  if (!token || linkProblem) {
    const key = linkProblem === 'expired' ? 'expired' : linkProblem === 'used' ? 'used' : 'invalid';
    return (
      <AuthLayout title={t(`auth.verify.${key}`)}>
        <Link to="/forgot" className={buttonVariants({ className: 'w-full' })}>
          {t('auth.forgot.submit')}
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title={t('auth.reset.title')}>
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field
          label={t('auth.reset.newPassword')}
          hint={t('auth.signup.passwordHint')}
          error={form.formState.errors.password?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            showLabel={t('common.showPassword')}
            hideLabel={t('common.hidePassword')}
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {t('auth.reset.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
