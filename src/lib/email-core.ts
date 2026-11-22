/**
 * Transactional email, transport-agnostic. No `astro:*` imports: the app binds
 * it in `email.ts` and `scripts/email-test.ts` binds it from `process.env`.
 *
 * Transports (`EMAIL_TRANSPORT`):
 * - `console`: prints subject, recipient and links to the terminal. In a
 *   production build it prints subject and recipient only (never links, they
 *   carry live tokens) and reports "not configured".
 * - `gmail`: nodemailer over smtp.gmail.com:465 with a Gmail App Password.
 *   Temporary until we have a domain. Capped per day (see `GMAIL_DAILY_*`).
 * - `resend`: Resend API, `EMAIL_FROM` on a verified domain. The target
 *   before launch.
 *
 * `sendEmail` never throws: failures are logged and returned as `{ ok: false }`.
 */
import { sql } from 'drizzle-orm';
import nodemailer, { type Transporter } from 'nodemailer';
import { Resend } from 'resend';
import type { Db } from './db/create-db';
import { emailSendCounts } from './db/schema';

export const EMAIL_TRANSPORTS = ['console', 'gmail', 'resend'] as const;
export type EmailTransportKind = (typeof EMAIL_TRANSPORTS)[number];

/** Gmail allows ~500 messages per rolling 24h; stay well under it. */
export const GMAIL_DAILY_WARN = 400;
export const GMAIL_DAILY_CAP = 480;
/** Calendar day used by the Gmail counter. */
export const EMAIL_COUNT_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export type SendEmailResult = { ok: true } | { ok: false; reason: 'not-configured' | 'daily-cap' | 'failed' };

export interface EmailConfig {
  transport: EmailTransportKind;
  /** Sender display name (`SITE_NAME`). */
  siteName: string;
  /** Production build: the console transport never prints links. */
  production: boolean;
  gmailUser?: string;
  gmailAppPassword?: string;
  resendApiKey?: string;
  emailFrom?: string;
  /** Counts Gmail sends per day. Without it the Gmail cap is not enforced (scripts only). */
  db?: Db;
}

export interface Mailer {
  readonly transport: EmailTransportKind;
  sendEmail(message: EmailMessage): Promise<SendEmailResult>;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export function parseEmailTransport(value: string | undefined, fallback: EmailTransportKind): EmailTransportKind {
  if (!value) return fallback;
  if ((EMAIL_TRANSPORTS as readonly string[]).includes(value)) return value as EmailTransportKind;
  throw new Error(`EMAIL_TRANSPORT must be one of ${EMAIL_TRANSPORTS.join(', ')}, got "${value}".`);
}

const LINK_PATTERN = /https?:\/\/[^\s<>"]+/g;

/** Adds one send to today's counter and returns the new total. */
async function countGmailSend(db: Db): Promise<number> {
  const today = sql`(now() at time zone ${EMAIL_COUNT_TIME_ZONE})::date`;
  const [row] = await db
    .insert(emailSendCounts)
    .values({ day: today, count: 1 })
    .onConflictDoUpdate({ target: emailSendCounts.day, set: { count: sql`${emailSendCounts.count} + 1` } })
    .returning({ count: emailSendCounts.count });
  return row?.count ?? 1;
}

export function createMailer(config: EmailConfig): Mailer {
  const { transport, siteName, production } = config;

  // One transporter / client per process, created on first use.
  let gmail: Transporter | null = null;
  let resend: Resend | null = null;

  async function sendConsole(message: EmailMessage): Promise<SendEmailResult> {
    if (production) {
      console.warn(`[email] console transport in production, not sent: "${message.subject}" to ${message.to}`);
      return { ok: false, reason: 'not-configured' };
    }
    const links = message.text.match(LINK_PATTERN) ?? [];
    console.info(
      [`[email] To: ${message.to}`, `  Subject: ${message.subject}`, ...links.map((link) => `  Link: ${link}`)].join('\n'),
    );
    return { ok: true };
  }

  async function sendGmail(message: EmailMessage): Promise<SendEmailResult> {
    const { gmailUser, gmailAppPassword } = config;
    if (!gmailUser || !gmailAppPassword) {
      console.error('[email] gmail transport needs GMAIL_USER and GMAIL_APP_PASSWORD.');
      return { ok: false, reason: 'not-configured' };
    }
    if (config.db) {
      const count = await countGmailSend(config.db);
      if (count > GMAIL_DAILY_CAP) {
        console.error(`[email] Gmail daily cap reached (${GMAIL_DAILY_CAP}/day), not sent: "${message.subject}"`);
        return { ok: false, reason: 'daily-cap' };
      }
      if (count >= GMAIL_DAILY_WARN) {
        console.warn(`[email] Gmail sends today: ${count}/${GMAIL_DAILY_CAP}. Switch to Resend before launch.`);
      }
    }
    gmail ??= nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailAppPassword },
      // Fail fast: these sends run inside a user's request.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    await gmail.sendMail({
      from: { name: siteName, address: gmailUser },
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    return { ok: true };
  }

  async function sendResend(message: EmailMessage): Promise<SendEmailResult> {
    const { resendApiKey, emailFrom } = config;
    if (!resendApiKey || !emailFrom) {
      console.error('[email] resend transport needs RESEND_API_KEY and EMAIL_FROM.');
      return { ok: false, reason: 'not-configured' };
    }
    resend ??= new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });
    if (error) throw new Error(`Resend: ${error.message}`);
    return { ok: true };
  }

  const senders = { console: sendConsole, gmail: sendGmail, resend: sendResend } as const;

  return {
    transport,
    async sendEmail(message) {
      try {
        return await senders[transport](message);
      } catch (error) {
        // nodemailer errors carry the SMTP response, never the password.
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[email] ${transport} send failed: "${message.subject}" to ${message.to}: ${detail}`);
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
