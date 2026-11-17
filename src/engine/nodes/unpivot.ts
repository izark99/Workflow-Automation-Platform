import { quoteIdent, quoteString } from '../sql';
import { toText } from '../formula/ops';
import { EngineError, type Column } from '../types';
import { requireColumn } from './columns';
import type { NodeModule } from './types';

interface Settings {
  keep: string[];
  unpivot: string[];
  nameColumn: string;
  valueColumn: string;
  skipBlank: boolean;
}

function parse(raw: Record<string, unknown>, nodeId: string): Settings {
  const bad = (rule: string): never => {
    throw new EngineError('invalid_settings', `Unpivot step "${nodeId}": ${rule} Change it in the step settings.`, nodeId);
  };
  const list = (v: unknown, what: string): string[] => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || x === '')) return bad(`"${what}" must be a list of column names.`);
    return v as string[];
  };
  const text = (v: unknown, what: string): string => (typeof v === 'string' && v.trim() !== '' ? v : bad(`"${what}" must be a non-empty name.`));
  if (raw.skipBlank !== undefined && typeof raw.skipBlank !== 'boolean') bad('"skipBlank" must be true or false.');
  const keep = list(raw.keep ?? [], 'keep');
  const unpivot = list(raw.unpivot, 'unpivot');
  if (unpivot.length === 0) bad('choose at least one column to unpivot.');
  const overlap = unpivot.find((c) => keep.includes(c));
  if (overlap !== undefined) bad(`the column "${overlap}" is both kept and unpivoted.`);
  return {
    keep,
    unpivot,
    nameColumn: text(raw.nameColumn, 'nameColumn'),
    valueColumn: text(raw.valueColumn, 'valueColumn'),
    skipBlank: raw.skipBlank === true,
  };
}

/**
 * Turns the listed columns into rows. Columns that are neither kept nor unpivoted are dropped. The value column is
 * always text, written with the one number format of the engine, so the result has the same types for every
 * dataset; retype it with a Column mapping step. Blank cells stay as rows unless `skipBlank` is set. See D24.
 */
export const unpivotNode: NodeModule = {
  type: 'unpivot',
  compile: ({ node, inputs }) => {
    const input = inputs.in!;
    const s = parse(node.settings, node.id);
    const kept = s.keep.map((c) => requireColumn(input.columns, c, node.id));
    const wide = s.unpivot.map((c) => requireColumn(input.columns, c, node.id));

    const taken = new Set(kept.map((c) => c.name.toLowerCase()));
    for (const n of [s.nameColumn, s.valueColumn]) {
      if (taken.has(n.toLowerCase())) {
        throw new EngineError(
          'invalid_settings',
          `Unpivot step "${node.id}": the new column "${n}" has the same name as another column (names that differ only by case count as equal). Choose another name.`,
          node.id,
        );
      }
      taken.add(n.toLowerCase());
    }

    const keptList = kept.map((c) => quoteIdent(c.name));
    const branches = wide.map(
      (c, i) =>
        `SELECT ${[...keptList, `${quoteString(c.name)} AS "__name"`, `${toText({ sql: quoteIdent(c.name), type: c.type })} AS "__value"`, 'rowid AS "__row"', `${i} AS "__col"`].join(', ')} FROM ${quoteIdent(input.relation)}`,
    );
    const outer = [...keptList, `"__name" AS ${quoteIdent(s.nameColumn)}`, `"__value" AS ${quoteIdent(s.valueColumn)}`].join(', ');
    const where = s.skipBlank ? ' WHERE "__value" IS NOT NULL' : '';
    const sql = `SELECT ${outer} FROM (${branches.join(' UNION ALL ')})${where} ORDER BY "__row", "__col"`;
    const columns: Column[] = [...kept, { name: s.nameColumn, type: 'text' }, { name: s.valueColumn, type: 'text' }];
    return { out: { sql, columns } };
  },
};

