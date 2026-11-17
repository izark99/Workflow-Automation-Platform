import { describe, expect, it } from 'vitest';
import type { Expr } from './ast';
import { FormulaError, parseFormula } from './parse';

/** Compact text form of an AST, for readable assertions. */
function show(e: Expr): string {
  switch (e.kind) {
    case 'number':
      return String(e.value);
    case 'string':
      return JSON.stringify(e.value);
    case 'boolean':
      return e.value ? 'TRUE' : 'FALSE';
    case 'column':
      return `[${e.name}]`;
    case 'unary':
      return `(${e.op}u ${show(e.operand)})`;
    case 'binary':
      return `(${e.op} ${show(e.left)} ${show(e.right)})`;
    case 'call':
      return `${e.name}(${e.args.map(show).join(' ')})`;
  }
}
const p = (src: string) => show(parseFormula(src));

function failure(src: string): FormulaError {
  try {
    parseFormula(src);
  } catch (e) {
    expect(e).toBeInstanceOf(FormulaError);
    return e as FormulaError;
  }
  throw new Error(`"${src}" parsed, but it should fail`);
}

describe('literals and references', () => {
  it('reads numbers, strings, booleans and column references', () => {
    expect(p('42')).toBe('42');
    expect(p('1.5')).toBe('1.5');
    expect(p('.5')).toBe('0.5');
    expect(p('1e3')).toBe('1000');
    expect(p('2.5E-1')).toBe('0.25');
    expect(p('"abc"')).toBe('"abc"');
    expect(p('"say ""hi"""')).toBe('"say \\"hi\\""');
    expect(p('""')).toBe('""');
    expect(p('true')).toBe('TRUE');
    expect(p('False')).toBe('FALSE');
    expect(p('[OT hours]')).toBe('[OT hours]');
    expect(p('[a]]b]')).toBe('[a]b]');
    expect(p('  [x]  ')).toBe('[x]');
  });

  it('keeps the case of column references and upper-cases function names', () => {
    expect(p('[Hours] + [hours]')).toBe('(+ [Hours] [hours])');
    expect(p('if(true, 1, 2)')).toBe('IF(TRUE 1 2)');
  });

  it('reads names with digits, spaces and non-ASCII letters in brackets', () => {
    expect(p('[1] + [Giờ làm]')).toBe('(+ [1] [Giờ làm])');
  });
});

describe('precedence and associativity', () => {
  it('multiplies before adding and is left-associative', () => {
    expect(p('1 + 2 * 3')).toBe('(+ 1 (* 2 3))');
    expect(p('1 - 2 - 3')).toBe('(- (- 1 2) 3)');
    expect(p('8 / 4 / 2')).toBe('(/ (/ 8 4) 2)');
    expect(p('(1 + 2) * 3')).toBe('(* (+ 1 2) 3)');
  });

  it('binds unary minus tighter than ^, as Excel does, and ^ left to right', () => {
    expect(p('-2^2')).toBe('(^ (-u 2) 2)');
    expect(p('2^3^2')).toBe('(^ (^ 2 3) 2)');
    expect(p('2^-3')).toBe('(^ 2 (-u 3))');
    expect(p('--1')).toBe('(-u (-u 1))');
    expect(p('+1')).toBe('(+u 1)');
    expect(p('2 * -3')).toBe('(* 2 (-u 3))');
  });

  it('puts & below + and comparison below &', () => {
    expect(p('1 + 2 & 3')).toBe('(& (+ 1 2) 3)');
    expect(p('"a" & "b" = "ab"')).toBe('(= (& "a" "b") "ab")');
    expect(p('1 + 1 > 1')).toBe('(> (+ 1 1) 1)');
    expect(p('1 < 2 = TRUE')).toBe('(= (< 1 2) TRUE)');
  });

  it('reads every comparison operator', () => {
    for (const op of ['=', '<>', '<', '<=', '>', '>=']) expect(p(`1 ${op} 2`)).toBe(`(${op} 1 2)`);
  });
});

