/**
 * POST /api/tro-ly  { messages: [{ role, text }], roomId? }
 *   -> { reply, rooms: ChatRoomCard[], listingUrl?, total? }
 * Renter chat assistant. Same-origin only, rate limited per IP (DB).
 */
import type { APIRoute } from 'astro';
import { clientIp } from '../../lib/auth/request';
import { FALLBACK_REPLY, isChatEnabled, runChat } from '../../lib/chat/assistant';
import { takeHourlyQuota } from '../../lib/rate-limit';
import { CHAT_RATE_LIMIT_PER_HOUR } from 'astro:env/server';
import { CHAT_BODY_MAX, chatRequestSchema } from '../../lib/validation/chat';

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Browser `Origin` must match the host the request was sent to. Compared with
 * the `Host` header, not `request.url`, which the adapters may normalize.
 */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  if (!isChatEnabled()) return json({ error: 'Trợ lý chưa được bật.' }, 503);

  if (!isSameOrigin(request)) return json({ error: 'Yêu cầu không hợp lệ.' }, 403);

  const raw = await request.text();
  if (raw.length > CHAT_BODY_MAX) return json({ error: 'Tin nhắn quá dài.' }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Yêu cầu không hợp lệ.' }, 400);
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Our own refinements carry Vietnamese messages; zod's built-in ones do not.
    const issue = parsed.error.issues[0];
    return json({ error: issue?.code === 'custom' ? issue.message : 'Yêu cầu không hợp lệ.' }, 400);
  }

  if (!(await takeHourlyQuota('chat', clientIp(context), CHAT_RATE_LIMIT_PER_HOUR))) {
    return json({ error: 'Bạn đã hỏi nhiều quá trong một giờ. Thử lại sau nhé, hoặc dùng bộ lọc trên trang Phòng cho thuê.' }, 429);
  }

  try {
    return json(await runChat(parsed.data));
  } catch (error) {
    console.error('[chat] failed', error);
    return json({ error: FALLBACK_REPLY }, 502);
  }
};
