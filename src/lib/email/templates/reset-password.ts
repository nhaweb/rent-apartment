import { escapeHtml } from '../../email-core';
import { SITE_NAME } from '../../site';
import { button, emailLayout, note, paragraph, type EmailContent } from './layout';

/** Password reset link (Better Auth, valid 1 hour). */
export function resetPassword({ name, url }: { name: string; url: string }): EmailContent {
  const subject = `Đặt lại mật khẩu ${SITE_NAME}`;
  const text = [
    `Chào ${name},`,
    '',
    'Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Mở liên kết sau để đặt mật khẩu mới. Liên kết có hiệu lực trong 1 giờ:',
    url,
    '',
    'Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn không thay đổi.',
    '',
    `— ${SITE_NAME}`,
  ].join('\n');
  const html = emailLayout(
    subject,
    [
      paragraph(`Chào ${escapeHtml(name)},`),
      paragraph('Bạn (hoặc ai đó) vừa yêu cầu đặt lại mật khẩu. Liên kết có hiệu lực trong 1 giờ.'),
      button('Đặt mật khẩu mới', url),
      note('Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu của bạn không thay đổi.'),
    ].join('\n'),
  );
  return { subject, html, text };
}
