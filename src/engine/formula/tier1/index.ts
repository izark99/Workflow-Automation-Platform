import type { FunctionRegistry } from '../functions';
import { dateFunctions } from './date';
import { logicFunctions } from './logic';
import { mathFunctions } from './math';
import { textFunctions } from './text';

/** Tier 1 functions by upper-case name. Logic, math, text and date groups. */
export const defaultFunctions: FunctionRegistry = {
  ...logicFunctions,
  ...mathFunctions,
  ...textFunctions,
  ...dateFunctions,
};
