/** Syntax tree of a formula. `start` and `end` are character offsets in the source (end is exclusive). */
interface Span {
  start: number;
  end: number;
}

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '<=' | '>' | '>=';

export type Expr = Span &
  (
    | { kind: 'number'; value: number }
    | { kind: 'string'; value: string }
    | { kind: 'boolean'; value: boolean }
    | { kind: 'column'; name: string }
    | { kind: 'call'; name: string; args: Expr[] }
    | { kind: 'unary'; op: '+' | '-'; operand: Expr }
    | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  );
