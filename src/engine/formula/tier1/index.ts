import type { FunctionRegistry } from '../functions';
import { logicFunctions } from './logic';
import { mathFunctions } from './math';

/** Tier 1 functions by upper-case name. Tasks T1.8 and T1.9 add the text and date groups. */
export const defaultFunctions: FunctionRegistry = {
  ...logicFunctions,
  ...mathFunctions,
};
