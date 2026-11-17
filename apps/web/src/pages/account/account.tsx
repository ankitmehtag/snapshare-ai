import { zodResolver } from '@hookform/resolvers/zod';
import type { Me, SessionInfo } from '@snapshare/types';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Field,
  Input,
  LoadingSkeleton,
  PasswordInput,
  Select,
} from '@snapshare/ui';
import { changePasswordBody, personName } from '@snapshare/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { ME_KEY, useMe } from '../../lib/session';
import { useUiStore } from '../../stores/ui';
import { VerifyEmailBanner } from '../auth/verify';

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
  'UTC',
];

/** GL-02: profile and password. Email change arrives in Batch 2D (needs re-verification). */
export function AccountPage() {
  const { t } = useTranslation();
  const me = useMe();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <VerifyEmailBanner />
      <h1 className="text-2xl font-bold tracking-tight">{t('account.title')}</h1>
      {me.data ? <ProfileCard me={me.data} /> : <LoadingSkeleton label={t('common.loading')} />}
      <PasswordCard />
    </div>
  );
}

const profileSchema = z.object({
  name: personName,
  locale: z.enum(['en', 'hi']),
  timezone: z.string().min(1),
});

function ProfileCard({ me }: { me: Me }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setLanguage = useUiStore((s) => s.setLanguage);
  const [status, setStatus] = useState<'saved' | string | null>(null);
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: me.name, locale: me.locale, timezone: me.timezone },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    try {
      const updated = await apiFetch<Me>('/me', json('PATCH', values));
      qc.setQueryData(ME_KEY, updated);
      setLanguage(updated.locale);
      form.reset(values);
      setStatus('saved');
    } catch (err) {
      setStatus(applyApiError(err, form.setError, ['name', 'locale', 'timezone']));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.profile')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {status === 'saved' ? <Alert tone="success">{t('common.saved')}</Alert> : null}
          {status && status !== 'saved' ? <Alert tone="error">{status}</Alert> : null}
          <Field label={t('common.email')}>
            <Input value={me.email} readOnly disabled />
          </Field>
          <Field label={t('common.name')} error={form.formState.errors.name?.message}>
            <Input autoComplete="name" {...form.register('name')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('account.language')}>
              <Select {...form.register('locale')}>
                <option value="en">English</option>
                <option value="hi">हिन्दी</option>
              </Select>
            </Field>
            <Field label={t('account.timezone')}>
              <Select {...form.register('timezone')}>
                {[...new Set([me.timezone, ...TIMEZONES])].map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
            {t('common.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'changed' | string | null>(null);
  const form = useForm<z.infer<typeof changePasswordBody>>({
    resolver: zodResolver(changePasswordBody),
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    try {
      await apiFetch('/me/password', json('POST', values));
      form.reset();
      setStatus('changed');
    } catch (err) {
      setStatus(applyApiError(err, form.setError, ['currentPassword', 'newPassword']));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.passwordTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {status === 'changed' ? <Alert tone="success">{t('account.changed')}</Alert> : null}
          {status && status !== 'changed' ? <Alert tone="error">{status}</Alert> : null}
          <Field
            label={t('account.current')}
            error={form.formState.errors.currentPassword?.message}
          >
            <PasswordInput
              autoComplete="current-password"
              showLabel={t('common.showPassword')}
              hideLabel={t('common.hidePassword')}
              {...form.register('currentPassword')}
            />
          </Field>
          <Field
            label={t('account.new')}
            hint={t('auth.signup.passwordHint')}
            error={form.formState.errors.newPassword?.message}
          >
            <PasswordInput
              autoComplete="new-password"
              showLabel={t('common.showPassword')}
              hideLabel={t('common.hidePassword')}
              {...form.register('newPassword')}
            />
          </Field>
          <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
            {t('account.passwordTitle')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/** GL-03: signed-in devices; revoke one or all others. */
export function SessionsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: ({ signal }) => apiFetch<{ data: SessionInfo[] }>('/me/sessions', { signal }),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/me/sessions/${id}`, json('DELETE')),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
  const revokeOthers = useMutation({
    mutationFn: () => apiFetch<{ revoked: number }>('/me/sessions', json('DELETE')),
    onSuccess: (r) => {
      setNotice(t('account.revoked', { count: r.revoked }));
      return qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));

  const list = sessions.data?.data ?? [];
  const others = list.filter((s) => !s.current);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">{t('account.sessionsTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('account.sessionsBody')}</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {sessions.isPending ? (
        <LoadingSkeleton label={t('common.loading')} />
      ) : sessions.isError ? (
        <ErrorState onRetry={() => void sessions.refetch()} />
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((s) => (
            <li key={s.id}>
              <Card className="flex items-center gap-4 p-4">
                <Monitor aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.browser} · {s.os}{' '}
                    {s.current ? <Badge className="ml-1">{t('account.thisDevice')}</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('account.lastActive', { when: when(s.lastSeenAt) })}
                  </p>
                </div>
                {!s.current ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => revoke.mutate(s.id)}
                    disabled={revoke.isPending}
                  >
                    {t('account.signOutDevice')}
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {sessions.isSuccess ? (
        others.length ? (
          <Button
            variant="danger"
            className="self-start"
            onClick={() => revokeOthers.mutate()}
            disabled={revokeOthers.isPending}
          >
            {t('account.signOutOthers')}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">{t('account.noOthers')}</p>
        )
      ) : null}
    </div>
  );
}
