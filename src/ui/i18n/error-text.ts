import { hasKey, translate } from './catalog';

/**
 * The text of an error for the screen (SPEC 11.3). The engine, the stores and the auth service throw errors with a
 * `messageId` and `params`; the catalog text of that id is shown in the language of the user. An error without an id, or
 * with an id the catalog does not know, shows its own English message. `fallback` is used when there is no message.
 */
export function errorText(e: unknown, fallback = ''): string {
  if (e && typeof e === 'object') {
    const { messageId, params } = e as { messageId?: unknown; params?: Record<string, string | number> };
    if (typeof messageId === 'string' && hasKey(messageId)) return translate(messageId, params);
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback || String(e);
}

/** The text of a warning of the engine (a message id with parameters) in the language of the user; its English text if the catalog has no such id. */
export function warningText(w: { messageId: string; params: Record<string, string | number>; message: string }): string {
  return hasKey(w.messageId) ? translate(w.messageId, w.params) : w.message;
}
