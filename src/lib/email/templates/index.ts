/** Transactional email templates: plain functions returning `{ subject, html, text }`. */
export { EMAIL_COLORS, type EmailContent } from './layout';
export { newContactRequest, type NewContactRequestEmail } from './new-contact-request';
export { resetPassword } from './reset-password';
export { verifyEmail } from './verify-email';
