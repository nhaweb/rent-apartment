import { escapeHtml } from '../../email-core';
import { formatPhone } from '../../format';
import { SITE_NAME } from '../../site';
import { button, details, emailLayout, note, paragraph, type EmailContent } from './layout';

export interface NewContactRequestEmail {
  landlordName: string;
  roomTitle: string;
  renterName: string;
  renterPhone: string;
  /** Optional in the form; omitted from the email when empty. */
  message?: string | null;
  preferredViewingTime?: string | null;
  /** Contact inbox in the dashboard. */
  dashboardUrl: string;
}

/** Tells the landlord a renter asked to see a room. Renters give a phone, not an email: no reply-to. */
export function newContactRequest(input: NewContactRequestEmail): EmailContent {
  const phone = formatPhone(input.renterPhone);
  const rows: [string, string][] = [
    ['Phòng', input.roomTitle],
    ['Người thuê', input.renterName],
    ['Số điện thoại', phone],
    ...(input.preferredViewingTime ? [['Muốn xem phòng', input.preferredViewingTime] as [string, string]] : []),
    ...(input.message ? [['Lời nhắn', input.message] as [string, string]] : []),
  ];

  const subject = `${SITE_NAME}: yêu cầu xem phòng “${input.roomTitle}”`;
  const text = [
    `Chào ${input.landlordName},`,
    '',
    'Có người vừa gửi yêu cầu xem phòng:',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Xem và cập nhật trạng thái: ${input.dashboardUrl}`,
    '',
    'Người thuê để lại số điện thoại, không phải email: hãy gọi hoặc nhắn Zalo, đừng trả lời email này.',
    '',
    `— ${SITE_NAME}`,
  ].join('\n');
  const html = emailLayout(
    subject,
    [
      paragraph(`Chào ${escapeHtml(input.landlordName)},`),
      paragraph('Có người vừa gửi yêu cầu xem phòng:'),
      details(rows),
      button('Xem yêu cầu trong trang quản lý', input.dashboardUrl),
      note('Người thuê để lại số điện thoại, không phải email: hãy gọi hoặc nhắn Zalo, đừng trả lời email này.'),
    ].join('\n'),
  );
  return { subject, html, text };
}
