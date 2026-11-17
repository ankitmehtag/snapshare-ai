import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const pages = [
  { path: '/', heading: /Every guest gets their photos/ },
  { path: '/studio/lens-story/events', heading: 'Events' },
  { path: '/me/privacy', heading: 'Privacy & face data' },
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

test('language switch to Hindi translates navigation', async ({ page, isMobile }) => {
  await page.goto('/studio/lens-story/events');
  await page.getByLabel('Language').selectOption('hi');
  if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
  await expect(page.getByRole('link', { name: 'इवेंट' }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
});

test('mobile menu opens and navigates', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile-only behaviour');
  await page.goto('/me');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Albums' }).click();
  await expect(page).toHaveURL(/\/me\/albums$/);
  await expect(page.getByRole('dialog')).toBeHidden();
});
