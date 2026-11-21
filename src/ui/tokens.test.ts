import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Contrast of every text and control pair in both themes (docs/DESIGN.md, "Tokens for both themes").
const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function themeTokens(theme: 'light' | 'dark'): Record<string, string> {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (selector === ':root') Object.assign(light, declarations(m[2]!));
    else if (selector === ":root[data-theme='dark']") Object.assign(dark, declarations(m[2]!));
  }
  return theme === 'light' ? light : { ...light, ...dark };
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Old names of Phases 2 to 6 and the Harold token each is an alias of since T7.3 (docs/DESIGN.md, "Token mapping"). */
const ALIASES: Array<[string, string]> = [
  ['--color-bg', 'scene-100'],
  ['--color-card', 'surface-overlay'],
  ['--color-ink', 'ink'],
  ['--color-muted', 'ink-muted'],
  ['--color-line', 'border'],
  ['--color-rule', 'border'],
  ['--color-control', 'border-strong'],
  ['--color-primary', 'primary'],
  ['--color-primary-soft', 'primary-soft'],
  ['--color-focus', 'primary-text'],
  ['--color-cta', 'primary'],
  ['--color-accent', 'accent'],
  ['--color-danger', 'danger'],
  ['--color-skeleton', 'neutral-fill'],
  ['--color-on-primary', 'on-primary'],
  ['--color-on-cta', 'on-primary'],
  ['--color-badge-ink', 'primary-text'],
  ['--color-danger-soft', 'surface-300'],
  ['--color-danger-ink', 'danger'],
  ['--color-overlay', 'scrim'],
  ['--color-note-bg', 'surface-300'],
  ['--color-note-ink', 'info'],
  ['--color-draft-ink', 'accent'],
  ['--color-ended-ink', 'ink-muted'],
  ['--shadow-popover', 'shadow-md'],
  ['--font-sans', 'family-sans'],
  ['--font-mono', 'family-mono'],
];

