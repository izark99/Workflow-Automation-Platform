import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

// Each rule returns a list of violations (empty = the rule holds). Numbers come from docs/DESIGN.md and were checked
// against design/screens/*.html with getBoundingClientRect: title y 23, first block y 88 from Phase 7 (63 and 123 before), table row 57, buttons 40/36.
// Phase 7 (T7.10): the 64 px page header (3 px, a 20 px breadcrumb line, the 38 px title) and 24 px (space-5) to the first block.
export const TITLE_Y = 23;
export const FIRST_BLOCK_Y = 88;
/** Harold: rows of 44 px plus a 1 px divider; dense rows (a grid where the same data is edited) of 36 px plus 1. */
export const ROW_HEIGHT = 45;
export const DENSE_ROW_HEIGHT = 37;
/** Harold: 40 (md) and 32 (sm), and the 24 px info button (checked apart). */
export const BUTTON_HEIGHTS = [32, 40];

export type Rule = (page: Page) => Promise<string[]>;

/** Waits for the finite animations of the page: a popover opens with a fade and a scale, and is measured when it has settled. */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

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
      if (el.getAttribute('role') === 'switch') {
        // The Harold switch: a 40 x 24 px track.
        if (r.width !== 40 || r.height !== 24) bad.push(`switch "${el.getAttribute('aria-label') ?? ''}" is ${r.width} x ${r.height} px; it must be 40 x 24`);
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

/**
 * Harold: at most one `primary` button per screen. While a modal dialog is open it is the screen (the page behind it is
 * inert), so the count is made inside the dialog; it is the one `primary` button of its footer.
 */
export const onePrimary: Rule = async (page) =>
  page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]');
    const scope: ParentNode = modal ?? document;
    const n = scope.querySelectorAll('[data-variant="primary"]').length;
    return n > 1 ? [`${n} primary buttons on one screen${modal ? ' (inside the open dialog)' : ''}; at most 1 is allowed`] : [];
  });

export const noHorizontalScroll: Rule = async (page) =>
  page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth > d.clientWidth ? [`page scrolls horizontally: scrollWidth ${d.scrollWidth} > clientWidth ${d.clientWidth}`] : [];
  });

export const tableRows: Rule = async (page) =>
  page.evaluate(
    ([normal, dense]) => {
      const bad: string[] = [];
      for (const tr of document.querySelectorAll('tbody tr')) {
        const expected = tr.closest('[data-dense]') ? dense! : normal!;
        const h = tr.getBoundingClientRect().height;
        if (h !== expected) bad.push(`table row is ${h} px high; expected ${expected}`);
      }
      return bad;
    },
    [ROW_HEIGHT, DENSE_ROW_HEIGHT],
  );

/** Sidebar screens: the h1 sits at y 23 and the block with data-first-block at y 88 (T7.10). */
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

/** DESIGN: the sidebar is 240 px wide on every screen that has it, and 64 px when it is collapsed to a rail. */
export const sidebarWidth = async (page: Page, expected = 240): Promise<string[]> =>
  page.evaluate((want) => {
    const nav = document.querySelector('nav[aria-label="Main"]');
    if (!nav) return ['no main navigation'];
    const w = Math.round(nav.getBoundingClientRect().width);
    return w === want ? [] : [`the sidebar is ${w} px wide; expected ${want}`];
  }, expected);

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
    await settleAnimations(page); // a ring fades in over 120 ms: it is judged when it has arrived
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      // The colour of the ring is the token `primary-text`, as the browser computes it.
      const probe = document.createElement('span');
      probe.style.color = 'var(--primary-text)';
      document.body.append(probe);
      const ring = getComputedStyle(probe).color;
      probe.style.color = 'var(--danger)';
      const danger = getComputedStyle(probe).color;
      probe.remove();
      // Harold: a 2 px `primary-text` outline with a 2 px gap on every interactive element; a text field draws a 1 px
      // `primary-text` ring (a shadow) on its box instead, so the shadow may sit on the field or on the box that wraps it.
      const outlined = (e: Element): boolean => {
        const s = getComputedStyle(e);
        return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) === 2 && s.outlineColor === ring && parseFloat(s.outlineOffset) === 2;
      };
      // A field with an error draws its ring in `danger`.
      const shadowed = (e: Element): boolean => {
        const shadow = getComputedStyle(e).boxShadow;
        return shadow.includes(ring) || (el.getAttribute('aria-invalid') === 'true' && shadow.includes(danger));
      };
      let ok = outlined(el) || shadowed(el);
      for (let p: Element | null = el.parentElement, depth = 0; !ok && p && depth < 3; p = p.parentElement, depth++) ok = shadowed(p) && p.matches(':focus-within');
      const r = el.getBoundingClientRect();
      const id = `${el.tagName}|${el.getAttribute('aria-label') ?? ''}|${(el.textContent ?? '').trim().slice(0, 30)}|${Math.round(r.x)},${Math.round(r.y)}`;
      return { id, ok, visible: r.width > 0 && r.height > 0, name: `${el.tagName.toLowerCase()} "${el.getAttribute('aria-label') ?? (el.textContent ?? '').trim().slice(0, 30)}"` };
    });
    if (!info) break; // focus left the page: every control had its turn
    if (seen.has(info.id)) break; // came round to the first control again
    seen.add(info.id);
    if (info.visible && !info.ok) bad.push(`${info.name} does not show the Harold focus ring (2 px primary-text, 2 px gap) when it has keyboard focus`);
  }
  return bad;
};

