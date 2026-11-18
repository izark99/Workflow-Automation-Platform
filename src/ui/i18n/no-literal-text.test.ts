import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// A scan of the migrated components for literal UI text. The route check of ui-rules cannot see closed popovers,
// dialogs that are not open or errors that were not triggered; this scan can. The list grows with the migration and
// ends as every .tsx file of src/ui (T4.7c).
const MIGRATED = [
  'src/ui/shell.tsx',
  'src/ui/sign-in.tsx',
  'src/ui/auth-gate.tsx',
  'src/ui/theme-switch.tsx',
  'src/ui/components/info-tip.tsx',
  'src/ui/components/toast.tsx',
  'src/ui/components/page-header.tsx',
  'src/ui/components/screen-frame.tsx',
  'src/ui/components/field.tsx',
  'src/ui/components/states.tsx',
  'src/ui/screens/flows.tsx',
];

const TEXT_ATTRIBUTES = new Set(['label', 'title', 'placeholder', 'aria-label', 'alt', 'aria-description', 'text', 'what', 'next']);
const hasLetter = (s: string): boolean => /\p{L}/u.test(s);

export function literalUiText(path: string, source: string = readFileSync(path, 'utf8')): string[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const at = (node: ts.Node): string => `${path}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node) && hasLetter(node.text)) found.push(`${at(node)} JSX text "${node.text.trim().slice(0, 40)}"`);
    if (ts.isJsxExpression(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression)) && hasLetter(node.expression.text)) {
      found.push(`${at(node)} string in JSX "${node.expression.text.slice(0, 40)}"`);
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText()) && node.initializer) {
      const init = node.initializer;
      const literal = ts.isStringLiteral(init) ? init.text : ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression) ? init.expression.text : null;
      if (literal !== null && hasLetter(literal)) found.push(`${at(node)} attribute ${node.name.getText()}="${literal.slice(0, 40)}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe('no literal UI text in migrated files', () => {
  it.each(MIGRATED)('%s', (path) => {
    expect(literalUiText(path)).toEqual([]);
  });
  it('the scan finds literal text, text attributes and strings in JSX, and passes catalog calls', () => {
    const sample = `const a = <div title="Hello"><b>Plain</b>{'More'}<i>{t('k')}</i></div>;`;
    expect(literalUiText('sample.tsx', sample)).toHaveLength(3);
    expect(literalUiText('sample.tsx', `const a = <div title={t('k')}>{t('k')}</div>;`)).toEqual([]);
  });
});