// The contrast of the old pairs is now the contrast of the Harold tokens they point to (tests of T7.1 below).
describe('old names are aliases of Harold tokens', () => {
  const plain = themeTokens('light');
  it.each(ALIASES)('%s is var(--%s)', (old, token) => {
    expect(plain[old]).toBe(`var(--${token})`);
  });
  it('the dark block gives no old colour name a value of its own, so both themes follow the Harold tokens', () => {
    const dark = css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)![1]!;
    const names = Object.keys(declarations(dark)).filter((n) => n.startsWith('--color-') || n === '--shadow-popover');
    expect(names).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Harold tokens (Phase 7, T7.1)
// ---------------------------------------------------------------------------------------------------------------------

interface HaroldColorToken {
  name: string;
  value: { dark: string; light: string };
}
interface HaroldTokens {
  color: { tokens: HaroldColorToken[] };
  type: {
    families: { sans: string; mono: string };
    groups: Array<{ styles: Array<{ name: string; fontSize: string; lineHeight: string; fontWeight: number; letterSpacing?: string }> }>;
  };
  spacing: { tokens: Array<{ name: string; value: string }> };
  radius: { tokens: Array<{ name: string; value: string }> };
  shadow: { tokens: Array<{ name: string; value: { dark: string; light: string } }> };
  size: { tokens: Array<{ name: string; value: string }> };
  blur: { tokens: Array<{ name: string; value: string }> };
}

const harold = JSON.parse(readFileSync(new URL('../../design/harold/tokens.json', import.meta.url), 'utf8')) as HaroldTokens;

interface Block {
  selectors: string[];
  decls: Record<string, string>;
}

function blocks(source: string): Block[] {
  const out: Block[] = [];
  for (const m of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1]!.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    out.push({ selectors: selector.split(',').map((s) => s.trim()), decls: declarations(m[2]!) });
  }
  return out;
}

const SELECTOR = { light: ":root[data-theme='light']", dark: ":root[data-theme='dark']" } as const;

/** Every custom property that applies to a theme: plain `:root` first, then the theme selector. */
function allTokens(theme: 'light' | 'dark'): Record<string, string> {
  const merged: Record<string, string> = {};
  const all = blocks(css);
  for (const b of all) if (b.selectors.includes(':root')) Object.assign(merged, b.decls);
  for (const b of all) if (b.selectors.includes(SELECTOR[theme])) Object.assign(merged, b.decls);
  return merged;
}

/** Only whitespace is normalised: a formatter may write `rgba(15, 26, 43, 0.08)` for `rgba(15,26,43,0.08)`. */
function norm(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
}

function expectedHarold(theme: 'light' | 'dark'): Record<string, string> {
  const ref = (s: string): string => (/^\{(.+)\}$/.test(s) ? `var(--${s.slice(1, -1)})` : s);
  const out: Record<string, string> = {};
  out['--family-sans'] = harold.type.families.sans;
  out['--family-mono'] = harold.type.families.mono;
  for (const g of harold.type.groups) {
    for (const s of g.styles) {
      out[`--type-${s.name}-size`] = s.fontSize;
      out[`--type-${s.name}-line-height`] = s.lineHeight;
      out[`--type-${s.name}-weight`] = String(s.fontWeight);
      if (s.letterSpacing) out[`--type-${s.name}-letter-spacing`] = s.letterSpacing;
    }
  }
  for (const k of ['spacing', 'radius', 'size', 'blur'] as const) {
    for (const t of harold[k].tokens) out[`--${t.name}`] = ref(t.value);
  }
  for (const t of harold.color.tokens) out[`--${t.name}`] = ref(t.value[theme]);
  for (const t of harold.shadow.tokens) out[`--${t.name}`] = t.value[theme];
  return out;
}

describe.each(['light', 'dark'] as const)('Harold tokens, %s theme: parity with design/harold/tokens.json', (theme) => {
  const actual = allTokens(theme);
  const expected = expectedHarold(theme);

  it('has every token of the snapshot', () => {
    const missing = Object.keys(expected).filter((name) => !(name in actual));
    expect(missing).toEqual([]);
  });

  it('has the same value for every token', () => {
    const different = Object.entries(expected)
      .filter(([name]) => name in actual && norm(actual[name]!) !== norm(expected[name]!))
      .map(([name, value]) => `${name}: css has "${actual[name]}", snapshot has "${value}"`);
    expect(different).toEqual([]);
  });
});

describe('Harold tokens: nothing in tokens.css claims to be a Harold token and is not', () => {
  it('every custom property is either an old name or a token of the snapshot', () => {
    const known = new Set([...Object.keys(expectedHarold('light')), ...Object.keys(expectedHarold('dark'))]);
    const strays = new Set<string>();
    for (const b of blocks(css)) {
      for (const name of Object.keys(b.decls)) {
        if (!known.has(name) && !OLD_NAME.test(name)) strays.add(name);
      }
    }
    expect([...strays]).toEqual([]);
  });

  it('the theme-independent tokens are in plain :root, so a page with no data-theme still has them', () => {
    const plain: Record<string, string> = {};
    for (const b of blocks(css)) if (b.selectors.includes(':root') && b.selectors.length === 1) Object.assign(plain, b.decls);
    for (const k of ['spacing', 'radius', 'size', 'blur'] as const) {
      for (const t of harold[k].tokens) expect(plain, `--${t.name}`).toHaveProperty(`--${t.name}`);
    }
    expect(plain).toHaveProperty('--family-sans');
    expect(plain).toHaveProperty('--type-h1-size');
  });
});

// ---- contrast of the Harold pairs -----------------------------------------------------------------------------------

type Rgba = [number, number, number, number];

function parseColour(value: string, tokens: Record<string, string>): Rgba {
  const v = value.trim();
  const alias = v.match(/^var\(--([\w-]+)\)$/);
  if (alias) return parseColour(tokens[`--${alias[1]}`]!, tokens);
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    const n = parseInt(v.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const m = v.match(/^rgba?\(([^)]+)\)$/);
  if (!m) throw new Error(`Not a colour: ${value}`);
  const p = m[1]!.split(',').map((x) => Number(x.trim()));
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}

/** `top` drawn over `bottom` (alpha compositing). The result is opaque when `bottom` is. */
function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3];
  const mix = (i: 0 | 1 | 2): number => top[i] * a + bottom[i] * (1 - a);
  return [mix(0), mix(1), mix(2), a + bottom[3] * (1 - a)];
}

