// Message format of the catalog (SPEC 11.3): `{name}` placeholders and
// `{count, plural, one {# row} other {# rows}}`. No library: the plural rules come from Intl.PluralRules.

export type MessageParams = Record<string, string | number>;

type Node =
  | { kind: 'text'; value: string }
  | { kind: 'var'; name: string }
  | { kind: 'hash' }
  | { kind: 'plural'; name: string; branches: Record<string, Node[]> };

class ParseError extends Error {}

/** Index of the `}` that closes the `{` at `open`, counting nested braces. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  throw new ParseError(`The brace at position ${open} is not closed.`);
}

function parseNodes(text: string, inPlural: boolean): Node[] {
  const nodes: Node[] = [];
  let literal = '';
  const flush = (): void => {
    if (literal) nodes.push({ kind: 'text', value: literal });
    literal = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '#' && inPlural) {
      flush();
      nodes.push({ kind: 'hash' });
    } else if (c === '{') {
      flush();
      const end = closing(text, i);
      nodes.push(parseBraced(text.slice(i + 1, end)));
      i = end;
    } else if (c === '}') {
      throw new ParseError(`There is a } at position ${i} with no { before it.`);
    } else literal += c;
  }
  flush();
  return nodes;
}

function parseBraced(inner: string): Node {
  const comma = inner.indexOf(',');
  if (comma === -1) {
    const name = inner.trim();
    if (!/^\w+$/.test(name)) throw new ParseError(`"{${inner}}" is not a placeholder name.`);
    return { kind: 'var', name };
  }
  const name = inner.slice(0, comma).trim();
  const rest = inner.slice(comma + 1);
  const second = rest.indexOf(',');
  if (!/^\w+$/.test(name) || second === -1 || rest.slice(0, second).trim() !== 'plural') {
    throw new ParseError(`"{${inner}}" is not a placeholder or a plural form.`);
  }
  const body = rest.slice(second + 1);
  const branches: Record<string, Node[]> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;
    const open = body.indexOf('{', i);
    if (open === -1) throw new ParseError('A plural form needs {…} after each category name.');
    const category = body.slice(i, open).trim();
    if (!/^(zero|one|two|few|many|other)$/.test(category)) throw new ParseError(`"${category}" is not a plural category.`);
    const end = closing(body, open);
    branches[category] = parseNodes(body.slice(open + 1, end), true);
    i = end + 1;
  }
  if (!branches.other) throw new ParseError(`The plural form of "${name}" needs an "other" branch.`);
  return { kind: 'plural', name, branches };
}

const cache = new Map<string, Node[] | ParseError>();

function parse(message: string): Node[] | ParseError {
  let hit = cache.get(message);
  if (hit === undefined) {
    try {
      hit = parseNodes(message, false);
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      hit = e;
    }
    cache.set(message, hit);
  }
  return hit;
}

/** Null when the message is well formed, else what is wrong and where. */
export function validateMessage(message: string): string | null {
  const parsed = parse(message);
  return parsed instanceof ParseError ? parsed.message : null;
}

function collect(nodes: Node[], into: Set<string>): void {
  for (const n of nodes) {
    if (n.kind === 'var') into.add(n.name);
    else if (n.kind === 'plural') {
      into.add(n.name);
      for (const branch of Object.values(n.branches)) collect(branch, into);
    }
  }
}

/** The names a message uses, sorted: plain placeholders, the variable of a plural form and names inside its branches. */
export function placeholdersOf(message: string): string[] {
  const parsed = parse(message);
  if (parsed instanceof ParseError) return [];
  const names = new Set<string>();
  collect(parsed, names);
  return [...names].sort();
}

function render(nodes: Node[], params: MessageParams | undefined, locale: string, count: number | null): string {
  let out = '';
  for (const n of nodes) {
    if (n.kind === 'text') out += n.value;
    else if (n.kind === 'hash') out += String(count ?? '#');
    else if (n.kind === 'var') out += params && n.name in params ? String(params[n.name]) : `{${n.name}}`;
    else {
      const raw = params?.[n.name];
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
      if (Number.isNaN(value)) {
        out += `{${n.name}}`; // a missing count stays visible instead of hiding the text
        continue;
      }
      const category = new Intl.PluralRules(locale).select(value);
      out += render(n.branches[category] ?? n.branches.other!, params, locale, value);
    }
  }
  return out;
}

/** Fills the placeholders. A missing parameter stays as `{name}` in the output; a malformed message is returned as it is. */
export function formatMessage(message: string, params: MessageParams | undefined, locale: string): string {
  const parsed = parse(message);
  if (parsed instanceof ParseError) return message;
  return render(parsed, params, locale, null);
}
