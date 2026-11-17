import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Each rule returns a list of violations (empty = the rule holds). Numbers come from docs/DESIGN.md and were checked
// against design/screens/*.html with getBoundingClientRect: title y 63, first block y 148, table row 57, buttons 40/36.
export const TITLE_Y = 63;
export const FIRST_BLOCK_Y = 148;
export const ROW_HEIGHT = 57;
export const BUTTON_HEIGHTS = [36, 40];

export type Rule = (page: Page) => Promise<string[]>;

export const buttonHeights: Rule = async (page) =>
  page.evaluate((allowed) => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (!allowed.includes(Math.round(r.height * 10) / 10)) {
        bad.push(`button "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}" is ${r.height} px high; allowed: ${allowed.join(', ')}`);
      }
    }
    return bad;
  }, BUTTON_HEIGHTS);

export const forbiddenElements: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const hidden = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0' || r.width <= 1 || r.height <= 1;
    };
    for (const sel of ['select', 'input[type=date]', 'input[type=checkbox]', 'input[type=radio]', 'input[type=search]', 'input[type=color]']) {
      for (const el of document.querySelectorAll(sel)) bad.push(`forbidden element ${sel}${hidden(el) ? ' (hidden)' : ''}`);
    }
    for (const el of document.querySelectorAll('input[type=file]')) {
      if (!hidden(el)) bad.push('visible input[type=file]');
    }
    for (const el of document.querySelectorAll('textarea')) {
      if (getComputedStyle(el).resize !== 'none') bad.push('textarea is resizable');
    }
    return bad;
  });

export const oneCta: Rule = async (page) =>
  page.evaluate(() => {
    const n = document.querySelectorAll('[data-variant="cta"]').length;
    return n > 1 ? [`${n} cta buttons on one screen; at most 1 is allowed`] : [];
  });

export const noHorizontalScroll: Rule = async (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth > d.clientWidth ? [`page scrolls horizontally: scrollWidth ${d.scrollWidth} > clientWidth ${d.clientWidth}`] : [];
  });

export const tableRows: Rule = async (page) =>
  page.evaluate((expected) => {
    const bad: string[] = [];
    for (const tr of document.querySelectorAll('tbody tr')) {
      const h = tr.getBoundingClientRect().height;
      if (h !== expected) bad.push(`table row is ${h} px high; expected ${expected}`);
    }
    return bad;
  }, ROW_HEIGHT);

/** Sidebar screens: the h1 sits at y 63 and the block with data-first-block at y 148. */
export const headerPosition: Rule = async (page) =>
  page.evaluate(
    ([titleY, blockY]) => {
      const bad: string[] = [];
      const h1 = document.querySelector('h1');
      if (!h1) return ['no h1 on the page'];
      const y = h1.getBoundingClientRect().y;
      if (y !== titleY) bad.push(`title y is ${y}; expected ${titleY}`);
      const block = document.querySelector('[data-first-block]');
      if (!block) bad.push('no element with data-first-block');
      else if (block.getBoundingClientRect().y !== blockY) bad.push(`first block y is ${block.getBoundingClientRect().y}; expected ${blockY}`);
      return bad;
    },
    [TITLE_Y, FIRST_BLOCK_Y],
  );

export const axeSeriousOrCritical: Rule = async (page) => {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `axe ${v.impact}: ${v.id} (${v.nodes.length} nodes): ${v.help}`);
};

/** Rules that run on every route. */
export const COMMON_RULES: Record<string, Rule> = {
  'button heights': buttonHeights,
  'forbidden elements': forbiddenElements,
  'one cta': oneCta,
  'no horizontal scroll': noHorizontalScroll,
  'table rows': tableRows,
  'accessibility (axe)': axeSeriousOrCritical,
};
