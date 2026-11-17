import { createTransport } from 'nodemailer';
import type { RenderedEmail } from './templates.js';

/**
 * Email provider seam (ARCHITECTURAL_GAPS G10). Brevo, Resend and Amazon SES all
 * accept SMTP, so switching providers is a config change, not a code change.
 */
export interface Mailer {
  send(to: string, email: RenderedEmail): Promise<void>;
  close(): void;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string | undefined;
  pass?: string | undefined;
  from: string;
}

export function smtpMailer(cfg: SmtpConfig): Mailer {
  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    ...(cfg.user ? { auth: { user: cfg.user, pass: cfg.pass ?? '' } } : {}),
    pool: true,
    maxConnections: 5,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    async send(to, email) {
      await transport.sendMail({
        from: cfg.from,
        to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
    },
    close: () => transport.close(),
  };
}
