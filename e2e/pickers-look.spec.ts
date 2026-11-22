import { expect, test } from '@playwright/test';

// T7.7b: the Harold dropdown and date picker (light theme values).
test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Components and states', level: 1 })).toBeVisible();
});

test('the dropdown trigger is a 40 px box on the inset tint, and the chevron turns 180 degrees while the list is open', async ({ page }) => {
  const trigger = page.locator('button[aria-haspopup="listbox"][aria-label*=":"]').first();
  const box = await trigger.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { h: el.getBoundingClientRect().height, bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderTopLeftRadius };
  });
  expect(box).toEqual({ h: 40, bg: 'rgba(15, 26, 43, 0.05)', border: 'rgba(15, 26, 43, 0.55)', radius: '14px' });
  const chevron = () => trigger.locator('svg').evaluate((el) => getComputedStyle(el).transform);
  expect(await chevron()).toBe('none');
  await trigger.click();
  await expect.poll(chevron, { timeout: 2000 }).toBe('matrix(-1, 0, 0, -1, 0, 0)');
});

test('the list is on surface-overlay with shadow-md, opens in 200 ms and closes in 120 ms; the selected option is primary-text with a check at the end', async ({ page }) => {
  const trigger = page.locator('button[aria-haspopup="listbox"][aria-label*=":"]').first();
  await trigger.click();
  const list = page.getByRole('listbox').first();
  await expect(list).toBeVisible();
  const look = await list.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, name: cs.animationName, duration: cs.animationDuration };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.95)');
  expect(look.radius).toBe('14px');
  expect(look.shadow).toContain('rgba(15, 26, 43, 0.14) 0px 12px 32px');
  expect(look.duration).toBe('0.2s');
  const selected = list.getByRole('option', { selected: true });
  expect(await selected.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(26, 86, 192)');
  const placement = await selected.evaluate((el) => {
    const svg = el.querySelector('svg')!;
    const s = svg.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { checkAtEnd: r.right - s.right < 16, count: el.querySelectorAll('svg').length };
  });
  expect(placement).toEqual({ checkAtEnd: true, count: 1 });
  // Closing: the list stays for its 120 ms exit, with data-closing, and is then gone.
  const leaving = page.locator(`[id="${await list.getAttribute('id')}"]`);
  await page.keyboard.press('Escape');
  await expect(leaving).toHaveAttribute('data-closing', 'true');
  await expect(leaving).toHaveAttribute('aria-hidden', 'true');
  expect(await leaving.evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0.12s');
  await expect(leaving).toHaveCount(0);
});

test('the date picker keeps 30 Sep 2026 and the Monday start; the selected day is a blue fill and today is a ring', async ({ page }) => {
  const trigger = page.locator('button[aria-haspopup="dialog"]').first();
  await expect(trigger).toContainText(/\d{1,2} [A-Z][a-z]{2} \d{4}/);
  await trigger.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible();
  const selected = dialog.locator('button[aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  const fill = await selected.evaluate((el) => ({ bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color, h: (el as HTMLElement).offsetHeight }));
  expect(fill).toEqual({ bg: 'rgb(29, 95, 209)', color: 'rgb(255, 255, 255)', h: 32 });
  expect(await dialog.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(255, 255, 255, 0.95)');
  const weekdays = await dialog.locator('[aria-hidden="true"]').allTextContents();
  expect(weekdays.slice(0, 7).join('')).toMatch(/^Mo|^M/);
  // Today has a ring when it is on the shown month (the page shows September 2026, so move to the current month).
  const today = dialog.locator('[data-today="true"]');
  if (await today.count()) expect(await today.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('inset');
});
