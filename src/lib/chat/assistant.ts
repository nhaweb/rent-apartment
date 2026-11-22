/**
 * Renter chat assistant: one request = one answer. The browser sends the
 * whole (short) history; nothing is stored on the server.
 */
import { GEMINI_API_KEY, GEMINI_FALLBACK_MODEL, GEMINI_MODEL } from 'astro:env/server';
import { getRoomById } from '../rooms';
import type { ChatRequest } from '../validation/chat';
import { createGemini, type GeminiContent, type GeminiPart } from './gemini';
import { systemPrompt } from './prompt';
import { roomDetails, runTool, TOOL_DECLARATIONS, type ChatRoomCard } from './tools';

export type { ChatRoomCard } from './tools';

export interface ChatReply {
  reply: string;
  rooms: ChatRoomCard[];
  /** Full listing for the last search, when it found more than it showed. */
  listingUrl?: string;
  total?: number;
}

/** Model turns with tool calls before giving up. */
const MAX_TOOL_ROUNDS = 3;
const CARDS_MAX = 5;

export const FALLBACK_REPLY = 'Xin lỗi, trợ lý đang gặp sự cố. Bạn thử lại sau ít phút, hoặc dùng bộ lọc trên trang Phòng cho thuê.';

export function isChatEnabled(): boolean {
  return Boolean(GEMINI_API_KEY);
}

export async function runChat(request: ChatRequest): Promise<ChatReply> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  const gemini = createGemini({ apiKey: GEMINI_API_KEY, models: [GEMINI_MODEL, GEMINI_FALLBACK_MODEL] });

  const currentRoom = request.roomId ? await getRoomById(request.roomId) : undefined;
  const system = systemPrompt(currentRoom ? roomDetails(currentRoom) : undefined);

  const contents: GeminiContent[] = request.messages.map((message) => ({
    role: message.role,
    parts: [{ text: message.text }],
  }));

  let cards: ChatRoomCard[] = [];
  let listingUrl: string | undefined;
  let total: number | undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const content = await gemini.generate({
      system,
      contents,
      // Last round: no tools, so the model has to answer.
      tools: round < MAX_TOOL_ROUNDS ? TOOL_DECLARATIONS : [],
    });
    const calls = content.parts.filter((part) => part.functionCall);

    if (calls.length === 0) {
      const reply = content.parts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join('')
        .trim();
      return { reply: reply || FALLBACK_REPLY, rooms: cards.slice(0, CARDS_MAX), listingUrl, total };
    }

    // Send the model's parts back unchanged (thought signatures), then the results.
    contents.push(content);
    const responses: GeminiPart[] = [];
    for (const part of calls) {
      const { name, args = {} } = part.functionCall!;
      const result = await runTool(name, args);
      responses.push({ functionResponse: { name, response: result.response } });
      if (result.cards.length > 0) cards = result.cards;
      if (result.listingUrl) {
        listingUrl = result.listingUrl;
        total = result.total;
      }
    }
    contents.push({ role: 'user', parts: responses });
  }

  return { reply: FALLBACK_REPLY, rooms: cards.slice(0, CARDS_MAX), listingUrl, total };
}
