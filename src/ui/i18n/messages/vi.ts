import type { MessageKey } from './en';

// Vietnamese values. Task T4.7e fills it and types it as Record<MessageKey, string>, so a new key fails the type check
// until it has a value. Until then a missing value falls back to English.
export const vi: Partial<Record<MessageKey, string>> = {};
