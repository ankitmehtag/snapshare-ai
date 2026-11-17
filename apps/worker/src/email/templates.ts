import type { EmailJob, EmailTemplate } from '@snapshare/types';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Copy = {
  subject: string;
  /** Paragraphs. `{name}` etc. are replaced with escaped values from job.data. */
  body: string[];
  /** Optional call-to-action: [label, data key holding the URL]. */
  action?: [string, string];
  footer: string;
};

const COPY: Record<EmailTemplate, Record<'en' | 'hi', Copy>> = {
  verify_email: {
    en: {
      subject: 'Confirm your email for SnapShare',
      body: ['Hi {name},', 'Please confirm your email address to finish setting up your account.'],
      action: ['Confirm email', 'url'],
      footer: 'This link expires in 24 hours. If you did not create an account, ignore this email.',
    },
    hi: {
      subject: 'SnapShare के लिए अपना ईमेल पुष्टि करें',
      body: ['नमस्ते {name},', 'अपना खाता सेट करना पूरा करने के लिए कृपया अपने ईमेल पते की पुष्टि करें।'],
      action: ['ईमेल की पुष्टि करें', 'url'],
      footer: 'यह लिंक 24 घंटे में समाप्त हो जाएगा। अगर आपने खाता नहीं बनाया है, तो इस ईमेल को अनदेखा करें।',
    },
  },
  account_exists: {
    en: {
      subject: 'You already have a SnapShare account',
      body: [
        'Hi {name},',
        'Someone (hopefully you) tried to sign up with this email, but an account already exists.',
        'You can sign in at {loginUrl}.',
      ],
      action: ['Reset your password', 'resetUrl'],
      footer: 'If this was not you, no action is needed. Your account is unchanged.',
    },
    hi: {
      subject: 'आपका SnapShare खाता पहले से मौजूद है',
      body: [
        'नमस्ते {name},',
        'किसी ने (शायद आपने) इस ईमेल से साइन अप करने की कोशिश की, लेकिन खाता पहले से मौजूद है।',
        'आप {loginUrl} पर साइन इन कर सकते हैं।',
      ],
      action: ['अपना पासवर्ड रीसेट करें', 'resetUrl'],
      footer: 'अगर यह आप नहीं थे, तो कुछ करने की ज़रूरत नहीं है। आपका खाता अपरिवर्तित है।',
    },
  },
  password_reset: {
    en: {
      subject: 'Reset your SnapShare password',
      body: ['Hi {name},', 'We received a request to reset your password.'],
      action: ['Choose a new password', 'url'],
      footer:
        'This link expires in 1 hour and works once. If you did not ask for this, ignore this email; your password stays the same.',
    },
    hi: {
      subject: 'अपना SnapShare पासवर्ड रीसेट करें',
      body: ['नमस्ते {name},', 'हमें आपका पासवर्ड रीसेट करने का अनुरोध मिला है।'],
      action: ['नया पासवर्ड चुनें', 'url'],
      footer:
        'यह लिंक 1 घंटे में समाप्त हो जाएगा और एक ही बार काम करेगा। अगर आपने यह अनुरोध नहीं किया है, तो इसे अनदेखा करें; आपका पासवर्ड नहीं बदलेगा।',
    },
  },
  password_changed: {
    en: {
      subject: 'Your SnapShare password was changed',
      body: [
        'Hi {name},',
        'Your password was just changed, and other devices were signed out.',
        'If you did not do this, reset your password right away and contact support.',
      ],
      footer: 'This is a security notification for your account.',
    },
    hi: {
      subject: 'आपका SnapShare पासवर्ड बदल दिया गया',
      body: [
        'नमस्ते {name},',
        'आपका पासवर्ड अभी बदला गया है, और दूसरे डिवाइस से साइन आउट कर दिया गया है।',
        'अगर यह आपने नहीं किया, तो तुरंत अपना पासवर्ड रीसेट करें और सपोर्ट से संपर्क करें।',
      ],
      footer: 'यह आपके खाते के लिए एक सुरक्षा सूचना है।',
    },
  },
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);

/** Only http(s) links of our own app ever reach an email; anything else is dropped. */
const safeUrl = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : undefined);

const fill = (line: string, data: Record<string, string>, escape: (s: string) => string) =>
  line.replace(/\{(\w+)\}/g, (_, key: string) => escape(data[key] ?? ''));

export function renderEmail(job: EmailJob): RenderedEmail {
  const copy = COPY[job.template][job.locale];
  const url = copy.action ? safeUrl(job.data[copy.action[1]]) : undefined;

  const text = [
    ...copy.body.map((l) => fill(l, job.data, (s) => s)),
    ...(copy.action && url ? [`${copy.action[0]}: ${url}`] : []),
    '',
    copy.footer,
    '— SnapShare',
  ].join('\n\n');

  const paragraphs = copy.body
    .map((l) => `<p style="margin:0 0 16px">${fill(escapeHtml(l), job.data, escapeHtml)}</p>`)
    .join('');
  const button =
    copy.action && url
      ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:600">${escapeHtml(copy.action[0])}</a></p>` +
        `<p style="margin:0 0 16px;font-size:13px;color:#555">${escapeHtml(url)}</p>`
      : '';
  const html =
    `<!doctype html><html lang="${job.locale}"><body style="margin:0;padding:24px;background:#f6f6f8;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1a1a1a">` +
    `<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">` +
    `<p style="margin:0 0 24px;font-weight:700;font-size:18px">SnapShare</p>` +
    paragraphs +
    button +
    `<p style="margin:24px 0 0;font-size:13px;color:#666">${escapeHtml(copy.footer)}</p>` +
    `</div></body></html>`;

  return { subject: copy.subject, text, html };
}
