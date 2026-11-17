import type { EmailTemplate } from '@snapshare/types';
import { describe, expect, it } from 'vitest';
import { renderEmail } from './templates.js';

const TEMPLATES: EmailTemplate[] = [
  'verify_email',
  'account_exists',
  'password_reset',
  'password_changed',
  'studio_invite',
];

describe('email templates', () => {
  it.each(TEMPLATES.flatMap((t) => (['en', 'hi'] as const).map((l) => [t, l] as const)))(
    '%s renders in %s with no unfilled placeholders',
    (template, locale) => {
      const email = renderEmail({
        template,
        locale,
        to: 'a@example.com',
        data: {
          name: 'Asha',
          url: 'https://app.snapshare.in/verify?token=abc',
          loginUrl: 'https://app.snapshare.in/login',
          resetUrl: 'https://app.snapshare.in/forgot',
          inviterName: 'Rohan',
          studioName: 'Lens Story',
          roleName: 'Editor',
        },
      });
      expect(email.subject.length).toBeGreaterThan(5);
      expect(email.text).toMatch(template === 'studio_invite' ? /Rohan/ : /Asha/);
      expect(`${email.text}${email.html}`).not.toMatch(/\{\w+\}/);
      expect(email.html).toContain(`lang="${locale}"`);
    },
  );

  it('escapes user-controlled values in HTML', () => {
    const email = renderEmail({
      template: 'verify_email',
      locale: 'en',
      to: 'a@example.com',
      data: {
        name: '<img src=x onerror=alert(1)>',
        url: 'https://app.snapshare.in/verify?token=a&b=1',
      },
    });
    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img');
    expect(email.html).toContain('token=a&amp;b=1');
  });

  it('drops non-http links instead of rendering them', () => {
    const email = renderEmail({
      template: 'password_reset',
      locale: 'en',
      to: 'a@example.com',
      data: { name: 'Asha', url: 'javascript:alert(1)' },
    });
    expect(email.html).not.toContain('javascript:');
    expect(email.text).not.toContain('javascript:');
  });
});

it('keeps header injection out of subjects', () => {
  const email = renderEmail({
    template: 'studio_invite',
    locale: 'en',
    to: 'a@example.com',
    data: {
      inviterName: 'Evil\r\nBcc: x@y.z',
      studioName: 'S',
      roleName: 'Viewer',
      url: 'https://a.b/c',
    },
  });
  expect(email.subject).not.toMatch(/[\r\n]/);
});
