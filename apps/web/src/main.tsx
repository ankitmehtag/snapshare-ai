import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { routes } from './app/router';
import { createQueryClient } from './lib/query-client';
import './lib/i18n';
import { PreferencesEffect } from './shells/preferences';
import './styles.css';

const router = createBrowserRouter(routes);
const queryClient = createQueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PreferencesEffect />
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