describe('function calls', () => {
  it('reads calls with no, one and many arguments, and nesting', () => {
    expect(p('EFFECTIVE_DATE()')).toBe('EFFECTIVE_DATE()');
    expect(p('ABS(-1)')).toBe('ABS((-u 1))');
    expect(p('IF([a] > 4, "Over", "OK")')).toBe('IF((> [a] 4) "Over" "OK")');
    expect(p('MAX(1, MIN(2, 3), [x])')).toBe('MAX(1 MIN(2 3) [x])');
    expect(p('SUM(1,2)+1')).toBe('(+ SUM(1 2) 1)');
  });
});

describe('source positions', () => {
  it('records start and end offsets of every node', () => {
    const e = parseFormula('[x] + 12');
    expect(e.kind).toBe('binary');
    if (e.kind === 'binary') {
      expect([e.start, e.end]).toEqual([0, 8]);
      expect([e.left.start, e.left.end]).toEqual([0, 3]);
      expect([e.right.start, e.right.end]).toEqual([6, 8]);
    }
    const c = parseFormula('  IF(1, 2)');
    expect([c.start, c.end]).toEqual([2, 10]);
  });
});

describe('errors', () => {
  it('reports an empty formula', () => {
    expect(failure('').message).toMatch(/empty/i);
    expect(failure('   ').message).toMatch(/empty/i);
  });

  it('points at an unclosed text, column reference and parenthesis', () => {
    const s = failure('1 + "abc');
    expect([s.position, s.length]).toEqual([4, 4]);
    expect(s.message).toMatch(/closing quote/i);
    const c = failure('[OT hours + 1');
    expect(c.position).toBe(0);
    expect(c.message).toMatch(/\]/);
    const f = failure('IF(1, 2');
    expect(f.position).toBe(7);
    expect(f.message).toMatch(/\)/);
  });

  it('points at an unexpected character and says what to do', () => {
    const e = failure('1 + #');
    expect(e.position).toBe(4);
    expect(e.message).toContain('#');
  });

  it('points at a missing operand and a stray operator', () => {
    expect(failure('1 +').position).toBe(3);
    expect(failure('* 2').position).toBe(0);
    expect(failure('1 + * 2').position).toBe(4);
    expect(failure('()').position).toBe(1);
  });

  it('points at a missing operator or comma between two values', () => {
    const e = failure('1 2');
    expect(e.position).toBe(2);
    expect(e.message).toMatch(/operator|comma/i);
    expect(failure('[a] [b]').position).toBe(4);
  });

  it('points at an empty argument', () => {
    const e = failure('IF(1,,2)');
    expect(e.position).toBe(5);
    expect(e.message).toMatch(/argument 2/i);
    expect(failure('SUM(1,)').message).toMatch(/argument 2/i);
  });

  it('tells that a bare name needs square brackets', () => {
    const e = failure('Hours + 1');
    expect(e.position).toBe(0);
    expect(e.length).toBe(5);
    expect(e.message).toContain('[Hours]');
  });

  it('rejects an empty column reference and the != and == operators', () => {
    expect(failure('[]').message).toMatch(/empty/i);
    expect(failure('1 != 2').message).toContain('<>');
    expect(failure('1 == 2').message).toContain('=');
  });

  it('rejects a formula that is nested too deeply, without a stack overflow', () => {
    const e = failure('('.repeat(500) + '1' + ')'.repeat(500));
    expect(e.message).toMatch(/nested/i);
  });

  it('says what to do next in every message', () => {
    for (const src of ['', '1 +', '1 2', '"x', '[x', 'IF(1', 'abc', '#', '()', 'IF(1,,2)']) {
      expect(failure(src).message, src).toMatch(/Check|Add|Close|Remove|Write|Use|Type|Put|Enter/);
    }
  });
});
