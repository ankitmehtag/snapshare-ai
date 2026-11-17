import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PasswordInput,
} from '@snapshare/ui';
import { gstin, studioName } from '@snapshare/validators';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { ME_KEY } from '../../lib/session';
import { studioKey, useStudio, type StudioView } from './studio-context';

const blank = (v: string | undefined) => (v === '' ? undefined : v);
const optional = (schema: z.ZodType<string>) =>
  z.preprocess(blank, schema.optional()) as unknown as z.ZodOptional<z.ZodString>;

const profileSchema = z.object({
  name: studioName,
  contact: z.object({
    email: optional(z.email()),
    phone: optional(z.string().max(20)),
    website: optional(z.url()),
    instagram: optional(z.string().max(60)),
    address: optional(z.string().max(300)),
  }),
  branding: z.object({
    primaryColor: optional(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
    accentColor: optional(z.string().regex(/^#[0-9a-fA-F]{6}$/)),
  }),
});
const gstSchema = z.object({
  legalName: optional(z.string().max(150)),
  gstin: optional(gstin),
  stateCode: optional(z.string().regex(/^\d{2}$/)),
});

/** ST-02: profile, contact, colours, GST (owner) and the deletion danger zone. */
export function StudioProfilePage() {
  const { t } = useTranslation();
  const { studio, can } = useStudio();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight">{t('studioProfile.title')}</h1>
      <ProfileForm studio={studio} readOnly={!can('studio.settings')} />
      {can('billing.view') ? <GstForm studio={studio} editable={can('billing.manage')} /> : null}
      {can('studio.delete') ? <DangerZone studio={studio} /> : null}
    </div>
  );
}

function useSaveStudio(studio: StudioView) {
  const qc = useQueryClient();
  return async (patch: object) => {
    const updated = await apiFetch<StudioView>(`/studios/${studio.id}`, json('PATCH', patch));
    qc.setQueryData(studioKey(studio.id), (old: StudioView | undefined) => ({
      ...old,
      ...updated,
    }));
    await qc.invalidateQueries({ queryKey: ME_KEY });
  };
}

function ProfileForm({ studio, readOnly }: { studio: StudioView; readOnly: boolean }) {
  const { t } = useTranslation();
  const save = useSaveStudio(studio);
  const [status, setStatus] = useState<string | null>(null);
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: studio.name, contact: studio.contact, branding: studio.branding },
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    try {
      await save(values);
      setStatus('saved');
    } catch (err) {
      setStatus(applyApiError(err, form.setError, ['name']));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studioProfile.basics')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {status === 'saved' ? <Alert tone="success">{t('common.saved')}</Alert> : null}
          {status && status !== 'saved' ? <Alert tone="error">{status}</Alert> : null}
          <fieldset disabled={readOnly} className="flex flex-col gap-4">
            <Field label={t('onboarding.studioName')} error={e.name?.message}>
              <Input {...form.register('name')} />
            </Field>
            <Field
              label={t('onboarding.slug')}
              hint={t('onboarding.slugHint', { url: `/studio/${studio.slug}` })}
            >
              <Input value={studio.slug} readOnly disabled />
            </Field>
            <h3 className="pt-2 text-sm font-semibold">{t('studioProfile.contact')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('common.email')} error={e.contact?.email?.message}>
                <Input type="email" {...form.register('contact.email')} />
              </Field>
              <Field label={t('studioProfile.phone')} error={e.contact?.phone?.message}>
                <Input type="tel" autoComplete="tel" {...form.register('contact.phone')} />
              </Field>
              <Field label={t('studioProfile.website')} error={e.contact?.website?.message}>
                <Input type="url" placeholder="https://" {...form.register('contact.website')} />
              </Field>
              <Field label={t('studioProfile.instagram')} error={e.contact?.instagram?.message}>
                <Input {...form.register('contact.instagram')} />
              </Field>
            </div>
            <Field label={t('studioProfile.address')} error={e.contact?.address?.message}>
              <Input autoComplete="street-address" {...form.register('contact.address')} />
            </Field>
            <h3 className="pt-2 text-sm font-semibold">{t('studioProfile.brand')}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('studioProfile.primary')}>
                <Input
                  type="color"
                  className="h-10 p-1"
                  {...form.register('branding.primaryColor')}
                />
              </Field>
              <Field label={t('studioProfile.accent')}>
                <Input
                  type="color"
                  className="h-10 p-1"
                  {...form.register('branding.accentColor')}
                />
              </Field>
            </div>
            {!readOnly ? (
              <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
                {t('common.save')}
              </Button>
            ) : null}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

function GstForm({ studio, editable }: { studio: StudioView; editable: boolean }) {
  const { t } = useTranslation();
  const save = useSaveStudio(studio);
  const [status, setStatus] = useState<string | null>(null);
  const form = useForm<z.infer<typeof gstSchema>>({
    resolver: zodResolver(gstSchema),
    defaultValues: studio.billingProfile ?? {},
  });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit(async (values) => {
    setStatus(null);
    try {
      await save({ billingProfile: values });
      setStatus('saved');
    } catch (err) {
      setStatus(applyApiError(err, form.setError, ['legalName', 'gstin', 'stateCode']));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('studioProfile.gstTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {!editable ? <Alert tone="info">{t('studioProfile.gstOwnerOnly')}</Alert> : null}
          {status === 'saved' ? <Alert tone="success">{t('common.saved')}</Alert> : null}
          {status && status !== 'saved' ? <Alert tone="error">{status}</Alert> : null}
          <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('studioProfile.legalName')}
              error={e.legalName?.message}
              className="sm:col-span-2"
            >
              <Input {...form.register('legalName')} />
            </Field>
            <Field label={t('studioProfile.gstin')} error={e.gstin?.message}>
              <Input autoCapitalize="characters" {...form.register('gstin')} />
            </Field>
            <Field label={t('studioProfile.stateCode')} error={e.stateCode?.message}>
              <Input inputMode="numeric" maxLength={2} {...form.register('stateCode')} />
            </Field>
            {editable ? (
              <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
                {t('common.save')}
              </Button>
            ) : null}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

function DangerZone({ studio }: { studio: StudioView }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: studioKey(studio.id) });
  const schedule = useMutation({
    mutationFn: () => apiFetch(`/studios/${studio.id}`, json('DELETE', { password })),
    onSuccess: () => {
      setPassword('');
      return refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: () => apiFetch(`/studios/${studio.id}/cancel-deletion`, json('POST')),
    onSuccess: refresh,
  });
  const deleteOn = studio.deletionRequestedAt
    ? new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
        dateStyle: 'long',
      }).format(new Date(Date.parse(studio.deletionRequestedAt) + 30 * 86_400_000))
    : '';
  return (
    <Card className="border-danger/40">
      <CardHeader>
        <CardTitle>{t('studioProfile.danger')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t('studioProfile.dangerBody')}</p>
        {studio.status === 'pending_deletion' ? (
          <>
            <Alert tone="warning">{t('studioProfile.pending', { date: deleteOn })}</Alert>
            <Button
              variant="outline"
              className="self-start"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending}
            >
              {t('studioProfile.cancelDeletion')}
            </Button>
          </>
        ) : (
          <form
            noValidate
            className="flex flex-col gap-4 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              schedule.mutate();
            }}
          >
            <Field
              className="flex-1"
              label={t('studioProfile.deleteConfirm')}
              error={schedule.error ? (schedule.error as Error).message : undefined}
            >
              <PasswordInput
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                showLabel={t('common.showPassword')}
                hideLabel={t('common.hidePassword')}
              />
            </Field>
            <Button type="submit" variant="danger" disabled={!password || schedule.isPending}>
              {t('studioProfile.delete')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
