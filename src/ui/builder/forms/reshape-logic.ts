// Pure part of the Unpivot and Pivot forms.

// ---- Unpivot
export interface UnpivotValues {
  keep: string[];
  unpivot: string[];
  nameColumn: string;
  valueColumn: string;
  skipBlank: boolean;
}

export function unpivotFromSettings(s: Record<string, unknown>): UnpivotValues {
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { keep: list(s.keep), unpivot: list(s.unpivot), nameColumn: typeof s.nameColumn === 'string' ? s.nameColumn : '', valueColumn: typeof s.valueColumn === 'string' ? s.valueColumn : '', skipBlank: s.skipBlank === true };
}

/** Settings for the values. Names are written trimmed; `skipBlank` only when on. */
export function unpivotToSettings(v: UnpivotValues, previous: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...previous, keep: v.keep, unpivot: v.unpivot, nameColumn: v.nameColumn.trim(), valueColumn: v.valueColumn.trim() };
  if (v.skipBlank) out.skipBlank = true;
  else delete out.skipBlank;
  return out;
}

/** A column is in one list only: adding it to a list when it is in the other one is refused with what to do. */
export function addColumn(list: string[], other: string[], otherName: string, name: string): { list: string[]; error?: string } {
  const n = name.trim();
  if (!n || list.includes(n)) return { list };
  if (other.includes(n)) return { list, error: `"${n}" is already in ${otherName}. Remove it there first, then add it here.` };
  return { list: [...list, n] };
}

export function unpivotMissing(v: UnpivotValues): string[] {
  const m: string[] = [];
  if (v.unpivot.length === 0) m.push('Choose at least one column to unpivot.');
  if (v.nameColumn.trim() === '') m.push('Name the column that will hold the old column names.');
  if (v.valueColumn.trim() === '') m.push('Name the column that will hold the values.');
  if (v.nameColumn.trim() !== '' && v.nameColumn.trim().toLowerCase() === v.valueColumn.trim().toLowerCase()) m.push('The name column and the value column need different names.');
  return m;
}

// ---- Pivot
export type PivotFn = 'sum' | 'count' | 'min' | 'max' | 'average';
export const PIVOT_FNS: PivotFn[] = ['sum', 'count', 'min', 'max', 'average'];
export type NameCase = 'keep' | 'lower' | 'upper';
export const NAME_CASES: NameCase[] = ['keep', 'lower', 'upper'];

export interface PivotValues {
  rowKeys: string[];
  columnSource: string;
  value: string;
  aggregation: PivotFn;
  /** Where the new columns come from. */
  from: 'data' | 'reference';
  table: string;
  column: string;
  /** Empty: the default (0 for sum, blank otherwise). A number. The word "blank". */
  fill: string;
  namePrefix: string;
  nameSuffix: string;
  nameCase: NameCase;
}

export function pivotFromSettings(s: Record<string, unknown>): PivotValues {
  const c = (s.columns ?? {}) as { from?: unknown; table?: unknown; column?: unknown };
  const fill = s.fill === null ? 'blank' : typeof s.fill === 'number' ? String(s.fill) : '';
  return {
    rowKeys: Array.isArray(s.rowKeys) ? s.rowKeys.filter((x): x is string => typeof x === 'string') : [],
    columnSource: typeof s.columnSource === 'string' ? s.columnSource : '',
    value: typeof s.value === 'string' ? s.value : '',
    aggregation: PIVOT_FNS.includes(s.aggregation as PivotFn) ? (s.aggregation as PivotFn) : 'sum',
    from: c.from === 'reference' ? 'reference' : 'data',
    table: typeof c.table === 'string' ? c.table : '',
    column: typeof c.column === 'string' ? c.column : '',
    fill,
    namePrefix: typeof s.namePrefix === 'string' ? s.namePrefix : '',
    nameSuffix: typeof s.nameSuffix === 'string' ? s.nameSuffix : '',
    nameCase: NAME_CASES.includes(s.nameCase as NameCase) ? (s.nameCase as NameCase) : 'keep',
  };
}

export type FillResult = { ok: true; fill: number | null | undefined } | { ok: false; message: string };

export function parseFill(text: string): FillResult {
  const t = text.trim();
  if (t === '') return { ok: true, fill: undefined };
  if (t.toLowerCase() === 'blank') return { ok: true, fill: null };
  const n = Number(t);
  if (Number.isFinite(n) && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return { ok: true, fill: n };
  return { ok: false, message: `"${t}" is not a number. Type a number, the word blank, or leave the field empty.` };
}

/** Settings for the values. Only what differs from the engine's default is written. The fill value must be valid. */
export function pivotToSettings(v: PivotValues, previous: Record<string, unknown>): { settings?: Record<string, unknown>; error?: string } {
  const fill = parseFill(v.fill);
  if (!fill.ok) return { error: fill.message };
  const out: Record<string, unknown> = { ...previous, rowKeys: v.rowKeys, aggregation: v.aggregation };
  const set = (key: string, value: unknown, keep: boolean): void => {
    if (keep) out[key] = value;
    else delete out[key];
  };
  set('columnSource', v.columnSource.trim(), v.columnSource.trim() !== '');
  set('value', v.value.trim(), v.value.trim() !== '');
  out.columns = v.from === 'reference' ? { from: 'reference', table: v.table, column: v.column } : { from: 'data' };
  set('fill', fill.fill, fill.fill !== undefined);
  set('namePrefix', v.namePrefix, v.namePrefix !== '');
  set('nameSuffix', v.nameSuffix, v.nameSuffix !== '');
  set('nameCase', v.nameCase, v.nameCase !== 'keep');
  return { settings: out };
}

export function pivotMissing(v: PivotValues): string[] {
  const m: string[] = [];
  if (v.columnSource.trim() === '') m.push('Choose the column whose values become the new columns.');
  if (v.aggregation !== 'count' && v.value.trim() === '') m.push(`Choose the value column to ${v.aggregation === 'average' ? 'average' : v.aggregation}.`);
  if (v.from === 'reference' && (v.table === '' || v.column === '')) m.push('Choose the reference table and the column that lists the new columns.');
  return m;
}
