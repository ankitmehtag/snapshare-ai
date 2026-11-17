import { zodResolver } from '@hookform/resolvers/zod';
import type { Workspace } from '@snapshare/types';
import { Alert, Badge, Button, Card, Field, Input, buttonVariants } from '@snapshare/ui';
import { createStudioBody } from '@snapshare/validators';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Heart, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { ME_KEY, useMe } from '../../lib/session';
import { VerifyEmailBanner } from '../auth/verify';

/** ONB-01. Personal workspaces arrive in Phase 7 — shown honestly, not faked. */
export function OnboardingPage() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <VerifyEmailBanner />
      <h1 className="text-2xl font-bold tracking-tight">{t('onboarding.title')}</h1>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        <li>
          <Link
            to="/onboarding/studio"
            className="block h-full rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
          >
            <Card className="h-full p-6 hover:border-primary">
              <Camera aria-hidden="true" className="size-6 text-primary" />
              <h2 className="mt-3 font-semibold">{t('onboarding.studio')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.studioBody')}</p>
            </Card>
          </Link>
        </li>
        <li>
          <Card aria-disabled="true" className="h-full p-6 opacity-70">
            <Heart aria-hidden="true" className="size-6 text-muted-foreground" />
            <h2 className="mt-3 font-semibold">{t('onboarding.personal')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('onboarding.personalBody')}</p>
            <Badge className="mt-3">{t('onboarding.personalSoon')}</Badge>
          </Card>
        </li>
      </ul>
    </div>
  );
}

type Values = z.infer<typeof createStudioBody>;

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);

/** ONB-02. The address is suggested from the name and checked as you type. */
export function StudioSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [formError, setFormError] = useState<string | null>(null);
  const slugEdited = useRef(false);
  const form = useForm<Values>({ resolver: zodResolver(createStudioBody), mode: 'onTouched' });
  const name = form.watch('name');
  const slug = form.watch('slug') ?? '';
  const [debouncedSlug, setDebouncedSlug] = useState('');

  useEffect(() => {
    if (!slugEdited.current && name !== undefined) {
      form.setValue('slug', slugify(name), { shouldValidate: false });
    }
  }, [name, form]);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSlug(slug), 350);
    return () => clearTimeout(id);
  }, [slug]);

  const availability = useQuery({
    queryKey: ['slug', debouncedSlug],
    queryFn: ({ signal }) =>
      apiFetch<{ available: boolean; reason?: string }>(
        `/studios/slug-availability?slug=${encodeURIComponent(debouncedSlug)}`,
        { signal },
      ),
    enabled: debouncedSlug.length >= 3,
    staleTime: 10_000,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const ws = await apiFetch<Workspace>('/studios', json('POST', values));
      await qc.invalidateQueries({ queryKey: ME_KEY });
      navigate(`/studio/${ws.slug ?? ''}`, { replace: true });
    } catch (err) {
      setFormError(applyApiError(err, form.setError, ['name', 'slug']));
    }
  });

  const unverified = me.data && !me.data.emailVerified;
  const origin = typeof window === 'undefined' ? '' : window.location.host;
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <VerifyEmailBanner />
      <h1 className="text-2xl font-bold tracking-tight">{t('onboarding.setupTitle')}</h1>
      {unverified ? (
        <Alert tone="info" className="mt-6">
          {t('onboarding.verifyFirst')}
        </Alert>
      ) : null}
      <form noValidate onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field label={t('onboarding.studioName')} error={form.formState.errors.name?.message}>
          <Input autoComplete="organization" {...form.register('name')} />
        </Field>
        <Field
          label={t('onboarding.slug')}
          hint={t('onboarding.slugHint', { url: `${origin}/studio/${slug || '…'}` })}
          error={form.formState.errors.slug?.message}
        >
          <Input
            autoCapitalize="none"
            spellCheck={false}
            {...form.register('slug', {
              onChange: () => {
                slugEdited.current = true;
              },
            })}
          />
        </Field>
        <SlugStatus
          checking={availability.isFetching || slug !== debouncedSlug}
          show={slug.length >= 3}
          available={availability.data?.available}
          reason={availability.data?.reason}
        />
        <Button type="submit" disabled={form.formState.isSubmitting || Boolean(unverified)}>
          {t('onboarding.create')}
        </Button>
        <Link to="/onboarding" className={buttonVariants({ variant: 'ghost' })}>
          {t('common.back')}
        </Link>
      </form>
    </div>
  );
}

function SlugStatus({
  checking,
  show,
  available,
  reason,
}: {
  checking: boolean;
  show: boolean;
  available: boolean | undefined;
  reason: string | undefined;
}) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <p role="status" className="-mt-2 flex items-center gap-1.5 text-sm [&_svg]:size-4">
      {checking ? (
        <span className="text-muted-foreground">{t('onboarding.slugChecking')}</span>
      ) : available ? (
        <span className="flex items-center gap-1.5 text-success">
          <CheckCircle2 aria-hidden="true" /> {t('onboarding.slugAvailable')}
        </span>
      ) : available === false ? (
        <span className="flex items-center gap-1.5 text-danger">
          <XCircle aria-hidden="true" /> {reason ?? t('onboarding.slugTaken')}
        </span>
      ) : null}
    </p>
  );
}
