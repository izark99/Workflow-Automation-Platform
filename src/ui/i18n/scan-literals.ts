import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Finds literal UI text in a .tsx file: JSX text, strings in JSX, text attributes and text properties of objects.
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

