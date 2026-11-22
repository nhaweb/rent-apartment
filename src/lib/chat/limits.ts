/**
 * Chat limits shared by the browser widget and the API. No imports here, so
 * the widget does not pull zod into its bundle.
 */

/** Characters per renter message. */
export const CHAT_MESSAGE_MAX = 500;
/** Characters per assistant message sent back as history. */
export const CHAT_MODEL_TEXT_MAX = 2000;
/** Messages sent per request (the browser keeps the history, the server stores nothing). */
export const CHAT_HISTORY_MAX = 12;
/** Request body size cap, bytes. */
export const CHAT_BODY_MAX = 16_000;
