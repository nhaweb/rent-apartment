import { z } from 'astro/zod';
import { CHAT_HISTORY_MAX, CHAT_MESSAGE_MAX, CHAT_MODEL_TEXT_MAX } from '../chat/limits';
import { ROOM_ID_PATTERN } from './room';

export { CHAT_BODY_MAX, CHAT_HISTORY_MAX, CHAT_MESSAGE_MAX, CHAT_MODEL_TEXT_MAX } from '../chat/limits';

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  // Model replies can be longer than what a renter may type.
  text: z.string().trim().min(1).max(CHAT_MODEL_TEXT_MAX),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(chatMessageSchema)
    .min(1)
    .max(CHAT_HISTORY_MAX)
    .refine((messages) => messages.at(-1)?.role === 'user', 'Tin nhắn cuối phải của người dùng.')
    .refine(
      (messages) => messages.every((m) => m.role !== 'user' || m.text.length <= CHAT_MESSAGE_MAX),
      `Mỗi tin nhắn tối đa ${CHAT_MESSAGE_MAX} ký tự.`,
    ),
  /** Room the renter is looking at (`/phong/[id]`), if any. */
  roomId: z
    .string()
    .regex(ROOM_ID_PATTERN)
    .optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
