import { compileStepFormula } from '../formula/node-formula';
import { quoteIdent } from '../sql';
import { coded, EngineError, warning } from '../types';
import type { Column } from '../types';
import type { NodeModule } from './types';

export interface CheckRule {
  name: string;
  /** A formula that is true when the row is fine. */
  condition: string;
  message: string;
}

export interface CheckSettings {
  rules: CheckRule[];
  stop: boolean;
}

/** The names of the two columns that `errors` adds to the columns of the input. */
export const RULE_COLUMN = 'Rule';
export const MESSAGE_COLUMN = 'Message';

export function parseCheckSettings(raw: Record<string, unknown>, nodeId: string): CheckSettings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Check step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const rules = raw.rules ?? [];
  if (!Array.isArray(rules)) bad('"rules" must be a list.');
  if ((rules as unknown[]).length === 0) bad('there is no rule. Add a rule with a name, a condition and a message.');
  const seen = new Set<string>();
  const parsed = (rules as unknown[]).map((r, i): CheckRule => {
    if (typeof r !== 'object' || r === null || Array.isArray(r)) return bad(`rule ${i + 1} must be an object with a name, a condition and a message.`);
    const o = r as Record<string, unknown>;
    if (typeof o.name !== 'string' || o.name.trim() === '') return bad(`rule ${i + 1} has no name. Give each rule a name, so that the counts can say which rule failed.`);
    const name = o.name.trim();
    if (seen.has(name)) return bad(`the rule name "${name}" is used twice. Give each rule its own name.`);
    seen.add(name);
    if (typeof o.condition !== 'string' || o.condition.trim() === '') return bad(`rule "${name}" has no condition. Type a formula that is true when the row is fine.`);
    if (typeof o.message !== 'string' || o.message.trim() === '') return bad(`rule "${name}" has no message. Say what is wrong with a row that fails it.`);
    return { name, condition: o.condition, message: o.message };
  });
  const stop = raw.stop ?? false;
  if (typeof stop !== 'boolean') bad('"stop" must be true or false.');
  return { rules: parsed, stop: stop as boolean };
}

const literal = (text: string): string => `'${text.replace(/'/g, "''")}'`;

/**
 * Tests every row against the rules (SPEC 15.4 item 6). `ok` holds the rows that pass every rule, in order. `errors` holds the
 * columns of the input plus `Rule` and `Message`, one row for each rule that a row fails (a row that fails two rules appears
 * twice), by row and then by rule. A condition that is empty (null) for a row counts as a fail. A rule that has failures is told
 * as a quiet warning with its count; with "stop the run" on, a run that writes files stops instead, with the counts.
 */
export const checkNode: NodeModule = {
  type: 'check',
  compile: async ({ node, inputs, effectiveDate, parameters, query, stopChecks, warn }) => {
    const input = inputs.in!;
    const s = parseCheckSettings(node.settings, node.id);
    for (const reserved of [RULE_COLUMN, MESSAGE_COLUMN]) {
      if (input.columns.some((c) => c.name === reserved)) {
        throw new EngineError('invalid_settings', `Check step "${node.id}": the input already has a column named "${reserved}", which the errors output adds. Rename that column before this step.`, node.id);
      }
    }
    const conditions = s.rules.map((r) => {
      const c = compileStepFormula(r.condition, { columns: input.columns, effectiveDate, parameters }, { id: node.id, label: 'Check', setting: `rule "${r.name}"` });
      if (c.type !== 'boolean') {
        throw new EngineError('invalid_formula', `Check step "${node.id}", rule "${r.name}": the condition must give true or false, but it gives a ${c.type}. Compare the value with something, for example [Column] > 0.`, node.id);
      }
      return c.sql;
    });
    const from = quoteIdent(input.relation);
    const colList = input.columns.map((c) => quoteIdent(c.name));
    const cols = colList.join(', ');

    // How many rows fail each rule, in one pass.
    const counted = await query(`SELECT ${conditions.map((c, i) => `count(*) FILTER (WHERE (${c}) IS NOT TRUE) AS r${i}`).join(', ')} FROM ${from}`);
    const failed = s.rules.map((r, i) => ({ rule: r, n: Number(counted.rows[0]?.[i] ?? 0) })).filter((x) => x.n > 0);
    const label = node.label ?? node.id;
    if (failed.length > 0 && s.stop && stopChecks) {
      throw coded('check_failed', 'engine.checkStopped', { step: label, summary: failed.map((x) => `"${x.rule.name}" (${x.n.toLocaleString('en-US')})`).join(', ') }, node.id);
    }
    for (const x of failed) warn(warning('engine.checkFailedRule', { step: label, rule: x.rule.name, n: x.n, message: x.rule.message }, node.id));

    const errorColumns: Column[] = [...input.columns, { name: RULE_COLUMN, type: 'text' }, { name: MESSAGE_COLUMN, type: 'text' }];
    const errorParts = s.rules.map(
      (r, i) => `SELECT ${cols}, ${literal(r.name)} AS ${quoteIdent(RULE_COLUMN)}, ${literal(r.message)} AS ${quoteIdent(MESSAGE_COLUMN)}, rowid AS __rid, ${i} AS __k FROM ${from} WHERE (${conditions[i]}) IS NOT TRUE`,
    );
    return {
      ok: { sql: `SELECT ${cols} FROM ${from} WHERE ${conditions.map((c) => `(${c}) IS TRUE`).join(' AND ')} ORDER BY rowid`, columns: input.columns },
      errors: {
        sql: `SELECT ${[...colList, quoteIdent(RULE_COLUMN), quoteIdent(MESSAGE_COLUMN)].join(', ')} FROM (${errorParts.join(' UNION ALL ')}) ORDER BY __rid, __k`,
        columns: errorColumns,
      },
    };
  },
};
