import { translate } from '../../i18n';

export interface CheckRuleRow {
  name: string;
  condition: string;
  message: string;
}

export interface CheckValues {
  rules: CheckRuleRow[];
  stop: boolean;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

export function checkFromSettings(s: Record<string, unknown>): CheckValues {
  const rules = Array.isArray(s.rules) ? (s.rules as Record<string, unknown>[]).map((r): CheckRuleRow => ({ name: text(r?.name), condition: text(r?.condition), message: text(r?.message) })) : [];
  return { rules, stop: s.stop === true };
}

/** The settings for the values. Every rule is kept as typed, so that nothing is lost while it is being written. */
export function checkToSettings(v: CheckValues, previous: Record<string, unknown>): Record<string, unknown> {
  return { ...previous, rules: v.rules.map((r) => ({ name: r.name, condition: r.condition, message: r.message })), stop: v.stop };
}

export const emptyRule = (): CheckRuleRow => ({ name: '', condition: '', message: '' });

/** What is still missing before the step can run, as messages that say what to do (numbers are those of the rules). */
export function checkMissing(v: CheckValues): string[] {
  const m: string[] = [];
  if (v.rules.length === 0) m.push(translate('builder.check.missing.rules'));
  v.rules.forEach((r, i) => {
    const n = i + 1;
    if (r.name.trim() === '') m.push(translate('builder.check.missing.name', { n }));
    if (r.condition.trim() === '') m.push(translate('builder.check.missing.condition', { n }));
    if (r.message.trim() === '') m.push(translate('builder.check.missing.message', { n }));
  });
  const seen = new Set<string>();
  for (const r of v.rules) {
    const name = r.name.trim();
    if (name === '') continue;
    if (seen.has(name)) m.push(translate('builder.check.missing.twice', { name }));
    seen.add(name);
  }
  return m;
}
