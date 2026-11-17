import type { FunctionContext } from '../functions';

/** Argument `i` must have the type of argument `ref`. Throws at argument `i`. */
export function requireSameType(ctx: FunctionContext, i: number, ref: number): void {
  const want = ctx.args[ref]!.type;
  const got = ctx.args[i]!.type;
  if (got !== want) {
    ctx.error(
      `Argument ${i + 1} of ${ctx.call.name} must be the same type as argument ${ref + 1} (${want}), but it is ${got}. Convert one of them first, for example with VALUE() or TEXT().`,
      i,
    );
  }
}
