import type { NavLinkProps } from '@snapshare/ui';
import { NavLink } from 'react-router';

/** Adapts React Router's NavLink (sets aria-current="page") to the AppShell link contract. */
export function RouterNavLink({ to, end, className, children, onClick }: NavLinkProps) {
  return (
    <NavLink to={to} end={end ?? false} className={className} {...(onClick ? { onClick } : {})}>
      {children}
    </NavLink>
  );
}
