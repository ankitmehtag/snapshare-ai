import { zodResolver } from '@hookform/resolvers/zod';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Field,
  Input,
  Select,
  UsageMeter,
  buttonVariants,
  type Column,
} from '@snapshare/ui';
import { inviteBody } from '@snapshare/validators';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { z } from 'zod';
import { useCursorList } from '../../lib/use-cursor-list';
import { ApiError, apiFetch, json } from '../../lib/api';
import { applyApiError } from '../../lib/forms';
import { studioKey, useStudio } from './studio-context';

interface Member {
  userId: string;
  name: string;
  email: string;
  roleKey: string;
  status: string;
  joinedAt: string;
  you: boolean;
}
interface Invitation {
  id: string;
  email: string;
  roleKey: string;
  expiresAt: string;
}

const ROLE_ORDER = ['owner', 'admin', 'editor', 'uploader', 'viewer'];

/** ST-40: members, roles, invitations and the seat meter. */
export function TeamPage() {
  const { t, i18n } = useTranslation();
  const { studio, can } = useStudio();
  const qc = useQueryClient();
  const base = `/studios/${studio.id}`;
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const manage = can('team.manage');

  const members = useQuery({
    queryKey: ['members', studio.id],
    queryFn: ({ signal }) => apiFetch<{ data: Member[] }>(`${base}/members`, { signal }),
  });
  const invitations = useQuery({
    queryKey: ['invitations', studio.id],
    queryFn: ({ signal }) => apiFetch<{ data: Invitation[] }>(`${base}/invitations`, { signal }),
  });
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['members', studio.id] }),
      qc.invalidateQueries({ queryKey: ['invitations', studio.id] }),
      qc.invalidateQueries({ queryKey: studioKey(studio.id) }),
    ]);
  const fail = (err: unknown) =>
    setNotice({ tone: 'error', text: err instanceof ApiError ? err.problem.title : String(err) });

  const changeRole = useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string; roleKey: string }) =>
      apiFetch(`${base}/members/${userId}`, json('PATCH', { roleKey })),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => apiFetch(`${base}/members/${userId}`, json('DELETE')),
    onSuccess: refresh,
    onError: fail,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`${base}/invitations/${id}`, json('DELETE')),
    onSuccess: refresh,
    onError: fail,
  });

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      dateStyle: 'medium',
    }).format(new Date(iso));
  const roleName = (k: string) => t(`team.roles.${k}`);
  const assignable = ROLE_ORDER.filter((r) => studio.role === 'owner' || r !== 'owner');

  const columns: Column<Member>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (m) => (
        <div className="min-w-0">
          <p className="font-medium">
            {m.name} {m.you ? <Badge className="ml-1">{t('team.you')}</Badge> : null}
          </p>
          <p className="truncate text-xs text-muted-foreground">{m.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: t('team.role'),
      cell: (m) =>
        // Your own role changes via ownership transfer, not this menu.
        manage && !m.you && (studio.role === 'owner' || m.roleKey !== 'owner') ? (
          <Select
            aria-label={t('team.changeRoleFor', { name: m.name })}
            value={m.roleKey}
            className="h-9 w-36"
            onChange={(e) => changeRole.mutate({ userId: m.userId, roleKey: e.target.value })}
            disabled={changeRole.isPending}
          >
            {assignable.map((r) => (
              <option key={r} value={r}>
                {roleName(r)}
              </option>
            ))}
          </Select>
        ) : (
          roleName(m.roleKey)
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (m) =>
        manage && !m.you && (studio.role === 'owner' || m.roleKey !== 'owner') ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm(t('team.removeConfirm', { name: m.name })))
                remove.mutate(m.userId);
            }}
          >
            {t('team.remove')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t('team.title')}</h1>
        {can('audit.view') ? (
          <Link to="activity" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {t('team.viewActivity')}
          </Link>
        ) : null}
      </div>
      {!manage ? <Alert tone="info">{t('team.readOnly')}</Alert> : null}
      {notice ? <Alert tone={notice.tone}>{notice.text}</Alert> : null}
      <Card className="p-5">
        <UsageMeter label={t('team.seats')} used={studio.seats.used} limit={studio.seats.limit} />
      </Card>
      {manage ? (
        <InviteCard
          onInvited={(email) => {
            setNotice({ tone: 'success', text: t('team.invited', { email }) });
            void refresh();
          }}
        />
      ) : null}
      <section aria-labelledby="members-h" className="flex flex-col gap-3">
        <h2 id="members-h" className="text-lg font-semibold">
          {t('team.members')}
        </h2>
        <DataTable
          caption={t('team.members')}
          columns={columns}
          rows={members.data?.data}
          rowKey={(m) => m.userId}
          isLoading={members.isPending}
          error={members.error}
          onRetry={() => void members.refetch()}
          empty={{ title: t('team.members') }}
        />
      </section>
      <section aria-labelledby="pending-h" className="flex flex-col gap-3">
        <h2 id="pending-h" className="text-lg font-semibold">
          {t('team.pending')}
        </h2>
        {invitations.data?.data.length ? (
          <ul className="flex flex-col gap-2">
            {invitations.data.data.map((inv) => (
              <li key={inv.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleName(inv.roleKey)} · {t('team.expires', { date: date(inv.expiresAt) })}
                    </p>
                  </div>
                  {manage ? (
                    <Button variant="ghost" size="sm" onClick={() => revoke.mutate(inv.id)}>
                      {t('team.revoke')}
                    </Button>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t('team.noPending')}</p>
        )}
      </section>
    </div>
  );
}

function InviteCard({ onInvited }: { onInvited: (email: string) => void }) {
  const { t } = useTranslation();
  const { studio } = useStudio();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof inviteBody>>({
    resolver: zodResolver(inviteBody),
    defaultValues: { roleKey: 'editor' },
  });
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await apiFetch(`/studios/${studio.id}/invitations`, json('POST', values));
      form.reset({ email: '', roleKey: values.roleKey });
      onInvited(values.email);
    } catch (err) {
      setFormError(applyApiError(err, form.setError, ['email', 'roleKey']));
    }
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('team.invite')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <Field
            className="flex-1"
            label={t('team.inviteEmail')}
            error={form.formState.errors.email?.message}
          >
            <Input type="email" autoComplete="off" {...form.register('email')} />
          </Field>
          <Field label={t('team.role')}>
            <Select className="sm:w-36" {...form.register('roleKey')}>
              {(['admin', 'editor', 'uploader', 'viewer'] as const).map((r) => (
                <option key={r} value={r}>
                  {t(`team.roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {t('team.sendInvite')}
          </Button>
        </form>
        {formError ? (
          <Alert tone="error" className="mt-4">
            {formError}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface AuditRow {
  id: string;
  at: string;
  action: string;
  actor: { userId: string; name: string } | null;
  meta: Record<string, string>;
}

/** ST-41: studio activity, newest first, with "load more". */
export function ActivityPage() {
  const { t, i18n } = useTranslation();
  const { studio } = useStudio();
  const list = useCursorList<AuditRow>(
    ['audit', studio.id],
    `/studios/${studio.id}/audit-logs`,
    30,
  );
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  const describe = (row: AuditRow) => {
    const meta = Object.fromEntries(
      Object.entries(row.meta).map(([k, v]) => [
        k,
        ['roleKey', 'from', 'to'].includes(k) ? t(`team.roles.${v}`) : v,
      ]),
    );
    return t(`activity.actions.${row.action}`, { ...meta, defaultValue: row.action });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold tracking-tight">{t('activity.title')}</h1>
      <DataTable
        caption={t('activity.title')}
        columns={[
          { key: 'when', header: 'When', className: 'whitespace-nowrap', cell: (r) => when(r.at) },
          {
            key: 'what',
            header: 'Activity',
            cell: (r) => (
              <span>
                <span className="font-medium">{r.actor?.name ?? 'System'}</span> {describe(r)}
              </span>
            ),
          },
        ]}
        rows={list.items}
        rowKey={(r) => r.id}
        isLoading={list.isPending}
        error={list.error}
        onRetry={() => void list.refetch()}
        empty={{ title: t('activity.empty') }}
      />
      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => void list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {t('activity.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}
