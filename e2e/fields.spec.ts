import { expect, test } from '@playwright/test';

// T7.7a: the Harold fields, checkbox and switch (light theme, so the values are those of the light tokens).
test('a text field is a 40 px box on the inset tint with a border-strong outline, and focus draws a 1 px primary ring', async ({ page }) => {
  await page.goto('/dev/components');
  const input = page.getByRole('textbox', { name: 'New column name' });
  const control = input.locator('..');
  const idle = await control.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, border: cs.borderTopWidth, color: cs.borderTopColor, bg: cs.backgroundColor, radius: cs.borderTopLeftRadius };
  });
  expect(idle).toEqual({ height: 40, border: '1px', color: 'rgba(15, 26, 43, 0.55)', bg: 'rgba(15, 26, 43, 0.05)', radius: '14px' });
  await input.focus();
  await expect.poll(() => control.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(26, 86, 192)');
  expect(await control.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb(26, 86, 192) 0px 0px 0px 1px');
  expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe('15px');
});

test('an error has an icon, the words and aria-invalid, and the box turns danger', async ({ page }) => {
  await page.goto('/dev/components');
  const name = page.getByRole('textbox', { name: 'Flow name' });
  await expect(name).toHaveAttribute('aria-invalid', 'true');
  const alert = page.getByRole('alert').filter({ has: page.locator('svg') });
  await expect(alert.first()).toBeVisible();
  expect(await name.locator('..').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(179, 38, 30)');
});

test('a checkbox is an 18 px box with a 1.5 px border-strong outline, filled primary when checked; disabled is 40 % opacity', async ({ page }) => {
  await page.goto('/dev/components');
  const boxes = page.getByRole('checkbox');
  const first = boxes.first();
  const style = () => first.locator('span').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, border: cs.borderTopWidth, color: cs.borderTopColor, bg: cs.backgroundColor };
  });
  const before = await style();
  const checkedBefore = (await first.getAttribute('aria-checked')) === 'true';
  expect(before.w).toBe(18);
  expect(before.h).toBe(18);
  // 1.5 px is drawn as 1 px at a device pixel ratio of 1.
  expect(['1px', '1.5px']).toContain(before.border);
  await first.click();
  // The colours change over 120 ms: wait for the transitions to end instead of a fixed time (a loaded machine drew the box part
  // of the way, "rgba(16, 31, 56, 0.57)", in a full run of the gates).
  await first.evaluate((el) => Promise.all(Array.from(el.querySelectorAll('span')).flatMap((s) => s.getAnimations().map((a) => a.finished))).then(() => undefined));
  await page.waitForTimeout(50);
  const after = await style();
  const filled = checkedBefore ? before : after;
  const empty = checkedBefore ? after : before;
  expect(filled.bg).toBe('rgb(29, 95, 209)');
  expect(empty.color).toBe('rgba(15, 26, 43, 0.55)');
  const disabled = boxes.filter({ hasText: 'Not available' });
  expect(await disabled.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.4');
});

test('a switch is a 40 x 24 px track that moves its thumb 16 px', async ({ page }) => {
  await page.goto('/dev/components');
  const sw = page.getByRole('switch');
  const box = (await sw.boundingBox())!;
  expect([box.width, box.height]).toEqual([40, 24]);
  const thumb = () => sw.evaluate((el) => getComputedStyle(el, '::after').transform);
  const state = await sw.getAttribute('aria-checked');
  await sw.click();
  await expect(sw).toHaveAttribute('aria-checked', state === 'true' ? 'false' : 'true');
  await expect.poll(thumb).toBe(state === 'true' ? 'none' : 'matrix(1, 0, 0, 1, 16, 0)');
  await sw.focus();
  await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked', state ?? 'false');
});
