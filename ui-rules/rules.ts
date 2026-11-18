import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Each rule returns a list of violations (empty = the rule holds). Numbers come from docs/DESIGN.md and were checked
// against design/screens/*.html with getBoundingClientRect: title y 63, first block y 123 (148 before Phase 4), table row 57, buttons 40/36.
export const TITLE_Y = 63;
export const FIRST_BLOCK_Y = 123;
export const ROW_HEIGHT = 57;
export const BUTTON_HEIGHTS = [36, 40];

export type Rule = (page: Page) => Promise<string[]>;

export const buttonHeights: Rule = async (page) =>
  page.evaluate((allowed) => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('button')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.hasAttribute('data-infotip')) {
        // The one exception to 36 and 40 px: the info button is exactly 24 x 24 px (WCAG 2.2 target size).
        if (r.width !== 24 || r.height !== 24) bad.push(`info button "${el.getAttribute('aria-label') ?? ''}" is ${r.width} x ${r.height} px; it must be 24 x 24`);
        continue;
      }
      if (!allowed.includes(Math.round(r.height * 10) / 10)) {
        bad.push(`button "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim()}" is ${r.height} px high; allowed: ${allowed.join(', ')}`);
      }
    }
    return bad;
  }, BUTTON_HEIGHTS);

/**
 * SPEC 11.2: explanations live behind an info button. A visible element whose CSS class is named "hint" is an explanation
 * paragraph; state messages use the class "note". (The class names are kept in production builds by CSS modules.)
 */
export const noHintParagraphs: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('[class*="_hint_"], [class*="_help_"], [class*="_subtitle_"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      bad.push(`visible hint paragraph: "${(el.textContent ?? '').trim().slice(0, 60)}"; move it into an info button`);
    }
    return bad;
  });

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

/** Sidebar screens: the h1 sits at y 63 and the block with data-first-block at y 123. */
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

/**
 * DESIGN: buttons with the same visible name in a table carry an aria-label that names the row. Inside one table, a visible
 * name that appears more than once needs an aria-label on each of its buttons or links, and the labels differ.
 */
export const duplicateButtonNames: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const table of document.querySelectorAll('table')) {
      const groups = new Map<string, Element[]>();
      for (const el of table.querySelectorAll('tbody button, tbody a[href]')) {
        const text = (el.textContent ?? '').trim();
        if (!text) continue;
        groups.set(text, [...(groups.get(text) ?? []), el]);
      }
      for (const [text, els] of groups) {
        if (els.length < 2) continue;
        const labels = els.map((e) => e.getAttribute('aria-label') ?? '');
        if (labels.some((l) => l === '')) bad.push(`"${text}" appears ${els.length} times in a table and not every one has an aria-label that names the row`);
        else if (new Set(labels).size !== labels.length) bad.push(`"${text}" buttons in a table share an aria-label`);
      }
    }
    return bad;
  });

/** DESIGN: destructive buttons sit 8 px away from their neighbours. The gap between a danger button and any other button of the same container is 8 px or more. */
export const dangerSpacing: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const gap = (a: DOMRect, b: DOMRect): number => {
      const dx = Math.max(0, Math.max(a.left - b.right, b.left - a.right));
      const dy = Math.max(0, Math.max(a.top - b.bottom, b.top - a.bottom));
      return Math.hypot(dx, dy);
    };
    for (const danger of document.querySelectorAll('button[data-variant="danger"]')) {
      const dr = danger.getBoundingClientRect();
      if (dr.width === 0) continue;
      for (const other of danger.parentElement?.querySelectorAll('button') ?? []) {
        if (other === danger) continue;
        const or = other.getBoundingClientRect();
        if (or.width === 0) continue;
        const g = gap(dr, or);
        if (g < 8) bad.push(`danger button "${(danger.textContent ?? '').trim()}" is ${Math.round(g * 10) / 10} px from "${(other.textContent ?? '').trim()}"; at least 8 px is needed`);
      }
    }
    return bad;
  });

