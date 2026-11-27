// The settings of the clean text step (SPEC 15.4, DECISIONS D129). T8.8 fixes the names; the module that turns them into SQL
// is written in its own task and is registered in `registry.ts` then, so a flow that holds this step cannot run before.
export function readCleanTextSettings(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    columns: raw.columns,
    trim: raw.trim,
    collapse: raw.collapse,
    nonPrinting: raw.nonPrinting,
    caseMode: raw.caseMode,
    removeMarks: raw.removeMarks,
    target: raw.target,
    suffix: raw.suffix,
  };
}
