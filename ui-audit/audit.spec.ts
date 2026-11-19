import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { ROUTES } from '../ui-rules/routes';

// Measures what a script can measure for the "UI quality checklist" (docs/DESIGN.md) and takes a full-page screenshot.
// The rest of the checklist is read from the screenshots. Findings are written to <UI_AUDIT_DIR>/<theme>/metrics.json.
const OUT = process.env.UI_AUDIT_DIR ?? 'ui-audit-out';

const slug = (s: string): string => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

interface Finding {
  item: number;
  what: string;
}

async function measure(page: import('@playwright/test').Page): Promise<Finding[]> {
  return page.evaluate(() => {
    const out: { item: number; what: string }[] = [];
    const name = (el: Element): string => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : ''}`;
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    // 1 Hierarchy: one h1, no skipped levels.
    const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).filter(visible);
    const levels = heads.map((h) => Number(h.tagName[1]));
    if (levels.filter((l) => l === 1).length !== 1) out.push({ item: 1, what: `${levels.filter((l) => l === 1).length} h1 elements` });
    for (let i = 1; i < levels.length; i++) if (levels[i]! - levels[i - 1]! > 1) out.push({ item: 1, what: `heading level jumps from h${levels[i - 1]} to h${levels[i]} ("${heads[i]!.textContent?.slice(0, 30)}")` });
    // 9 Text: nothing under 12 px.
    const small = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!visible(el)) continue;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!own) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 12) small.set(`${name(el)} ${px}px`, (small.get(`${name(el)} ${px}px`) ?? 0) + 1);
    }
    for (const [k, n] of small) out.push({ item: 9, what: `text under 12 px: ${k} (${n})` });
    // 2 Spacing: padding, gap and margins that are not on the 4 px grid (1 and 2 px are borders and hairlines).
    const off = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (!visible(el) || el.closest('.react-flow__renderer, svg')) continue;
      const s = getComputedStyle(el);
      for (const prop of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'rowGap', 'columnGap', 'marginTop', 'marginBottom'] as const) {
        const v = s[prop];
        if (!v || v === 'normal' || v === 'auto') continue;
        const px = parseFloat(v);
        if (Number.isNaN(px) || px === 0 || px === 1 || px === 2) continue;
        if (px % 4 !== 0) off.set(`${name(el)} ${prop}=${px}px`, (off.get(`${name(el)} ${prop}=${px}px`) ?? 0) + 1);
      }
    }
    for (const [k, n] of off) out.push({ item: 2, what: `off the 4 px grid: ${k} (${n})` });
    // 3 Alignment: numbers in a table are right-aligned.
    for (const td of Array.from(document.querySelectorAll('td')).filter(visible)) {
      const t = (td.textContent ?? '').trim();
      if (/^-?[\d.,]+$/.test(t) && getComputedStyle(td).textAlign !== 'right' && getComputedStyle(td).textAlign !== 'end') {
        out.push({ item: 3, what: `number "${t}" in a table cell is not right-aligned (${name(td)})` });
        break;
      }
    }
    // 3 Long names truncate with an ellipsis and keep the full text reachable.
    for (const el of Array.from(document.querySelectorAll('body *')).filter(visible)) {
      const s = getComputedStyle(el);
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth && !el.getAttribute('title') && !el.getAttribute('aria-label')) out.push({ item: 3, what: `truncated text without a title: ${name(el)} "${(el.textContent ?? '').slice(0, 30)}"` });
    }
    // 10 Motion: transitions at most 200 ms.
    const slow = new Map<string, number>();
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const s = getComputedStyle(el);
      const ds = s.transitionDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000));
      const max = Math.max(...ds, 0);
      if (max > 200) slow.set(`${name(el)} ${max}ms`, 1);
    }
    for (const k of slow.keys()) out.push({ item: 10, what: `transition over 200 ms: ${k}` });
    // 8 Keyboard: controls reachable (a clickable element that is not a button, link or input and has no tabindex).
    for (const el of Array.from(document.querySelectorAll('[onclick], [role="button"]')).filter(visible)) {
      if (el.tagName !== 'BUTTON' && el.tagName !== 'A' && el.getAttribute('tabindex') === null) out.push({ item: 8, what: `clickable ${name(el)} without tabindex` });
    }
    return out;
  });
}

for (const route of ROUTES) {
  test(`audit ${route.name ?? route.path}`, async ({ page }, info) => {
    const theme = info.project.name;
    const dir = path.join(OUT, theme);
    mkdirSync(dir, { recursive: true });
    await route.before?.(page);
    await page.goto(route.path);
    await page.waitForLoadState('networkidle');
    await route.prepare?.(page);
    await page.waitForTimeout(300);
    const file = `${slug(route.name ?? route.path)}.png`;
    await page.screenshot({ path: path.join(dir, file), fullPage: true });
    const findings = await measure(page);
    // Reduced motion: no transition may run.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const moving = await page.evaluate(() => {
      const bad = new Set<string>();
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const s = getComputedStyle(el);
        const t = Math.max(...s.transitionDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)), 0);
        const a = s.animationName !== 'none' && parseFloat(s.animationDuration) > 0 && s.animationIterationCount !== '1';
        if (t > 0 || a) bad.add(`${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''} transition ${t}ms animation ${s.animationName}`);
      }
      return Array.from(bad);
    });
    for (const m of moving) findings.push({ item: 10, what: `moves with prefers-reduced-motion: ${m}` });
    writeFileSync(path.join(dir, `${slug(route.name ?? route.path)}.json`), JSON.stringify({ route: route.name ?? route.path, file, findings }, null, 1));
  });
}
