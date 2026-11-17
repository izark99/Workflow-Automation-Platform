import type { BinaryOp, Expr } from './ast';

/** A mistake in a formula. `position` and `length` locate it in the source, counted from 0. */
export class FormulaError extends Error {
  readonly position: number;
  readonly length: number;

  constructor(message: string, position: number, length = 1) {
    super(message);
    this.name = 'FormulaError';
    this.position = position;
    this.length = length;
  }
}

type Token =
  | { type: 'number'; value: number; start: number; end: number }
  | { type: 'string'; value: string; start: number; end: number }
  | { type: 'column'; value: string; start: number; end: number }
  | { type: 'name'; value: string; start: number; end: number }
  | { type: 'op'; value: BinaryOp; start: number; end: number }
  | { type: '(' | ')' | ',' | 'eof'; start: number; end: number };

const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const NAME = /[\p{L}_][\p{L}\p{N}_.]*/uy;
const MAX_DEPTH = 100;

function at(pos: number): string {
  return `character ${pos + 1}`;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= src.length) {
          throw new FormulaError(
            `The text that starts at ${at(i)} is not closed. Add a closing quote (").`,
            i,
            src.length - i,
          );
        }
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            value += '"';
            j += 2;
            continue;
          }
          break;
        }
        value += src[j];
        j++;
      }
      tokens.push({ type: 'string', value, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (ch === '[') {
      let j = i + 1;
      let value = '';
      for (;;) {
        if (j >= src.length) {
          throw new FormulaError(
            `The column name that starts at ${at(i)} is not closed. Add a closing ] after the name.`,
            i,
            src.length - i,
          );
        }
        if (src[j] === ']') {
          if (src[j + 1] === ']') {
            value += ']';
            j += 2;
            continue;
          }
          break;
        }
        value += src[j];
        j++;
      }
      if (value === '') {
        throw new FormulaError(`The column name at ${at(i)} is empty. Type the column name between [ and ].`, i, j + 1 - i);
      }
      tokens.push({ type: 'column', value, start: i, end: j + 1 });
      i = j + 1;
      continue;
    }
    NUMBER.lastIndex = i;
    const num = NUMBER.exec(src);
    if (num) {
      tokens.push({ type: 'number', value: Number(num[0]), start: i, end: i + num[0].length });
      i += num[0].length;
      continue;
    }
    NAME.lastIndex = i;
    const name = NAME.exec(src);
    if (name) {
      tokens.push({ type: 'name', value: name[0], start: i, end: i + name[0].length });
      i += name[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<>' || two === '<=' || two === '>=') {
      tokens.push({ type: 'op', value: two, start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (two === '!=') throw new FormulaError(`"!=" at ${at(i)} is not a formula operator. Use <> for "not equal".`, i, 2);
    if (two === '==') throw new FormulaError(`"==" at ${at(i)} is not a formula operator. Use a single = to compare.`, i, 2);
    if ('+-*/^&=<>'.includes(ch)) {
      tokens.push({ type: 'op', value: ch as BinaryOp, start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: ch, start: i, end: i + 1 });
      i++;
      continue;
    }
    throw new FormulaError(`The character "${ch}" at ${at(i)} is not allowed in a formula. Remove or replace it.`, i);
  }
  tokens.push({ type: 'eof', start: src.length, end: src.length });
  return tokens;
}

function describe(t: Token): string {
  switch (t.type) {
    case 'number':
      return `the number ${t.value}`;
    case 'string':
      return `the text ${JSON.stringify(t.value)}`;
    case 'column':
      return `the column [${t.value}]`;
    case 'name':
      return `"${t.value}"`;
    case 'op':
      return `"${t.value}"`;
    case 'eof':
      return 'the end of the formula';
    default:
      return `"${t.type}"`;
  }
}

const LEVELS: readonly (readonly string[])[] = [['=', '<>', '<', '<=', '>', '>='], ['&'], ['+', '-'], ['*', '/'], ['^']];

class Parser {
  private pos = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  // A method, not a getter: TypeScript would keep a narrowed type of a getter across `this.pos++`.
  private cur(): Token {
    return this.tokens[this.pos]!;
  }

  parse(): Expr {
    const expr = this.expression();
    if (this.cur().type !== 'eof') {
      throw new FormulaError(
        `Unexpected ${describe(this.cur())} at ${at(this.cur().start)}. Add an operator (+ - * / & =) or a comma before it, or remove it.`,
        this.cur().start,
        this.cur().end - this.cur().start,
      );
    }
    return expr;
  }

  private enter(): void {
    if (++this.depth > MAX_DEPTH) {
      throw new FormulaError(
        `The formula is nested too deeply at ${at(this.cur().start)}. Check the parentheses, or split the formula into smaller steps.`,
        this.cur().start,
      );
    }
  }

  private expression(): Expr {
    this.enter();
    const e = this.level(0);
    this.depth--;
    return e;
  }

  private level(i: number): Expr {
    if (i === LEVELS.length) return this.unary();
    let left = this.level(i + 1);
    for (;;) {
      const t = this.cur();
      if (t.type !== 'op' || !LEVELS[i]!.includes(t.value)) break;
      const op = t.value;
      this.pos++;
      const right = this.level(i + 1);
      left = { kind: 'binary', op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private unary(): Expr {
    const t = this.cur();
    if (t.type === 'op' && (t.value === '-' || t.value === '+')) {
      this.pos++;
      this.enter();
      const operand = this.unary();
      this.depth--;
      return { kind: 'unary', op: t.value, operand, start: t.start, end: operand.end };
    }
    return this.primary();
  }

  private primary(): Expr {
    const t = this.cur();
    switch (t.type) {
      case 'number':
        this.pos++;
        return { kind: 'number', value: t.value, start: t.start, end: t.end };
      case 'string':
        this.pos++;
        return { kind: 'string', value: t.value, start: t.start, end: t.end };
      case 'column':
        this.pos++;
        return { kind: 'column', name: t.value, start: t.start, end: t.end };
      case '(': {
        this.pos++;
        const inner = this.expression();
        this.expectClose(')');
        return inner;
      }
      case 'name':
        return this.nameOrCall(t);
      default:
        throw new FormulaError(
          `Expected a value, a column in [brackets] or a function at ${at(t.start)}, but found ${describe(t)}. Add the missing value.`,
          t.start,
          Math.max(1, t.end - t.start),
        );
    }
  }

  private nameOrCall(t: Extract<Token, { type: 'name' }>): Expr {
    this.pos++;
    if (this.cur().type === '(') {
      this.pos++;
      const args: Expr[] = [];
      if (this.cur().type !== ')') {
        for (;;) {
          if (this.cur().type === ',' || this.cur().type === ')') {
            throw new FormulaError(
              `Argument ${args.length + 1} of ${t.value.toUpperCase()} is empty at ${at(this.cur().start)}. Write a value or remove the extra comma.`,
              this.cur().start,
            );
          }
          args.push(this.expression());
          if (this.cur().type === ',') {
            this.pos++;
            continue;
          }
          break;
        }
      }
      const close = this.expectClose(')');
      return { kind: 'call', name: t.value.toUpperCase(), args, start: t.start, end: close.end };
    }
    const upper = t.value.toUpperCase();
    if (upper === 'TRUE' || upper === 'FALSE') {
      return { kind: 'boolean', value: upper === 'TRUE', start: t.start, end: t.end };
    }
    throw new FormulaError(
      `"${t.value}" at ${at(t.start)} is not a column or a function. Put column names in square brackets, for example [${t.value}].`,
      t.start,
      t.end - t.start,
    );
  }

  private expectClose(type: ')'): Token {
    const t = this.cur();
    if (t.type === type) {
      this.pos++;
      return t;
    }
    throw new FormulaError(
      t.type === 'eof'
        ? `The formula ends before the parenthesis is closed. Add a closing ${type}.`
        : `Expected "," or "${type}" at ${at(t.start)}, but found ${describe(t)}. Add a comma or a closing ${type}, or remove it.`,
      t.start,
      Math.max(1, t.end - t.start),
    );
  }
}

/** Parses a formula such as `IF([OT hours] > 4, "Over", "OK")` into a syntax tree, or throws `FormulaError`. */
export function parseFormula(source: string): Expr {
  if (source.trim() === '') {
    throw new FormulaError('The formula is empty. Type a formula, for example [Hours] * 2.', 0);
  }
  return new Parser(tokenize(source)).parse();
}
