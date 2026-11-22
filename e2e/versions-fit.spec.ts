import { expect, test } from '@playwright/test';

// T7.19a: the Actions column of the Versions table is not cut off, and the rows keep their 45 px.
async function measure(page: import('@playwright/test').Page, locale: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript((l) => localStorage.setItem('dfw.locale', l), locale);
  await page.goto('/flows/flow-timesheet/versions');
  const table = page.getByRole('table').first();
  await expect(table.locator('tbody tr').first()).toBeVisible();
  return table.evaluate((el) => {
    const wrap = el.parentElement!;
    const lastCell = el.querySelector('tbody tr td:last-child')!.getBoundingClientRect();
    return {
      overflow: wrap.scrollWidth - wrap.clientWidth,
      lastCellRight: Math.round(lastCell.right),
      wrapRight: Math.round(wrap.getBoundingClientRect().right),
      rows: Array.from(el.querySelectorAll('tbody tr')).map((r) => Math.round(r.getBoundingClientRect().height)),
    };
  });
}

for (const width of [1280, 1440]) {
  test(`in English at ${width} px nothing of the table is cut off and the rows are 45 px`, async ({ page }) => {
    const m = await measure(page, 'en', width);
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.lastCellRight).toBeLessThanOrEqual(m.wrapRight);
    expect(m.rows.every((h) => h === 45)).toBe(true);
  });
}

test('in Vietnamese at 1440 px nothing of the table is cut off', async ({ page }) => {
  const m = await measure(page, 'vi', 1440);
  expect(m.overflow).toBeLessThanOrEqual(0);
  expect(m.lastCellRight).toBeLessThanOrEqual(m.wrapRight);
});

test('the note is shortened with an ellipsis and keeps its full text in a title', async ({ page }) => {
  await measure(page, 'en', 1280);
  const note = page.getByRole('table').first().locator('tbody tr').first().locator('td').nth(4);
  expect(await note.evaluate((el) => getComputedStyle(el).textOverflow)).toBe('ellipsis');
  expect(await note.locator('span').first().getAttribute('title')).toMatch(/\S/);
});
