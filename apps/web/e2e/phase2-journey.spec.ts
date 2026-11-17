/**
 * Phase 2C gate journey (PHASE_2_PLAN §3): sign up → confirm email from Mailpit →
 * log in → create studio → invite → the invitee joins in a second browser → owner
 * changes their role → the change appears in the activity log. Every new screen on
 * the way is checked with axe (WCAG 2.1 AA) and for horizontal overflow.
 * Needs `pnpm infra:up` (MongoDB, Valkey, Qdrant, Mailpit) and network access to
 * Cloudflare Turnstile (test keys) and HIBP.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

const MAILPIT = 'http://127.0.0.1:8025';
const PASSWORD = 'a long journey passphrase';
const run = Math.random().toString(36).slice(2, 8);

test.describe.configure({ mode: 'serial' });
test.skip(
  ({ isMobile }) => isMobile,
  'one full journey on desktop; screens are axe-checked on mobile in shells.spec',
);

/** Each simulated person gets their own IP so per-IP auth rate limits don't collide. */
async function person(browser: Browser) {
  const context = await browser.newContext();
  const ip = `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  await context.route('**/api/**', (route) =>
    route.continue({ headers: { ...route.request().headers(), 'x-forwarded-for': ip } }),
  );
  return context.newPage();
}

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // Cloudflare's widget is a third-party iframe we can't change.
    .exclude('iframe[src*="challenges.cloudflare.com"]')
    .analyze();
  expect(results.violations.map((v) => `${label} — ${v.id}: ${v.help}`)).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(0);
}

async function linkFromMail(to: string, pattern: RegExp): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    for (const m of messages) {
      const msg = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
        Text: string;
      };
      const match = msg.Text.match(pattern);
      if (match) return match[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email to ${to} matching ${pattern}`);
}

async function waitForCaptcha(page: Page) {
  await expect
    .poll(
      () =>
        page
          .locator('input[name="cf-turnstile-response"]')
          .inputValue()
          .catch(() => ''),
      {
        timeout: 20_000,
      },
    )
    .not.toBe('');
}

async function signUp(page: Page, name: string, email: string, path = '/signup') {
  await page.goto(path);
  await audit(page, 'AUTH-01 sign up');
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await waitForCaptcha(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
}

async function confirmEmail(page: Page, email: string) {
  const link = await linkFromMail(email, /http:\/\/127\.0\.0\.1:4173\/verify\?token=[\w-]+/);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Your email is confirmed' })).toBeVisible();
  await audit(page, 'AUTH-03 verify');
}

async function logIn(page: Page, email: string, path = '/login') {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
}

const owner = { name: 'Rohan Verma', email: `owner_${run}@example.com` };
const member = { name: 'Asha Rao', email: `asha_${run}@example.com` };
const studioName = `Lens Story ${run}`;
let studioPath = '';

test('owner signs up, confirms email, creates a studio and invites a teammate', async ({
  browser,
}) => {
  const page = await person(browser);
  await signUp(page, owner.name, owner.email);
  await confirmEmail(page, owner.email);

  await logIn(page, owner.email);
  await audit(page, 'AUTH-02 log in');
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'How will you use SnapShare?' })).toBeVisible();
  await audit(page, 'ONB-01 onboarding');

  await page.getByRole('link', { name: /For my photography business/ }).click();
  await page.getByLabel('Studio name').fill(studioName);
  await expect(page.getByLabel('Studio web address')).toHaveValue(`lens-story-${run}`);
  await expect(page.getByText('Available')).toBeVisible();
  await audit(page, 'ONB-02 studio setup');
  await page.getByRole('button', { name: 'Create studio' }).click();

  await expect(page).toHaveURL((url) => url.pathname === `/studio/lens-story-${run}`);
  studioPath = new URL(page.url()).pathname;

  await page
    .getByRole('navigation', { name: 'Studio navigation' })
    .getByRole('link', { name: 'Team' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Team' })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Team seats' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  );
  await audit(page, 'ST-40 team');

  await page.getByLabel('Email address').fill(member.email);
  await page.getByLabel('Role', { exact: true }).selectOption('editor');
  await page.getByRole('button', { name: 'Send invitation' }).click();
  await expect(page.getByText(`Invitation sent to ${member.email}.`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending invitations' })).toBeVisible();
  await expect(page.getByText(member.email, { exact: true })).toBeVisible();

  await page.goto(`${studioPath}/settings/profile`);
  await expect(page.getByRole('heading', { level: 1, name: 'Studio profile' })).toBeVisible();
  await audit(page, 'ST-02 studio profile');
  await page.getByLabel('GSTIN').fill('27ABCDE1234F1Z5');
  await page.getByLabel('State code').fill('27');
  await page.getByRole('button', { name: 'Save changes' }).last().click();
  await expect(page.getByText('Saved').last()).toBeVisible();
  await page.context().close();
});

test('the invitee joins from the email in a second browser', async ({ browser }) => {
  const page = await person(browser);
  const inviteLink = await linkFromMail(member.email, /http:\/\/127\.0\.0\.1:4173\/invite\/[\w-]+/);
  await page.goto(inviteLink);
  await expect(page.getByRole('heading', { name: "You're invited" })).toBeVisible();
  await expect(
    page.getByText(`${owner.name} invited you to join ${studioName} as Editor.`),
  ).toBeVisible();
  await audit(page, 'AUTH-06 invitation');

  await page.getByRole('link', { name: 'Create an account to accept' }).click();
  await signUp(page, member.name, member.email, page.url().replace('http://127.0.0.1:4173', ''));
  // Signing up does not sign in: log in and come back to the invitation.
  await logIn(
    page,
    member.email,
    `/login?next=${encodeURIComponent(new URL(inviteLink).pathname)}`,
  );
  await expect(page.getByRole('heading', { name: "You're invited" })).toBeVisible();
  await page.getByRole('button', { name: 'Accept and join' }).click();
  await expect(page).toHaveURL((url) => url.pathname === studioPath);

  // Accepting proved the inbox, so the email counts as confirmed.
  await expect(page.getByText('Please confirm your email address')).toHaveCount(0);
  await page.goto('/account/sessions');
  await expect(page.getByText('This device')).toBeVisible();
  await audit(page, 'GL-03 sessions');
  await page.goto('/account');
  await audit(page, 'GL-02 account');
  await page.context().close();
});

test('the owner changes the role and sees it in the activity log', async ({ browser }) => {
  const page = await person(browser);
  await logIn(page, owner.email);
  await expect(page).toHaveURL((url) => url.pathname === studioPath);
  await page.goto(`${studioPath}/team`);
  await page.getByLabel(`Role for ${member.name}`).selectOption('viewer');
  await expect(page.getByLabel(`Role for ${member.name}`)).toHaveValue('viewer');

  await page.getByRole('link', { name: 'View activity' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Team activity' })).toBeVisible();
  await expect(page.getByText(`${owner.name} changed a role from Editor to Viewer`)).toBeVisible();
  await expect(page.getByText(`${member.name} joined as Editor`)).toBeVisible();
  await audit(page, 'ST-41 activity');

  // Workspace switcher (GL-01) shows the studio and signs out.
  await page.getByText(studioName, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`${studioPath}/team`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.context().close();
});
