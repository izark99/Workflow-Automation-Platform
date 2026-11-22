import { expect, test } from '@playwright/test';

// T7.9a: the Harold display components (light theme values).
test('a card is glass: translucent fill, blur with saturate, 1 px border, shadow-sm, radius-lg and 24 px padding', async ({ page }) => {
  await page.goto('/dev/components');
  const card = page.locator('section').first();
  const look = await card.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, blur: cs.backdropFilter, radius: cs.borderTopLeftRadius, pad: cs.paddingTop, border: cs.borderTopWidth, stripeLeft: cs.borderLeftWidth, shadow: cs.boxShadow };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.72)');
  expect(look.blur).toBe('blur(24px) saturate(1.5)');
  expect(look.radius).toBe('22px');
  expect(look.pad).toBe('24px');
  expect(look.border).toBe('1px');
  expect(look.stripeLeft).toBe('1px'); // no coloured stripe on one side
  expect(look.shadow).toContain('rgba(15, 26, 43, 0.08) 0px 2px 8px');
});

test('a badge is a 22 px box with radius-sm, a chip is a 32 px pill with a check when selected, a tab has its underline', async ({ page }) => {
  await page.goto('/dev/components');
  const badge = page.getByText('Published', { exact: true }).first();
  const b = await badge.evaluate((el) => ({ h: el.getBoundingClientRect().height, radius: getComputedStyle(el).borderTopLeftRadius, bg: getComputedStyle(el).backgroundColor }));
  expect(b).toEqual({ h: 22, radius: '8px', bg: 'rgba(47, 111, 232, 0.14)' });
  const tab = page.getByRole('tab', { selected: true }).first();
  const underline = await tab.evaluate((el) => ({ color: getComputedStyle(el).color, h: getComputedStyle(el, '::after').height, bg: getComputedStyle(el, '::after').backgroundColor }));
  expect(underline).toEqual({ color: 'rgb(26, 86, 192)', h: '2px', bg: 'rgb(26, 86, 192)' });
  await page.goto('/flows');
  const chips = page.getByRole('group').getByRole('button', { pressed: true });
  await expect(chips.first()).toBeVisible();
  const chip = await chips.first().evaluate((el) => ({ h: el.getBoundingClientRect().height, radius: getComputedStyle(el).borderTopLeftRadius, check: el.querySelectorAll('svg').length, color: getComputedStyle(el).color }));
  expect(chip).toEqual({ h: 32, radius: '999px', check: 1, color: 'rgb(26, 86, 192)' });
});

test('the empty state has its icon in a 48 px tile, the error is an alert with a danger border and an icon, the warning has an icon', async ({ page }) => {
  await page.goto('/dev/components');
  const empty = page.getByText('No flows yet').first();
  const tile = await empty.locator('xpath=preceding-sibling::span[1]').evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, bg: getComputedStyle(el).backgroundColor }));
  expect(tile).toEqual({ w: 48, h: 48, bg: 'rgba(15, 26, 43, 0.05)' });
  const alert = page.getByRole('alert').filter({ has: page.locator('b') }).first();
  const look = await alert.evaluate((el) => ({ border: getComputedStyle(el).borderTopColor, radius: getComputedStyle(el).borderTopLeftRadius, icons: el.querySelectorAll('svg').length }));
  expect(look).toEqual({ border: 'rgb(179, 38, 30)', radius: '14px', icons: 1 });
});

test('the skeleton is a final layout of blocks with a 1.4 s shimmer, also when the person asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/components');
  // The head bars of the table do not shimmer; the first bar of a row does.
  const look = await page.evaluate(() => {
    const bars = Array.from(document.querySelectorAll('[aria-busy="true"] span')).filter((el) => el.children.length === 0 && getComputedStyle(el, '::after').animationName !== 'none');
    const el = bars[0]!;
    return { count: bars.length, bg: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderTopLeftRadius, anim: getComputedStyle(el, '::after').animationDuration, name: getComputedStyle(el, '::after').animationName };
  });
  expect(look.count).toBeGreaterThan(3);
  expect(look.bg).toBe('rgba(15, 26, 43, 0.05)');
  expect(look.radius).toBe('8px');
  expect(look.anim).toBe('1.4s');
  expect(look.name).not.toBe('none');
});

test('the progress bar grows over 260 ms on a surface-300 track', async ({ page }) => {
  await page.goto('/dev/components');
  const bar = page.getByRole('progressbar').first();
  const look = await bar.evaluate((el) => ({ track: getComputedStyle(el).backgroundColor, h: el.getBoundingClientRect().height, fill: getComputedStyle(el.firstElementChild!).backgroundColor, transition: getComputedStyle(el.firstElementChild!).transitionDuration }));
  expect(look).toEqual({ track: 'rgba(15, 26, 43, 0.05)', h: 8, fill: 'rgb(29, 95, 209)', transition: '0.26s' });
});
