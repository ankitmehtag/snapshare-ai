import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import '../lib/i18n';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}

describe('app routes', () => {
  it('renders the landing page', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Every guest gets their photos/ }),
    ).toBeInTheDocument();
  });

  it('renders the studio shell with an honest placeholder', async () => {
    renderAt('/studio/lens-story/events');
    expect(await screen.findByText('Events is coming in Phase 3')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Studio navigation' });
    expect(nav).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Events' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('renders personal, admin and gallery areas', async () => {
    renderAt('/me/privacy');
    expect(await screen.findByText('Privacy & face data is coming in Phase 4')).toBeInTheDocument();
  });

  it('renders the admin area', async () => {
    renderAt('/admin/queues');
    expect(await screen.findByText('Queues & jobs is coming in Phase 9')).toBeInTheDocument();
  });

  it('renders the guest gallery without marketing navigation', async () => {
    renderAt('/g/aB3dE5fG7h');
    expect(await screen.findByText('Gallery is coming in Phase 3')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Pricing' })).not.toBeInTheDocument();
  });

  it('shows not-found for unknown paths', async () => {
    renderAt('/definitely/not/here');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
