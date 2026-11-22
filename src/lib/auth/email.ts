/**
 * Password reset and email verification emails through `src/lib/email.ts`.
 *
 * Never throws: Better Auth answers the forms the same way either way (the
 * reset form never says whether an email exists). When a send fails, dev
 * prints the link so work can continue; production logs only an error, never
 * the link (it carries a live token).
 */
import { sendEmail } from '../email';
import { resetPassword, verifyEmail, type EmailContent } from '../email/templates';
import type { ResetPasswordEmail } from './create-auth';

async function sendAuthEmail(kind: string, to: string, url: string, content: EmailContent): Promise<void> {
  const result = await sendEmail({ to, ...content });
  if (result.ok) return;
  if (import.meta.env.PROD) {
    console.error(`[auth] ${kind} email not sent (${result.reason}). Check EMAIL_TRANSPORT and its settings.`);
    return;
  }
  console.info(`[auth] ${kind} email not sent (${result.reason}). Link for ${to}:\n  ${url}`);
}

export function sendResetPasswordEmail({ to, name, url }: ResetPasswordEmail): Promise<void> {
  return sendAuthEmail('Password reset', to, url, resetPassword({ name, url }));
}

/** Sent on sign-up and from "Gửi lại email". */
export function sendVerificationEmail({ to, name, url }: ResetPasswordEmail): Promise<void> {
  return sendAuthEmail('Email verification', to, url, verifyEmail({ name, url }));
}
