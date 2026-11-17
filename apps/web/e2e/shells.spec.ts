import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  { path: '/', heading: /Every guest gets their photos/ },
  // Signed-out visits to signed-in areas land on log in (the studio area itself is
  // covered with a real session in phase2-journey.spec.ts).
  { path: '/studio/lens-story/events', heading: 'Welcome back' },
  { path: '/me/privacy', heading: 'Welcome back' },
  { path: '/signup', heading: 'Create your account' },
  { path: '/forgot', heading: 'Reset your password' },
  { path: '/legal/biometric', heading: 'Biometric Data Notice' },
  {
    path: '/invite/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    heading: "We couldn't find this invitation",
  },
  { path: '/admin/queues', heading: 'Queues & jobs' },
  { path: '/g/aB3dE5fG7h', heading: 'Gallery' },
  { path: '/no/such/page', heading: 'Page not found' },
];

for (const p of pages) {
  test(`${p.path} renders and has no WCAG 2.1 AA violations`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(p.path);
    await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeAttached();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    expect(errors).toEqual([]);
    // No sideways scrolling on any screen size (mobile-first audience).
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('dark mode toggle persists across reloads', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'));
  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
  await page.reload();
  await expect(html).toHaveClass(wasDark ? /^(?!.*dark)/ : /dark/);
});

test('language switch to Hindi translates the page', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Language').selectOption('hi');
  await expect(page.getByRole('heading', { level: 1, name: 'फिर से स्वागत है' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
});

test('mobile menu opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only behaviour');
  // The admin area is not sign-in gated until Phase 9, so it exercises the app shell.
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Users' }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole('dialog')).toBeHidden();
});
