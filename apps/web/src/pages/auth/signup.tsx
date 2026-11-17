import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Field, Input, PasswordInput } from '@snapshare/ui';
import { signupBody } from '@snapshare/validators';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { Turnstile } from '../../components/turnstile';
import { apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { safeNext } from '../../lib/session';
import { useUiStore } from '../../stores/ui';
import { AuthLayout } from './auth-layout';

const schema = signupBody.omit({ turnstileToken: true, locale: true });
type Values = z.infer<typeof schema>;

/** AUTH-01. Same "check your inbox" result whether or not the email exists. */
export function SignupPage() {
  const { t } = useTranslation();
  const language = useUiStore((s) => s.language);
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [token, setToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: 'onTouched' });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    if (!token) {
      setFormError(t('common.securityCheckHint'));
      return;
    }
    try {
      await apiFetch(
        '/auth/signup',
        json('POST', { ...values, locale: language, turnstileToken: token }),
      );
      setSentTo(values.email);
    } catch (err) {
      setFormError(applyApiError(err, form.setError, ['name', 'email', 'password']));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title={t('auth.signup.sentTitle')}>
        <Alert tone="success">{t('auth.signup.sentBody', { email: sentTo })}</Alert>
        <Link
          to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="mt-6 inline-block text-sm font-medium text-primary hover:underline"
        >
          {t('auth.signup.login')}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.signup.title')}
      subtitle={t('auth.signup.subtitle')}
      footer={
        <>
          {t('auth.signup.haveAccount')}{' '}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-primary hover:underline"
          >
            {t('auth.signup.login')}
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field label={t('common.name')} error={errors.name?.message}>
          <Input autoComplete="name" {...form.register('name')} />
        </Field>
        <Field label={t('common.email')} error={errors.email?.message}>
          <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
        </Field>
        <Field
          label={t('common.password')}
          hint={t('auth.signup.passwordHint')}
          error={errors.password?.message}
        >
          <PasswordInput
            autoComplete="new-password"
            showLabel={t('common.showPassword')}
            hideLabel={t('common.hidePassword')}
            {...form.register('password')}
          />
        </Field>
        <div role="group" aria-label={t('common.securityCheck')}>
          <Turnstile onToken={setToken} language={language} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t('auth.signup.terms')}{' '}
          <Link to="/legal/terms" className="underline">
            {t('legal.docs.terms')}
          </Link>{' '}
          ·{' '}
          <Link to="/legal/privacy" className="underline">
            {t('legal.docs.privacy')}
          </Link>
        </p>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('common.loading') : t('auth.signup.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
