import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

// A popover must never be cut off by the container of its button: a table that scrolls, a card, the settings panel.

/** True when the point at the middle of each of the four edges of the element is the element itself (or inside it). */
async function fullyVisible(el: Locator): Promise<boolean> {
  return el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    if (r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight) return false;
    const points: [number, number][] = [
      [r.left + 4, r.top + 4],
      [r.right - 4, r.top + 4],
      [r.left + 4, r.bottom - 4],
      [r.right - 4, r.bottom - 4],
      [r.left + r.width / 2, r.top + r.height / 2],
    ];
    return points.every(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && (node === hit || node.contains(hit));
    });
  });
}

for (const [width, height] of [[1280, 720], [900, 600], [700, 500]] as const) {
  test(`the More menu of the last row of a table is not cut off by the table or its card (${width} x ${height})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/admin');
    const users = page.getByRole('table', { name: 'Users' });
    const last = users.locator('tbody tr').last().getByRole('button', { name: /^More/ });
    await last.scrollIntoViewIfNeeded();
    await last.click();
    const menu = page.getByRole('listbox');
    await expect(menu).toBeVisible();
    expect(await fullyVisible(menu)).toBe(true);
    for (const name of ['Reset password', 'Lock account']) expect(await fullyVisible(page.getByRole('option', { name })), name).toBe(true);
    // A click on an item works (the layer is not a child of the table any more, but it is not "outside" for the menu).
    await page.getByRole('option', { name: 'Reset password' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
}

test('the menu still closes on a click elsewhere and on Escape, and returns focus to its button', async ({ page }) => {
  await page.goto('/admin');
  const first = page.getByRole('table', { name: 'Users' }).locator('tbody tr').first().getByRole('button', { name: /^More/ });
  await first.click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(first).toBeFocused();
  await first.click();
  await page.mouse.click(700, 20);
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

async function newFlowWithStep(page: Page): Promise<void> {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Popover test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.getByRole('button', { name: 'Add step Filter' }).click();
}

for (const width of [1280, 900, 700]) {
  test(`an info button in the settings panel opens a popover that is inside the window and not cut off (${width} px wide)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 });
    await newFlowWithStep(page);
    const panel = page.getByRole('complementary', { name: 'Step settings' });
    await panel.getByRole('button', { name: 'About Step name' }).click();
    const pop = page.getByText(/in messages/i).first();
    await expect(pop).toBeVisible();
    expect(await fullyVisible(pop)).toBe(true);
    const box = (await pop.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  });
}

test('an info button still opens on hover and the pointer can move onto the popover without closing it', async ({ page }) => {
  await newFlowWithStep(page);
  const panel = page.getByRole('complementary', { name: 'Step settings' });
  const button = panel.getByRole('button', { name: 'About Step name' });
  await button.hover();
  const pop = page.getByText(/in messages/i).first();
  await expect(pop).toBeVisible();
  const b = (await pop.boundingBox())!;
  const k = (await button.boundingBox())!;
  // Straight down from the button onto the popover (through the 4 px gap, which the popover bridges), then inside it.
  await page.mouse.move(k.x + k.width / 2, b.y + 6, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.waitForTimeout(400);
  await expect(pop).toBeVisible();
  await page.mouse.move(5, 400);
  await expect(page.getByText(/in messages/i)).toHaveCount(0);
});

test('a date picker inside a dialog opens above the dialog layer and can be used', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions');
  await page.getByRole('button', { name: 'New version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /^New version from/ });
  await dialog.getByRole('button', { name: /^Valid from:/ }).click();
  const calendar = page.getByRole('dialog', { name: /Choose/ });
  await expect(calendar).toBeVisible();
  expect(await fullyVisible(calendar)).toBe(true);
  await page.keyboard.press('Enter');
  await expect(calendar).toHaveCount(0);
});

test('the items of the More menu are on one line and start at the left padding, with no empty check column', async ({ page }) => {
  await page.goto('/admin');
  await page.getByRole('table', { name: 'Users' }).locator('tbody tr').first().getByRole('button', { name: /^More/ }).click();
  const menu = page.getByRole('listbox');
  await expect(menu).toBeVisible();
  const menuBox = (await menu.boundingBox())!;
  for (const name of ['Reset password', 'Lock account']) {
    const item = page.getByRole('option', { name });
    const box = (await item.boundingBox())!;
    expect(Math.round(box.height), `${name} is one line`).toBe(32);
    const fit = await item.evaluate((el) => ({ over: el.scrollWidth - el.clientWidth, lines: Math.round(el.getBoundingClientRect().height) }));
    expect(fit.over, `${name} is not cut off`).toBeLessThanOrEqual(0);
    // The text starts at the 12 px padding of the item: no icon or empty column before it.
    const textLeft = await item.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect().left - el.getBoundingClientRect().left;
    });
    expect(Math.round(textLeft), `${name} text offset`).toBeLessThanOrEqual(13);
    expect(box.x + box.width).toBeLessThanOrEqual(menuBox.x + menuBox.width);
  }
});
