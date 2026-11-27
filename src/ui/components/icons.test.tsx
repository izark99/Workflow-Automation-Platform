import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DRAWN_EXTRAS, ICON_NAMES, Icon, LUCIDE_EXTRAS, strokeFor, type IconName } from './icons';

const harold = readFileSync(new URL('../../../design/harold/components/bundle.js', import.meta.url), 'utf8');
const haroldNodes = JSON.parse(harold.match(/var ICONS = (\{.*?\});\n/s)![1]!) as Record<string, Array<[string, Record<string, string>]>>;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}
const src = sourceFiles(fileURLToPath(new URL('../..', import.meta.url))).map((f) => readFileSync(f, 'utf8'));

describe('the icon set', () => {
  it('has the 47 icons of Harold with their path data, link and shield from Lucide, and the ten drawn for Phase 8 (D128)', () => {
    const own = ICON_NAMES.filter((n) => !LUCIDE_EXTRAS.includes(n) && !DRAWN_EXTRAS.includes(n));
    expect(own.sort()).toEqual(Object.keys(haroldNodes).sort());
    expect(own).toHaveLength(47);
    expect([...ICON_NAMES].filter((n) => LUCIDE_EXTRAS.includes(n)).sort()).toEqual(['link', 'shield']);
    expect([...ICON_NAMES].filter((n) => DRAWN_EXTRAS.includes(n))).toHaveLength(10);
  });

  it('draws each Harold icon with the nodes of bundle.js', () => {
    for (const [name, nodes] of Object.entries(haroldNodes)) {
      const html = renderToStaticMarkup(<Icon name={name as IconName} />);
      expect((html.match(/<(path|circle|rect|line|polyline|polygon)\b/g) ?? []).length, name).toBe(nodes.length);
    }
  });

  it('draws in currentColor, hidden from screen readers, with stroke 2 at 16 px and 1.75 above', () => {
    const small = renderToStaticMarkup(<Icon name="plus" size={16} />);
    expect(small).toContain('stroke="currentColor"');
    expect(small).toContain('aria-hidden="true"');
    expect(small).toContain('stroke-width="2"');
    expect(renderToStaticMarkup(<Icon name="plus" size={20} />)).toContain('stroke-width="1.75"');
    expect(renderToStaticMarkup(<Icon name="plus" size={24} />)).toContain('stroke-width="1.75"');
    expect([strokeFor(16), strokeFor(20), strokeFor(24)]).toEqual([2, 1.75, 1.75]);
  });
});

describe('the icons the app uses', () => {
  const names = new Set<string>();
  const sizes: number[] = [];
  for (const text of src) {
    for (const m of text.matchAll(/<Icon\b[^>]*?name="([\w-]+)"/g)) names.add(m[1]!);
    for (const m of text.matchAll(/\b(?:icon|iconTrigger)="([\w-]+)"/g)) names.add(m[1]!);
    for (const m of text.matchAll(/<Icon\b[^>]*?size=\{(\d+)\}/g)) sizes.push(Number(m[1]));
  }

  it('every icon name used in src exists in the set', () => {
    expect(names.size).toBeGreaterThan(8);
    expect([...names].filter((n) => !(ICON_NAMES as string[]).includes(n))).toEqual([]);
  });

  it('no icon is smaller than 16 px, and every size is 16, 20 or 24', () => {
    expect(sizes.length).toBeGreaterThan(0);
    expect(sizes.filter((s) => ![16, 20, 24].includes(s))).toEqual([]);
  });
});
