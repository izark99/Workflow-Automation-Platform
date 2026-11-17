import type { FunctionRegistry } from '../functions';
import { logicFunctions } from './logic';
import { mathFunctions } from './math';
import { textFunctions } from './text';

/** Tier 1 functions by upper-case name. Task T1.9 adds the date group. */
export const defaultFunctions: FunctionRegistry = {
  ...logicFunctions,
  ...mathFunctions,
  ...textFunctions,
};
