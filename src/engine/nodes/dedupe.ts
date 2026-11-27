// The settings of the dedupe step (SPEC 15.4, DECISIONS D129). T8.8 fixes the names; the module that turns them into SQL
// is written in its own task and is registered in `registry.ts` then, so a flow that holds this step cannot run before.
export function readDedupeSettings(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    columns: raw.columns,
    keep: raw.keep,
  };
}
