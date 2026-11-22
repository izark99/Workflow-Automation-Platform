import { expect, test } from '@playwright/test';

// T7.6a: the Harold button on the /dev/components page.
test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Components and states', level: 1 })).toBeVisible();
});

test('a button has no border, md is 40 px and sm is 32 px, and the variants have their fills', async ({ page }) => {
  const info = await page.evaluate(() => {
    const out: Record<string, { height: number; border: string; bg: string }> = {};
    for (const b of Array.from(document.querySelectorAll<HTMLButtonElement>('button[data-variant]'))) {
      if (b.hasAttribute('data-infotip') || b.disabled) continue;
      const cs = getComputedStyle(b);
      const key = `${b.dataset.variant}-${Math.round(b.getBoundingClientRect().height)}`;
      out[key] ??= { height: b.getBoundingClientRect().height, border: cs.borderTopWidth, bg: cs.backgroundColor };
    }
    return out;
  });
  const keys = Object.keys(info);
  expect(keys.length).toBeGreaterThan(3);
  for (const [key, v] of Object.entries(info)) {
    expect([32, 40], key).toContain(v.height);
    expect(v.border, key).toBe('0px');
  }
  // Light theme: primary is #1d5fd1; secondary is a translucent neutral fill; danger is #b3261e.
  const bg = (variant: string) => Object.entries(info).find(([k]) => k.startsWith(`${variant}-`))?.[1].bg;
  expect(bg('primary')).toBe('rgb(29, 95, 209)');
  expect(bg('secondary')).toBe('rgba(15, 26, 43, 0.08)');
  expect(bg('danger')).toBe('rgb(179, 38, 30)');
});

test('loading keeps the width of the button and sets aria-busy', async ({ page }) => {
  const result = await page.evaluate(() => {
    const idle = document.querySelector<HTMLButtonElement>('button[data-variant="secondary"]:not([disabled]):not([aria-busy])')!;
    const before = idle.getBoundingClientRect().width;
    idle.setAttribute('aria-busy', 'true');
    const during = idle.getBoundingClientRect().width;
    const labelOpacity = getComputedStyle(idle.querySelector('span')!).opacity;
    idle.removeAttribute('aria-busy');
    return { before, during, labelOpacity };
  });
  expect(result.during).toBe(result.before);
  expect(result.labelOpacity).toBe('0');
  await expect(page.locator('button[aria-busy="true"]').first()).toBeVisible();
});

test('pressing a button scales it to 0.98, and an icon button shows its label as a tooltip after 400 ms', async ({ page }) => {
  const press = page.getByRole('button', { name: 'Save draft' }).first();
  const box = (await press.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => press.evaluate((el) => getComputedStyle(el).transform)).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
  await page.mouse.up();
  await page.mouse.move(0, 0);
});

test('an icon button shows its label as a tooltip after 400 ms of hover, and has no native title', async ({ page }) => {
  const icon = page.locator('button[data-tooltip]').first();
  await expect(icon).toHaveAttribute('data-tooltip', /.+/);
  expect(await icon.getAttribute('title')).toBeNull();
  const opacity = () => icon.evaluate((el) => getComputedStyle(el, '::after').opacity);
  const delay = await icon.evaluate((el) => {
    el.dispatchEvent(new Event('x'));
    return getComputedStyle(el, '::after').transitionDelay;
  });
  expect(delay).toBe('0s');
  await icon.hover();
  expect(await opacity()).toBe('0');
  await page.waitForTimeout(250);
  expect(Number(await opacity())).toBeLessThan(1);
  await expect.poll(opacity, { timeout: 2000 }).toBe('1');
  await page.mouse.move(0, 0);
  await expect.poll(opacity, { timeout: 2000 }).toBe('0');
});
