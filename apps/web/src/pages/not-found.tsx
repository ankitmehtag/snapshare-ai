import { EmptyState, buttonVariants } from '@snapshare/ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <EmptyState
        headingLevel="h1"
        title={t('notFound.title')}
        description={t('notFound.body')}
        action={
          <Link to="/" className={buttonVariants({ variant: 'outline' })}>
            Go home
          </Link>
        }
      />
    </div>
  );
}
