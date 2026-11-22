/**
 * Shared HTML frame for transactional emails: one column, inline styles,
 * table layout (email clients ignore <style> and CSS variables).
 */
import { escapeHtml } from '../../email-core';
import { SITE_NAME } from '../../site';

/**
 * Exception to "hex values only in global.css" (CLAUDE.md, Email): email
 * clients cannot read our CSS tokens. These mirror the current values of
 * `--color-accent`, `--color-accent-strong`, `--color-ink`, `--color-muted`,
 * `--color-line` and `--color-paper` in `src/styles/global.css`; update both together.
 */
export const EMAIL_COLORS = {
  accent: '#0f3d6e',
  accentStrong: '#0a2c52',
  ink: '#13233a',
  muted: '#5b6b7f',
  line: '#e2e8f0',
  paper: '#ffffff',
} as const;

const FONT = "Arial, 'Helvetica Neue', Helvetica, sans-serif";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** A paragraph; `html` must already be escaped. */
export const paragraph = (html: string): string =>
  `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${EMAIL_COLORS.ink};">${html}</p>`;

/** Fine print in muted text; `html` must already be escaped. */
export const note = (html: string): string =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:20px;color:${EMAIL_COLORS.muted};">${html}</p>`;

/** The one primary button (accent), with the raw URL below for clients that hide buttons. */
export function button(label: string, url: string): string {
  const href = escapeHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 16px;"><tr>
<td style="background:${EMAIL_COLORS.accent};border-radius:8px;">
<a href="${href}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:16px;font-weight:500;color:${EMAIL_COLORS.paper};text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>
${note(`Nếu nút không mở được, hãy sao chép liên kết này vào trình duyệt:<br><a href="${href}" style="color:${EMAIL_COLORS.accentStrong};word-break:break-all;">${href}</a>`)}`;
}

/** Label/value rows; values are escaped here. */
export function details(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value]) => `<tr>
<td style="padding:8px 12px 8px 0;border-top:1px solid ${EMAIL_COLORS.line};font-size:14px;color:${EMAIL_COLORS.muted};vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
<td style="padding:8px 0;border-top:1px solid ${EMAIL_COLORS.line};font-size:16px;color:${EMAIL_COLORS.ink};white-space:pre-line;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px;border-bottom:1px solid ${EMAIL_COLORS.line};">${cells}</table>`;
}

/** Wraps the body in the page frame with the site name on top. */
export function emailLayout(subject: string, body: string): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${EMAIL_COLORS.paper};">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${EMAIL_COLORS.paper};font-family:${FONT};">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;">
<tr><td style="padding:0 0 16px;border-bottom:1px solid ${EMAIL_COLORS.line};font-size:20px;font-weight:500;color:${EMAIL_COLORS.accent};">${escapeHtml(SITE_NAME)}</td></tr>
<tr><td style="padding:24px 0 8px;">${body}</td></tr>
<tr><td style="padding:16px 0 0;border-top:1px solid ${EMAIL_COLORS.line};font-size:12px;line-height:18px;color:${EMAIL_COLORS.muted};">Email tự động từ ${escapeHtml(SITE_NAME)}. Vui lòng không trả lời email này.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
