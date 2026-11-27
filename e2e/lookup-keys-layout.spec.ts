import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The key pair of a Lookup step: the two columns, the same width and the same place, whether their columns are loaded (a dropdown)
// or not (a text field). Before, a text field and a dropdown of another width sat side by side and the row changed with every load.
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();

test('the two key columns keep their size and place when the columns of the data are loaded', async ({ page }) => {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Key layout');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Lookup / Join');
  await panel(page).getByRole('button', { name: /^Input from, left input/ }).press('ArrowDown');
  await page.getByRole('option', { name: /1\. Input file/ }).click();
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').setInputFiles({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('kind,name\nWEEK,Ann\n') });
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await panel(page).getByRole('button', { name: /^Look up in/ }).click();
  await page.getByRole('option', { name: 'Reference table: OT limits', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Add key pair' }).click();

  const boxes = async () => {
    const cells = await panel(page).locator('[class*="_cell_"]').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { x: Math.round(r.x), bottom: Math.round(r.bottom), w: Math.round(r.width) };
    }));
    return cells;
  };
  const before = await boxes(); // left: a text field (nothing loaded), right: a dropdown (the table's columns)
  expect(before).toHaveLength(2);
  expect(Math.abs(before[0]!.w - before[1]!.w)).toBeLessThanOrEqual(1);
  expect(before[0]!.bottom).toBe(before[1]!.bottom); // the boxes of the two columns line up (a long label may take two lines)

  await panel(page).getByRole('button', { name: 'Load columns of your data' }).click();
  await expect(panel(page).getByRole('button', { name: /^Column in your data:/ })).toBeVisible();
  const after = await boxes(); // both are dropdowns now
  expect(after).toEqual(before);
});