/** DESIGN: the sidebar is 232 px wide on every screen that has it. */
export const sidebarWidth: Rule = async (page) =>
  page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    if (!nav) return ['no main navigation'];
    const w = Math.round(nav.getBoundingClientRect().width);
    return w === 232 ? [] : [`the sidebar is ${w} px wide; expected 232`];
  });

/**
 * DESIGN: every control is reachable with the keyboard, with a visible focus ring. Tab through the page (up to 80 stops);
 * each focused control must show an outline of 2 px or a shadow, on itself or on the field that wraps it.
 */
export const keyboardFocusRing: Rule = async (page) => {
  const bad: string[] = [];
  const seen = new Set<string>();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const indicator = (e: Element): boolean => {
        const s = getComputedStyle(e);
        return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2) || s.boxShadow !== 'none';
      };
      let ok = indicator(el);
      for (let p: Element | null = el.parentElement, depth = 0; !ok && p && depth < 3; p = p.parentElement, depth++) ok = indicator(p) && p.matches(':focus-within');
      const r = el.getBoundingClientRect();
      const id = `${el.tagName}|${el.getAttribute('aria-label') ?? ''}|${(el.textContent ?? '').trim().slice(0, 30)}|${Math.round(r.x)},${Math.round(r.y)}`;
      return { id, ok, visible: r.width > 0 && r.height > 0, name: `${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30)}"` };
    });
    if (!info) break; // focus left the page: every control had its turn
    if (seen.has(info.id)) break; // came round to the first control again
    seen.add(info.id);
    if (info.visible && !info.ok) bad.push(`${info.name} shows no focus ring when it has keyboard focus`);
  }
  return bad;
};

/** Rules that run on every route. */
export const COMMON_RULES: Record<string, Rule> = {
  'button heights': buttonHeights,
  'no visible hint paragraphs': noHintParagraphs,
  'forbidden elements': forbiddenElements,
  'one cta': oneCta,
  'no horizontal scroll': noHorizontalScroll,
  'table rows': tableRows,
  'row buttons are named': duplicateButtonNames,
  'danger buttons are 8 px from their neighbours': dangerSpacing,
  'keyboard focus ring': keyboardFocusRing,
  'accessibility (axe)': axeSeriousOrCritical,
};

/**
 * SPEC 11.3: every visible text comes from the catalog. With the pseudo-locale on, the catalog wraps each text in the
 * markers and so any visible text or text attribute outside the markers is a literal. Text inside `[data-user-content]`
 * is user data (names, file content) and is never translated. Text without a letter (digits, punctuation) is allowed.
 */
export async function untranslatedText(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const bad: string[] = [];
    const root = document.querySelector(sel);
    if (!root) return [`no element matches ${sel}`];
    // Markers can nest (a text passed as a parameter of another text): strip the innermost pairs until none are left.
    // Dates such as 30 Sep 2026 keep their English month name until T4.7e puts month names in the catalog.
    const date = /\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g;
    const outside = (text: string): boolean => {
      let rest = text.replace(date, '');
      for (let prev = ''; prev !== rest; ) {
        prev = rest;
        rest = rest.replace(/\u27E6[^\u27E6\u27E7]*\u27E7/gu, '');
      }
      return /\p{L}/u.test(rest);
    };
    const skip = '[data-user-content], [data-code], .react-flow__attribution'; // user data, formula syntax such as function names, and the React Flow attribution link
    const visible = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return (r.width > 0 || r.height > 0) && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      const text = n.textContent ?? '';
      if (!el || !text.trim() || el.closest(skip) || el.closest('script, style') || !visible(el)) continue;
      if (outside(text)) bad.push(`text outside the catalog: "${text.trim().slice(0, 60)}"`);
    }
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el.closest(skip) || !visible(el)) continue;
      for (const attr of ['placeholder', 'aria-label', 'title', 'alt']) {
        const value = el.getAttribute(attr);
        if (value && outside(value)) bad.push(`${attr} outside the catalog: "${value.slice(0, 60)}"`);
      }
    }
    return bad;
  }, selector);
}
