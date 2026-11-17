import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  DataTable,
  EmptyState,
  ErrorState,
  Forbidden,
  LoadingSkeleton,
  UsageMeter,
  type NavLinkProps,
} from './index';

describe('state components', () => {
  it('EmptyState shows title, description and action', () => {
    render(
      <EmptyState
        title="No events yet"
        description="Create your first event."
        action={<button>Create event</button>}
      />,
    );
    expect(screen.getByRole('heading', { name: 'No events yet' })).toBeInTheDocument();
    expect(screen.getByText('Create your first event.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create event' })).toBeInTheDocument();
  });

  it('ErrorState is announced, shows the request id and retries', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} requestId="req_123" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Reference: req_123');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('ErrorState hides the retry button when there is nothing to retry', () => {
    render(<ErrorState />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Forbidden and LoadingSkeleton expose accessible text', () => {
    render(
      <>
        <Forbidden />
        <LoadingSkeleton label="Loading events" />
      </>,
    );
    expect(screen.getByRole('heading', { name: /don’t have access/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Loading events');
  });
});

describe('UsageMeter', () => {
  it('reports usage to assistive tech and caps at 100 %', () => {
    render(<UsageMeter label="Storage" used={600} limit={500} format={(n) => `${n} GB`} />);
    const meter = screen.getByRole('meter', { name: 'Storage' });
    expect(meter).toHaveAttribute('aria-valuetext', '100%');
    expect(screen.getByText('600 GB / 500 GB')).toBeInTheDocument();
  });
});

describe('DataTable', () => {
  const columns = [
    { key: 'name', header: 'Name', cell: (r: { id: string; name: string }) => r.name },
  ];
  const base = { caption: 'Events', columns, rowKey: (r: { id: string }) => r.id };

  it('renders loading, error, empty and data states', () => {
    const { rerender } = render(
      <DataTable {...base} rows={undefined} isLoading empty={{ title: 'No events' }} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<DataTable {...base} rows={undefined} error={{}} empty={{ title: 'No events' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();

    rerender(<DataTable {...base} rows={[]} empty={{ title: 'No events' }} />);
    expect(screen.getByRole('heading', { name: 'No events' })).toBeInTheDocument();

    rerender(<DataTable {...base} rows={[{ id: '1', name: 'Wedding' }]} empty={{ title: 'x' }} />);
    expect(screen.getByRole('table', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Wedding' })).toBeInTheDocument();
  });
});

describe('AppShell', () => {
  const Link = ({ to, className, children, onClick }: NavLinkProps) => (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      {...(to === '/studio/x/events' ? { 'aria-current': 'page' as const } : {})}
    >
      {children}
    </a>
  );
  const nav = [
    { to: '/studio/x', label: 'Dashboard', end: true },
    { to: '/studio/x/events', label: 'Events' },
  ];

  it('has a skip link, labelled navigation and a main landmark', () => {
    render(
      <AppShell area="studio" areaLabel="Studio" nav={nav} linkComponent={Link}>
        <h1>Events</h1>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
    const navigation = screen.getByRole('navigation', { name: 'Studio navigation' });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole('main')).toContainElement(
      screen.getByRole('heading', { name: 'Events' }),
    );
    expect(screen.getAllByRole('link', { name: 'Events' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('opens and closes the mobile menu', async () => {
    render(
      <AppShell area="personal" areaLabel="Personal" nav={nav} linkComponent={Link}>
        content
      </AppShell>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('dialog', { name: 'Personal menu' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('link', { name: 'Events' })[1]!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
