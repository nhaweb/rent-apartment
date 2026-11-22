import { escapeHtml } from '../../email-core';
import { SITE_NAME } from '../../site';
import { button, emailLayout, note, paragraph, type EmailContent } from './layout';

/** Email verification link (sign-up and "Gửi lại email", valid 24 hours). */
export function verifyEmail({ name, url }: { name: string; url: string }): EmailContent {
  const subject = `Xác thực email ${SITE_NAME}`;
  const text = [
    `Chào ${name},`,
    '',
    `Mở liên kết sau để xác thực email tài khoản chủ phòng trên ${SITE_NAME}. Liên kết có hiệu lực trong 24 giờ:`,
    url,
    '',
    'Sau khi xác thực, bạn có thể cho phòng hiện công khai. Nếu bạn không đăng ký, hãy bỏ qua email này.',
    '',
    `— ${SITE_NAME}`,
  ].join('\n');
  const html = emailLayout(
    subject,
    [
      paragraph(`Chào ${escapeHtml(name)},`),
      paragraph(
        `Bấm nút dưới đây để xác thực email tài khoản chủ phòng trên ${escapeHtml(SITE_NAME)}. Liên kết có hiệu lực trong 24 giờ.`,
      ),
      button('Xác thực email', url),
      note('Sau khi xác thực, bạn có thể cho phòng hiện công khai. Nếu bạn không đăng ký, hãy bỏ qua email này.'),
    ].join('\n'),
  );
  return { subject, html, text };
}
