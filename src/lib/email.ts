/**
 * The app's mailer: `email-core.ts` bound to `astro:env` and the app DB. The
 * only module app code imports to send email. Never throws; callers decide
 * what to tell the user from `{ ok }`.
 *
 * Runs only in Node server code (actions, Better Auth handlers, never
 * middleware): nodemailer needs Node. The Vercel adapter deploys pages and
 * actions as Node serverless functions; Fly runs the Node adapter.
 */
import {
  EMAIL_FROM,
  EMAIL_TRANSPORT,
  GMAIL_APP_PASSWORD,
  GMAIL_USER,
  RESEND_API_KEY,
} from 'astro:env/server';
import { db } from './db/client';
import { createMailer, type EmailMessage, type SendEmailResult } from './email-core';
import { SITE_NAME } from './site';

export { escapeHtml, type EmailMessage, type SendEmailResult } from './email-core';

const mailer = createMailer({
  // Unset: console (prints links in dev; in production nothing is sent).
  transport: EMAIL_TRANSPORT ?? 'console',
  siteName: SITE_NAME,
  production: import.meta.env.PROD,
  gmailUser: GMAIL_USER,
  gmailAppPassword: GMAIL_APP_PASSWORD,
  resendApiKey: RESEND_API_KEY,
  emailFrom: EMAIL_FROM,
  db,
});

export function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  return mailer.sendEmail(message);
}
