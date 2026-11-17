import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import '../lib/i18n';
import { createQueryClient } from '../lib/query-client';
import { routes } from './router';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('app routes', () => {
  it('renders the landing page', async () => {
    renderAt('/');
    expect(
      await screen.findByRole('heading', { level: 1, name: /Every guest gets their photos/ }),
    ).toBeInTheDocument();
  });

  it('sends signed-out visitors of a studio page to log in, remembering where they were', async () => {
    const router = renderAt('/studio/lens-story/team');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fstudio%2Flens-story%2Fteam');
  });

  it('protects the personal area and account pages the same way', async () => {
    const router = renderAt('/account/sessions');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?next=%2Faccount%2Fsessions');
  });

  it('renders public auth and legal pages', async () => {
    renderAt('/signup');
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
  });

  it('marks legal texts as drafts', async () => {
    renderAt('/legal/privacy');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Draft — pending legal review/)).toBeInTheDocument();
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
