import { IDLE_TIMEOUT_RANGE } from '../../store/types';
import type { MessageKey } from '../i18n';

export type HoursCheck = { ok: true; value: number } | { ok: false; error: MessageKey };

/** The text of the field "Hours without activity": a whole number from 1 to 72 (SPEC 12.2 item 1). */
export function parseHours(text: string): HoursCheck {
  const clean = text.trim();
  if (clean === '') return { ok: false, error: 'admin.settings.hoursEmpty' };
  if (!/^[0-9]+$/.test(clean)) return { ok: false, error: 'admin.settings.hoursWhole' };
  const value = Number(clean);
  if (value < IDLE_TIMEOUT_RANGE.min || value > IDLE_TIMEOUT_RANGE.max) return { ok: false, error: 'admin.settings.hoursRange' };
  return { ok: true, value };
}

/** Save is enabled only for a valid value that differs from the saved one. */
export function canSaveHours(text: string, saved: number): boolean {
  const check = parseHours(text);
  return check.ok && check.value !== saved;
}
