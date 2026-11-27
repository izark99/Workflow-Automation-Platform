// The settings of the split column step (SPEC 15.4, DECISIONS D129). T8.8 fixes the names; the module that turns them into SQL
// is written in its own task and is registered in `registry.ts` then, so a flow that holds this step cannot run before.
export function readSplitColumnSettings(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    column: raw.column,
    cut: raw.cut,
    separator: raw.separator,
    names: raw.names,
    rest: raw.rest,
    trim: raw.trim,
    keepOriginal: raw.keepOriginal,
  };
}
