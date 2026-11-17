import type { FunctionRegistry } from '../functions';
import { equalsSql } from '../ops';
import { requireSameType } from './helpers';

export const logicFunctions: FunctionRegistry = {
  IF: {
    min: 2,
    max: 3,
    compile(ctx) {
      const cond = ctx.arg(0, 'boolean');
      if (ctx.args[2]) requireSameType(ctx, 2, 1);
      const [, a, b] = ctx.args;
      return { sql: `CASE WHEN ${cond} THEN ${a!.sql}${b ? ` ELSE ${b.sql}` : ''} END`, type: a!.type };
    },
  },
  IFS: {
    min: 2,
    max: Infinity,
    compile(ctx) {
      if (ctx.args.length % 2 !== 0) {
        ctx.error('IFS needs pairs of a condition and a value. Add the missing value, or remove the extra condition.');
      }
      const whens: string[] = [];
      for (let i = 0; i < ctx.args.length; i += 2) {
        const cond = ctx.arg(i, 'boolean');
        if (i > 0) requireSameType(ctx, i + 1, 1);
        whens.push(`WHEN ${cond} THEN ${ctx.args[i + 1]!.sql}`);
      }
      return { sql: `CASE ${whens.join(' ')} END`, type: ctx.args[1]!.type };
    },
  },
  AND: {
    min: 1,
    max: Infinity,
    compile(ctx) {
      const parts = ctx.args.map((_, i) => `COALESCE(${ctx.raw(i, 'boolean')}, TRUE)`);
      return { sql: `(${parts.join(' AND ')})`, type: 'boolean' };
    },
  },
  OR: {
    min: 1,
    max: Infinity,
    compile(ctx) {
      const parts = ctx.args.map((_, i) => `COALESCE(${ctx.raw(i, 'boolean')}, FALSE)`);
      return { sql: `(${parts.join(' OR ')})`, type: 'boolean' };
    },
  },
  NOT: {
    min: 1,
    max: 1,
    compile: (ctx) => ({ sql: `(NOT ${ctx.arg(0, 'boolean')})`, type: 'boolean' }),
  },
  IFERROR: {
    min: 2,
    max: 2,
    compile(ctx) {
      requireSameType(ctx, 1, 0);
      return { sql: `COALESCE(${ctx.args[0]!.sql}, ${ctx.args[1]!.sql})`, type: ctx.args[0]!.type };
    },
  },
  SWITCH: {
    min: 3,
    max: Infinity,
    compile(ctx) {
      const hasDefault = (ctx.args.length - 1) % 2 === 1;
      const pairsEnd = hasDefault ? ctx.args.length - 1 : ctx.args.length;
      const whens: string[] = [];
      for (let i = 1; i < pairsEnd; i += 2) {
        requireSameType(ctx, i, 0);
        if (i > 1) requireSameType(ctx, i + 1, 2);
        whens.push(`WHEN ${equalsSql(ctx.args[0]!, ctx.args[i]!)} THEN ${ctx.args[i + 1]!.sql}`);
      }
      if (hasDefault) requireSameType(ctx, ctx.args.length - 1, 2);
      const other = hasDefault ? ` ELSE ${ctx.args[ctx.args.length - 1]!.sql}` : '';
      return { sql: `CASE ${whens.join(' ')}${other} END`, type: ctx.args[2]!.type };
    },
  },
  ISBLANK: {
    min: 1,
    max: 1,
    compile: (ctx) => ({ sql: `(${ctx.args[0]!.sql} IS NULL)`, type: 'boolean' }),
  },
  ISNUMBER: {
    min: 1,
    max: 1,
    compile: (ctx) => ({
      sql: ctx.args[0]!.type === 'number' ? `(${ctx.args[0]!.sql} IS NOT NULL)` : 'FALSE',
      type: 'boolean',
    }),
  },
};
