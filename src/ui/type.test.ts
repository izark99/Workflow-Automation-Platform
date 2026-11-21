import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The type styles of docs/DESIGN.md ("Type") exist in src/ui/type.css with the size, line height and weight of the table.
const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const design = read('../../docs/DESIGN.md');
const tokens = read('./tokens.css');
const typeCss = read('./type.css');
const globalCss = read('./global.css');

interface Row {
  style: string;
  size: string;
  line: string;
  weight: string;
}

function tableRows(): Row[] {
  const section = design.slice(design.indexOf('### Type'));
  const table = section.slice(0, section.indexOf('\n\n`display-xl`'));
  return [...table.matchAll(/^\| `([\w-]+)` \| (\d+) \/ (\d+) \| (\d+) \|/gm)].map((m) => ({
    style: m[1]!,
    size: `${m[2]}px`,
    line: `${m[3]}px`,
    weight: m[4]!,
  }));
}

function variable(name: string): string {
  const m = tokens.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
  expect(m, name).not.toBeNull();
  return m![1]!.trim();
}

function ruleOf(style: string): string {
  const m = typeCss.match(new RegExp(`\\.type-${style}\\s*\\{([^}]*)\\}`));
  expect(m, `.type-${style} in type.css`).not.toBeNull();
  return m![1]!;
}

describe('type styles', () => {
  const rows = tableRows();

  it('the table of DESIGN "Type" has the eight styles of the app', () => {
    expect(rows.map((r) => r.style)).toEqual(['h1', 'h2', 'h3', 'body', 'label', 'small', 'caption', 'mono']);
  });

  it.each(rows)('$style has its size, line height and weight', ({ style, size, line, weight }) => {
    const rule = ruleOf(style);
    expect(rule).toContain(`font-size: var(--type-${style}-size)`);
    expect(rule).toContain(`line-height: var(--type-${style}-line-height)`);
    expect(rule).toContain(`font-weight: var(--type-${style}-weight)`);
    expect(variable(`--type-${style}-size`)).toBe(size);
    expect(variable(`--type-${style}-line-height`)).toBe(line);
    expect(variable(`--type-${style}-weight`)).toBe(weight);
  });

  it('uses the mono family for mono and the sans family for every other style', () => {
    for (const { style } of rows) {
      expect(ruleOf(style)).toContain(`font-family: var(--family-${style === 'mono' ? 'mono' : 'sans'})`);
    }
  });

  it('has no weight below 400', () => {
    for (const { weight } of rows) expect(Number(weight)).toBeGreaterThanOrEqual(400);
  });
});

describe('fonts', () => {
  it('--font-sans and --font-mono point to the Harold families', () => {
    expect(variable('--font-sans')).toBe('var(--family-sans)');
    expect(variable('--font-mono')).toBe('var(--family-mono)');
    expect(variable('--family-sans')).toMatch(/^"Be Vietnam Pro"/);
    expect(variable('--family-mono')).toMatch(/^"JetBrains Mono"/);
  });

  it('are loaded from @fontsource, in the weights and subsets of Phase 7, and from no host', () => {
    for (const w of [400, 500, 600, 700]) {
      for (const subset of ['latin', 'vietnamese']) expect(globalCss).toContain(`@fontsource/be-vietnam-pro/${subset}-${w}.css`);
    }
    for (const w of [400, 500]) expect(globalCss).toContain(`@fontsource/jetbrains-mono/latin-${w}.css`);
    expect(globalCss).not.toContain('plus-jakarta');
    expect(read('../../index.html') + globalCss + typeCss).not.toMatch(/fonts\.(googleapis|gstatic)\.com|https?:\/\/[^'")\s]*font/i);
  });

  it('type.css is imported by global.css', () => {
    expect(globalCss).toContain("@import './type.css'");
  });
});
