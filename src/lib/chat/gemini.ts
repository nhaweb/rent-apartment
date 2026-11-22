/**
 * Minimal Gemini client: REST `generateContent` over `fetch`, no SDK, so it
 * runs the same on Vercel and the Node server. Only `src/lib/chat/` uses it.
 */

/** A content part. Model parts are sent back unchanged (they may carry a `thoughtSignature`). */
export interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
  thought?: boolean;
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  /** OpenAPI-style schema subset. */
  parameters: Record<string, unknown>;
}

export interface GenerateRequest {
  system: string;
  contents: GeminiContent[];
  tools: GeminiFunctionDeclaration[];
}

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 15_000;

/** Overloaded or rate limited: worth another model or a retry. */
const RETRYABLE = new Set([429, 500, 503]);
const RETRY_DELAY_MS = 1_000;

/**
 * `models`: preferred first. When one is overloaded the next is tried, and the
 * client stays on the one that answered for the rest of the request (thought
 * signatures do not carry across models). The last model gets one retry.
 */
export function createGemini(options: { apiKey: string; models: string[] }) {
  const models = [...new Set(options.models.filter(Boolean))];
  let current = 0;

  async function call(
    model: string,
    request: GenerateRequest,
  ): Promise<GeminiContent> {
    const url = `${ENDPOINT}/${encodeURIComponent(model)}:generateContent`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": options.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.system }] },
          contents: request.contents,
          ...(request.tools.length > 0 && {
            tools: [{ functionDeclarations: request.tools }],
          }),
          generationConfig: { maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw new GeminiError(
        `Gemini request failed: ${(error as Error).message}`,
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new GeminiError(
        `Gemini ${model} ${response.status}: ${detail.slice(0, 500)}`,
        response.status,
      );
    }

    const data = (await response.json()) as {
      candidates?: {
        content?: { parts?: GeminiPart[] };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    return { role: "model", parts };
  }

  return {
    /** One model turn. Returns the model's content (text and/or function calls). */
    async generate(request: GenerateRequest): Promise<GeminiContent> {
      let retried = false;
      for (;;) {
        const model = models[current]!;
        try {
          return await call(model, request);
        } catch (error) {
          const status =
            error instanceof GeminiError ? error.status : undefined;
          // Timeouts and network errors count as overload too.
          const retryable = status === undefined || RETRYABLE.has(status);
          if (!retryable) throw error;
          console.warn(`[chat] ${(error as Error).message.slice(0, 200)}`);
          if (current < models.length - 1) {
            current++;
          } else if (!retried) {
            retried = true;
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            throw error;
          }
        }
      }
    },
  };
}

export type Gemini = ReturnType<typeof createGemini>;
