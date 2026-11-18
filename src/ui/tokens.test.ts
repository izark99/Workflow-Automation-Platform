import { readFileSync } from 'node:fs';
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

// [foreground, background, minimum ratio]
const PAIRS: Array<[string, string, number]> = [
  ['ink', 'bg', 4.5],
  ['ink', 'card', 4.5],
  ['muted', 'card', 4.5],
  ['muted', 'bg', 4.5],
  ['control', 'card', 3],
  ['focus', 'card', 3],
  ['on-primary', 'primary', 4.5],
  ['on-cta', 'cta', 4.5],
  ['danger', 'card', 4.5],
  ['ink', 'primary-soft', 4.5],
  ['badge-ink', 'primary-soft', 4.5],
  ['danger-ink', 'danger-soft', 4.5],
  ['note-ink', 'note-bg', 4.5],
  ['draft-ink', 'note-bg', 4.5],
  ['ended-ink', 'rule', 4.5],
  ['bg', 'ink', 4.5], // toast text on the toast fill
];

describe.each(['light', 'dark'] as const)('%s theme contrast', (theme) => {
  const tokens = themeTokens(theme);
  it.each(PAIRS)('%s on %s is at least %s:1', (fg, bg, min) => {
    const fgValue = tokens[`--color-${fg}`];
    const bgValue = tokens[`--color-${bg}`];
    expect(fgValue, `--color-${fg}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(bgValue, `--color-${bg}`).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrast(fgValue!, bgValue!)).toBeGreaterThanOrEqual(min);
  });
});

describe('both themes define the same colour tokens', () => {
  it('dark overrides every colour token of light', () => {
    const light = themeTokens('light');
    const dark = css.match(/:root\[data-theme='dark'\]\s*\{([^}]*)\}/)![1]!;
    const darkNames = Object.keys(declarations(dark));
    const missing = Object.keys(light).filter((k) => k.startsWith('--color-') && !darkNames.includes(k));
    expect(missing).toEqual([]);
  });
});
