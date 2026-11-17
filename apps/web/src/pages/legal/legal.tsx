import { Alert } from '@snapshare/ui';
import { useTranslation } from 'react-i18next';
import { NavLink, useParams } from 'react-router';
import { NotFound } from '../not-found';
import { LEGAL, type LegalDocKey } from './content';

const DOCS: LegalDocKey[] = ['terms', 'privacy', 'biometric'];

/** PUB-03: versioned legal drafts in English and Hindi. */
export function LegalPage() {
  const { t, i18n } = useTranslation();
  const { doc } = useParams();
  if (!DOCS.includes(doc as LegalDocKey)) return <NotFound />;
  const key = doc as LegalDocKey;
  const content = LEGAL[key][i18n.language === 'hi' ? 'hi' : 'en'];
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav aria-label="Legal documents" className="mb-6 flex flex-wrap gap-2 text-sm">
        {DOCS.map((d) => (
          <NavLink
            key={d}
            to={`/legal/${d}`}
            className="rounded-md px-3 py-1.5 hover:bg-surface-muted aria-[current=page]:bg-primary/10 aria-[current=page]:font-medium aria-[current=page]:text-primary"
          >
            {t(`legal.docs.${d}`)}
          </NavLink>
        ))}
      </nav>
      <article>
        <h1 className="text-3xl font-bold tracking-tight">{t(`legal.docs.${key}`)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('legal.updated', { version: content.version })}
        </p>
        <Alert tone="warning" className="mt-4">
          {t('legal.draft')}
        </Alert>
        {content.sections.map((s) => (
          <section key={s.heading} className="mt-8">
            <h2 className="text-lg font-semibold">{s.heading}</h2>
            {s.body.map((p) => (
              <p key={p} className="mt-2 leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
