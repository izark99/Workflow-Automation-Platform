import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The glass classes and their fallbacks (T7.4). A browser cannot always emulate reduced transparency, so the test reads the
// stylesheet: the rules that switch glass to the overlay are there, and they are the ones the browser applies.
const css = readFileSync(new URL('./glass.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const global = readFileSync(new URL('./global.css', import.meta.url), 'utf8');

/** The body of the first at-rule that starts with `head`, with its nested braces balanced. */
function atRule(head: string): string {
  const start = css.indexOf(head);
  expect(start, head).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
  }
  throw new Error(`${head} is not closed`);
}

function rule(source: string, selector: string): string {
  const m = source.match(new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`));
  expect(m, selector).not.toBeNull();
  return m![1]!;
}

describe('glass classes', () => {
  it('.glass is the Harold recipe: translucent fill, blur-md with saturate(1.5), 1 px border, shadow-sm', () => {
    const r = rule(css, '.glass');
    expect(r).toContain('background: var(--surface-200)');
    expect(r).toContain('backdrop-filter: blur(var(--blur-md)) saturate(1.5)');
    expect(r).toContain('-webkit-backdrop-filter: blur(var(--blur-md)) saturate(1.5)');
    expect(r).toContain('border: 1px solid var(--border)');
    expect(r).toContain('box-shadow: var(--shadow-sm)');
  });

  it('.glass-overlay is surface-overlay with no blur, and .glass-inset is surface-300', () => {
    expect(rule(css, '.glass-overlay')).toContain('background: var(--surface-overlay)');
    expect(rule(css, '.glass-overlay')).not.toContain('backdrop-filter');
    expect(rule(css, '.glass-inset')).toContain('background: var(--surface-300)');
  });

  it('is loaded by global.css', () => {
    expect(global).toContain("@import './glass.css'");
  });
});

describe('glass fallbacks', () => {
  it('without backdrop-filter, glass is the overlay fill', () => {
    const body = atRule('@supports not');
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
    expect(rule(body, '.glass')).toContain('background: var(--surface-overlay)');
  });

  it('under prefers-reduced-transparency, glass is the overlay fill with no blur', () => {
    const body = atRule('@media (prefers-reduced-transparency: reduce)');
    const r = rule(body, '.glass');
    expect(r).toContain('background: var(--surface-overlay)');
    expect(r).toContain('backdrop-filter: none');
    expect(r).toContain('-webkit-backdrop-filter: none');
  });
});