function lum(c: Rgba): number {
  const ch = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

function ratio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Pairs that fail their own target, with the measured ratio. Empty means every pair passes (the measurement of T7.1). */
const KNOWN_FAILURES: Record<string, number> = {};

describe.each(['light', 'dark'] as const)('Harold contrast, %s theme', (theme) => {
  const tokens = allTokens(theme);
  const c = (name: string): Rgba => parseColour(tokens[`--${name}`]!, tokens);

  // The page is the scene: `scene-200` (the lightest part) and `scene-100`, each also with a glow drawn on it.
  const scenes: Record<string, Rgba> = {
    'scene-100': c('scene-100'),
    'scene-200': c('scene-200'),
    'scene-100 + blue glow': over(c('scene-glow-blue'), c('scene-100')),
    'scene-200 + blue glow': over(c('scene-glow-blue'), c('scene-200')),
    'scene-100 + warm glow': over(c('scene-glow-warm'), c('scene-100')),
    'scene-200 + warm glow': over(c('scene-glow-warm'), c('scene-200')),
  };

  // Every ground a text sits on: the scene, a glass panel, an overlay, and the tints inside a panel.
  const grounds: Array<[string, Rgba]> = [];
  for (const [sceneName, scene] of Object.entries(scenes)) {
    const panel = over(c('surface-200'), scene);
    grounds.push([`scene (${sceneName})`, scene]);
    grounds.push([`surface-200 over ${sceneName}`, panel]);
    grounds.push([`surface-overlay over ${sceneName}`, over(c('surface-overlay'), scene)]);
    grounds.push([`surface-300 in a panel over ${sceneName}`, over(c('surface-300'), panel)]);
    grounds.push([`neutral-fill in a panel over ${sceneName}`, over(c('neutral-fill'), panel)]);
    grounds.push([`primary-soft in a panel over ${sceneName}`, over(c('primary-soft'), panel)]);
    grounds.push([`accent-soft in a panel over ${sceneName}`, over(c('accent-soft'), panel)]);
  }

  const TEXT = ['ink', 'ink-muted', 'primary-text', 'accent', 'success', 'warning', 'danger', 'info'];
  const textCases = TEXT.flatMap((fg) => grounds.map(([name, ground]) => [fg, name, ground] as const));

  it.each(textCases)('%s on %s is at least 4.5:1', (fg, name, ground) => {
    const measured = ratio(c(fg), ground);
    const key = `${theme}: ${fg} on ${name}`;
    if (key in KNOWN_FAILURES) expect(measured).toBeCloseTo(KNOWN_FAILURES[key]!, 1);
    else expect(measured).toBeGreaterThanOrEqual(4.5);
  });

  const FILLS: Array<[string, string]> = [
    ['on-primary', 'primary'],
    ['on-primary', 'primary-hover'],
    ['thumb', 'primary'],
    ['on-accent', 'accent'],
    ['on-danger', 'danger'],
  ];
  it.each(FILLS)('%s on the %s fill is at least 4.5:1', (fg, bg) => {
    expect(ratio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  // `border-strong` is translucent: it is drawn over the ground it sits on, then compared with that ground (3:1).
  it.each(grounds)('border-strong on %s is at least 3:1', (_name, ground) => {
    expect(ratio(over(c('border-strong'), ground), ground)).toBeGreaterThanOrEqual(3);
  });

  // The focus ring is `primary-text`; its 2 px gap is drawn in the scene colour, so the ring is judged against the ground.
  it.each(grounds)('the focus ring (primary-text) on %s is at least 3:1', (_name, ground) => {
    expect(ratio(c('primary-text'), ground)).toBeGreaterThanOrEqual(3);
  });

  it('meaningful icons (ink-muted) hold 3:1 on every ground', () => {
    for (const [, ground] of grounds) expect(ratio(c('ink-muted'), ground)).toBeGreaterThanOrEqual(3);
  });
});

it('the contrast helper agrees with the one above on opaque colours', () => {
  expect(ratio([0, 0, 0, 1], [255, 255, 255, 1])).toBeCloseTo(contrast('#000000', '#ffffff'), 6);
});

// ---- inventory of the old names ----------------------------------------------------------------------------------------

/** Names of Phases 2 to 6. They stay until T7.17, which removes them and sets OLD_NAMES_IN_USE to an empty list. */
const OLD_NAME = /^--(color-|font-|radius-(control|step|card)$|size-(button|button-compact|sidebar|step-list|settings|builder-header)$|shadow-popover$)/;

const OLD_NAMES_IN_USE = [
  '--color-accent',
  '--color-badge-ink',
  '--color-card',
  '--color-danger',
  '--color-danger-ink',
  '--color-danger-soft',
  '--color-ink',
  '--color-line',
  '--color-control',
  '--color-muted',
  '--color-primary',
  '--color-primary-soft',
  '--color-rule',
  '--font-mono',
  '--font-sans',
  '--radius-card',
  '--radius-control',
  '--radius-step',
  '--size-builder-header',
  '--size-button',
  '--size-button-compact',
  '--size-settings',
  '--size-sidebar',
  '--size-step-list',
].sort();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(css|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('inventory of the old token names that the code still reads', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const files = sourceFiles(join(here, '..')).filter((f) => !f.endsWith(join('ui', 'tokens.css')) && !f.endsWith('tokens.test.ts'));
  const used = new Set<string>();
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/var\((--[\w-]+)/g)) if (OLD_NAME.test(m[1]!)) used.add(m[1]!);
  }

  it('lists exactly the old names in OLD_NAMES_IN_USE (the list shrinks to empty by T7.17)', () => {
    expect([...used].sort()).toEqual(OLD_NAMES_IN_USE);
  });
});