/** Harold: the scene is the only gradient (the page background), and there is no gradient text. */
export const noGradient: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      if (el === document.body || el === document.documentElement) continue;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const image = getComputedStyle(el, pseudo).backgroundImage;
        if (image.includes('gradient')) bad.push(`${el.tagName.toLowerCase()}${pseudo ?? ''} "${String(el.className).slice(0, 30)}" has a gradient`);
      }
    }
    return bad;
  });

/** Harold: no card with a coloured stripe on one side (one border side thicker than 1 px while the others have none). */
export const noStripe: Rule = async (page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const s = getComputedStyle(el);
      if (el.closest('.react-flow__edges, svg')) continue;
      const widths = [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].map(parseFloat);
      const drawn = widths.filter((w) => w > 0);
      if (drawn.length === 1 && drawn[0]! >= 2 && (el.getBoundingClientRect().height >= 24 || el.getBoundingClientRect().width >= 24)) bad.push(`${el.tagName.toLowerCase()} "${String(el.className).slice(0, 30)}" has a ${drawn[0]} px border on one side only`);
    }
    return bad;
  });

/** Harold: font sizes only from the type table (12, 13, 14, 15, 16, 18, 22, 28 px) on text that is drawn. */
export const FONT_SIZES = [12, 13, 14, 15, 16, 18, 22, 28];
export const fontSizes: Rule = async (page) =>
  page.evaluate((allowed) => {
    const bad = new Map<string, number>();
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue;
      const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (!own || el.closest('svg')) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (!allowed.includes(px)) bad.set(`${el.tagName.toLowerCase()} "${String(el.className).slice(0, 30)}" has font size ${px} px`, 1);
    }
    return [...bad.keys()];
  }, FONT_SIZES);

/**
 * Harold: a blurred element never changes size by animation. An element with a backdrop blur must have no transition on
 * width, height, their min and max, or `all` (a collapsing panel keeps its 200 ms and has no blur while it moves).
 */
export const noBlurAnimation: Rule = async (page) =>
  page.evaluate(() => {
    const SIZE = new Set(['all', 'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', 'inline-size', 'block-size']);
    const bad: string[] = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      const blur = cs.backdropFilter || (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none';
      if (blur === 'none') continue;
      const props = cs.transitionProperty.split(',').map((p) => p.trim());
      const times = cs.transitionDuration.split(',').map((t) => parseFloat(t));
      const moves = props.filter((p, i) => SIZE.has(p) && (times[i % times.length] ?? 0) > 0);
      if (moves.length > 0) {
        const name = el.getAttribute('aria-label') ?? el.className?.toString().slice(0, 40) ?? el.tagName;
        bad.push(`${el.tagName.toLowerCase()} "${name}" has a backdrop blur and a transition on ${moves.join(', ')}`);
      }
    }
    return bad;
  });

/** Rules that run on every route. */
export const COMMON_RULES: Record<string, Rule> = {
  'button heights': buttonHeights,
  'no visible hint paragraphs': noHintParagraphs,
  'forbidden elements': forbiddenElements,
  'one primary': onePrimary,
  'no horizontal scroll': noHorizontalScroll,
  'table rows': tableRows,
  'row buttons are named': duplicateButtonNames,
  'danger buttons are 8 px from their neighbours': dangerSpacing,
  'keyboard focus ring': keyboardFocusRing,
  'accessibility (axe)': axeSeriousOrCritical,
  'no blur animation': noBlurAnimation,
  'no gradient but the scene': noGradient,
  'no card with a stripe on one side': noStripe,
  'font sizes from the type table': fontSizes,
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
    const date = /\b(?:\d{1,2} )?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g;
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
      if (outside(text)) bad.push(`text outside the catalog: "${text.trim().slice(0, 60)}" in <${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}>`);
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

/** DESIGN, Collapsible panels: a panel is exactly `expected` px wide, and the page needs no horizontal scrolling. */
export const panelWidth = async (page: Page, selector: string, expected: number): Promise<string[]> =>
  page.evaluate(
    ([sel, want]) => {
      const bad: string[] = [];
      const el = document.querySelector(sel as string);
      if (!el) return [`no panel matches ${sel}`];
      const w = Math.round(el.getBoundingClientRect().width);
      if (w !== want) bad.push(`${sel} is ${w} px wide; expected ${want}`);
      const doc = document.documentElement;
      if (doc.scrollWidth > doc.clientWidth) bad.push(`the page scrolls horizontally (${doc.scrollWidth} > ${doc.clientWidth})`);
      return bad;
    },
    [selector, expected] as const,
  );

/** DESIGN, Collapsible panels: a collapsed panel never scrolls, and every button in it is a toggle or a 36 or 40 px icon button. */
export const railShape: (page: Page, selector: string) => Promise<string[]> = async (page, selector) =>
  page.evaluate((sel) => {
    const bad: string[] = [];
    const el = document.querySelector(sel);
    if (!el) return [`no panel matches ${sel}`];
    const cs = getComputedStyle(el);
    if (el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== 'hidden') bad.push(`${sel} scrolls in its collapsed state`);
    for (const b of Array.from(el.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.width > 48) bad.push(`a button in the rail is ${Math.round(r.width)} px wide`);
      if (!b.getAttribute('aria-label') && !b.textContent?.trim()) bad.push('a button in the rail has no name');
    }
    return bad;
  }, selector);
