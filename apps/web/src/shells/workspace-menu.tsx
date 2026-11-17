import { ChevronDown, LogOut, Plus, Settings, Smartphone } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { useMe, useSignOut } from '../lib/session';

const item =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-muted aria-[current=true]:font-medium aria-[current=true]:text-primary [&_svg]:size-4';

/**
 * GL-01 workspace switcher + account menu. Built on <details>/<summary> so it is
 * keyboard and screen-reader accessible without custom focus management.
 */
export function WorkspaceMenu() {
  const { t } = useTranslation();
  const me = useMe();
  const { studioSlug } = useParams();
  const signOut = useSignOut();
  const ref = useRef<HTMLDetailsElement>(null);
  const close = () => ref.current?.removeAttribute('open');
  if (!me.data) return null;

  const studios = me.data.workspaces.filter((w) => w.type === 'studio');
  const current = studios.find((s) => s.slug === studioSlug);
  return (
    <details ref={ref} className="relative">
      <summary className="flex h-9 max-w-56 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm hover:bg-surface-muted [&::-webkit-details-marker]:hidden">
        <span className="truncate">{current?.name ?? me.data.name}</span>
        <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        <span className="sr-only">{t('workspace.switch')}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface p-1 shadow-lg">
        {studios.length ? (
          <>
            <p className="px-3 pb-1 pt-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t('workspace.studios')}
            </p>
            <ul>
              {studios.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/studio/${s.slug ?? ''}`}
                    className={item}
                    aria-current={s.slug === studioSlug}
                    onClick={close}
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t(`team.roles.${s.roleKey ?? 'viewer'}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <hr className="my-1 border-border" />
          </>
        ) : null}
        <Link to="/onboarding/studio" className={item} onClick={close}>
          <Plus aria-hidden="true" /> {t('workspace.newStudio')}
        </Link>
        <Link to="/account" className={item} onClick={close}>
          <Settings aria-hidden="true" /> {t('workspace.account')}
        </Link>
        <Link to="/account/sessions" className={item} onClick={close}>
          <Smartphone aria-hidden="true" /> {t('account.sessionsTitle')}
        </Link>
        <button
          type="button"
          className={item}
          onClick={() => {
            close();
            void signOut();
          }}
        >
          <LogOut aria-hidden="true" /> {t('common.signOut')}
        </button>
      </div>
    </details>
  );
}
