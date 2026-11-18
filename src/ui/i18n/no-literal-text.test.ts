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
  'src/ui/components/date-picker.tsx',
  'src/ui/components/page-header.tsx',
  'src/ui/components/screen-frame.tsx',
  'src/ui/components/field.tsx',
  'src/ui/components/states.tsx',
  'src/ui/screens/flows.tsx',
  'src/ui/screens/run.tsx',
  'src/ui/screens/reference-tables.tsx',
  'src/ui/screens/versions.tsx',
  'src/ui/screens/versions-dialogs.tsx',
  'src/ui/builder/builder-screen.tsx',
  'src/ui/builder/builder-dialogs.tsx',
  'src/ui/builder/canvas.tsx',
  'src/ui/builder/zoom-controls.tsx',
  'src/ui/builder/step-list.tsx',
  'src/ui/builder/step-card.tsx',
  'src/ui/builder/settings-panel.tsx',
  'src/ui/builder/step-preview.tsx',
  'src/ui/builder/forms/input-file-form.tsx',
  'src/ui/builder/forms/filter-form.tsx',
  'src/ui/builder/forms/formula-column-form.tsx',
  'src/ui/builder/forms/formula-editor.tsx',
  'src/ui/builder/forms/column-mapping-form.tsx',
  'src/ui/builder/forms/column-pickers.tsx',
  'src/ui/builder/forms/lookup-form.tsx',
  'src/ui/builder/forms/group-by-form.tsx',
  'src/ui/builder/forms/unpivot-form.tsx',
  'src/ui/builder/forms/pivot-form.tsx',
  'src/ui/builder/forms/output-form.tsx',
  'src/ui/builder/forms/append-form.tsx',
  'src/ui/builder/forms/sql-form.tsx',
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
    // Object properties that carry text, such as the options of a dropdown: { value: '', label: 'Choose' }.
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && ['label', 'title', 'text', 'placeholder', 'what', 'next'].includes(node.name.text) && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) && hasLetter(node.initializer.text)) {
      found.push(`${at(node)} property ${node.name.text}: "${node.initializer.text.slice(0, 40)}"`);
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
    expect(literalUiText('sample.tsx', `const o = [{ value: '', label: 'Choose a table' }];`)).toHaveLength(1);
  });
});
