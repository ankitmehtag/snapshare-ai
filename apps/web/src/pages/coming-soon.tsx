import { EmptyState } from '@snapshare/ui';
import { Construction } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Screen } from '../app/screens';

/** Honest placeholder for a planned screen (no mock data — MASTER_SPEC §19). */
export function ComingSoon({ screen }: { screen: Screen }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="sr-only">{screen.title}</h1>
      <EmptyState
        icon={<Construction aria-hidden="true" />}
        title={t('comingSoon.title', { title: screen.title, phase: screen.phase })}
        description={t('comingSoon.body', { phase: screen.phase })}
      />
      <p className="mt-3 text-center font-mono text-xs text-muted-foreground">{screen.id}</p>
    </div>
  );
}
