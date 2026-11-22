/**
 * Sends one email of each template to the given address, through the
 * transport in EMAIL_TRANSPORT (console by default), so the rendering can be
 * checked in a real inbox. Example data only; links point at PUBLIC_SITE_URL
 * and carry no real token.
 *
 *   npm run email:test -- you@example.com
 *
 * Does not touch the database, so these sends are not counted toward the
 * Gmail daily cap (3 per run).
 */
import { createMailer, parseEmailTransport } from '../src/lib/email-core';
import { newContactRequest, resetPassword, verifyEmail } from '../src/lib/email/templates';
import { SITE_NAME } from '../src/lib/site';
import './lib/env';

const to = process.argv[2];
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: npm run email:test -- you@example.com');
  process.exit(1);
}

const transport = parseEmailTransport(process.env.EMAIL_TRANSPORT, 'console');
const site = process.env.PUBLIC_SITE_URL || 'http://localhost:4321';
const mailer = createMailer({
  transport,
  siteName: SITE_NAME,
  production: false,
  gmailUser: process.env.GMAIL_USER,
  gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  resendApiKey: process.env.RESEND_API_KEY,
  emailFrom: process.env.EMAIL_FROM,
});

const samples = {
  resetPassword: resetPassword({ name: 'Nguyễn Văn An', url: new URL('/dat-lai-mat-khau?token=thu-nghiem', site).href }),
  verifyEmail: verifyEmail({ name: 'Nguyễn Văn An', url: new URL('/quan-ly?xac-thuc=ok', site).href }),
  newContactRequest: newContactRequest({
    landlordName: 'Nguyễn Văn An',
    roomTitle: 'Phòng trọ có gác lửng gần biển Ghềnh Ráng',
    renterName: 'Trần Thị Bình',
    renterPhone: '0905123456',
    message: 'Em muốn xem phòng cuối tuần này.\nPhòng còn chỗ để xe máy không ạ?',
    preferredViewingTime: 'Sáng thứ Bảy',
    dashboardUrl: new URL('/quan-ly/lien-he', site).href,
  }),
};

console.log(`email:test via ${transport} to ${to}`);
let failed = 0;
for (const [name, content] of Object.entries(samples)) {
  const result = await mailer.sendEmail({ to, ...content, subject: `[Thử] ${content.subject}` });
  console.log(`  ${name}: ${result.ok ? 'sent' : `NOT sent (${result.reason})`}`);
  if (!result.ok) failed += 1;
}
if (failed) process.exit(1);
