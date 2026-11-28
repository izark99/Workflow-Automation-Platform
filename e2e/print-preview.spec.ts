import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T9.7: the print preview on the Test tab of an Output step (SPEC 16.1 item 8, DESIGN "Print layout").
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const csv = (rows: number) => ({ name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from(`name,hours\n${Array.from({ length: rows }, (_, i) => `Person ${i + 1},${(i % 8) + 1}`).join('\n')}\n`) });
const preview = (page: Page) => panel(page).getByRole('region', { name: 'Print preview' });

async function setup(page: Page, rows: number, withLayout = true) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Print preview flow');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await page.getByRole('button', { name: 'Add step Input file' }).click();
  await page.getByRole('button', { name: 'Add step Output' }).click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  if (withLayout) {
    await panel(page).getByRole('switch', { name: 'Print layout' }).click();
    await panel(page).getByRole('group', { name: 'Print layout' }).getByRole('button', { name: 'Add line' }).click();
    await panel(page).getByRole('textbox', { name: 'Header line 1' }).fill('HOURS {param:none}'.replace(' {param:none}', ' of {flow}'));
    await panel(page).getByRole('group', { name: 'Print layout' }).getByRole('button', { name: 'Add signer' }).click();
    await panel(page).getByRole('textbox', { name: 'Signer title 1' }).fill('Prepared by');
  }
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).locator('input[type=file]').first().setInputFiles(csv(rows));
}

test.describe('Print preview', () => {
  test('is not on the Test tab of an Output step without a layout, nor with the layout off', async ({ page }) => {
    await setup(page, 5, false);
    await expect(preview(page)).toHaveCount(0);
  });

  test('before the rows are loaded it says to preview them', async ({ page }) => {
    await setup(page, 5);
    await expect(preview(page)).toContainText('Preview the rows to see how the first and the last page will look');
    await expect(preview(page).getByRole('img')).toHaveCount(0);
  });

  test('a short table is one page: the header line with its tokens, the table, the signer, "Page 1/1" and the approximate note', async ({ page }) => {
    await setup(page, 5);
    await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
    const box = preview(page).getByRole('img');
    await expect(box).toHaveCount(1, { timeout: 30_000 });
    await expect(box).toContainText('HOURS of Print preview flow');
    await expect(box).toContainText('Person 5');
    await expect(box).toContainText('Prepared by');
    await expect(box).toContainText('Page 1/1');
    await expect(preview(page)).toContainText('Approximate');
  });

  test('a long table shows the first page and the last page side by side, with the page numbers of the estimate', async ({ page }) => {
    await setup(page, 300);
    await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
    const boxes = preview(page).getByRole('img');
    await expect(boxes).toHaveCount(2, { timeout: 60_000 });
    await expect(boxes.nth(0)).toContainText('HOURS of Print preview flow');
    await expect(boxes.nth(0)).toContainText('Person 1');
    await expect(boxes.nth(0)).not.toContainText('Prepared by');
    await expect(boxes.nth(1)).toContainText('Person 300');
    await expect(boxes.nth(1)).toContainText('Prepared by');
    const label = await boxes.nth(1).getAttribute('aria-label');
    const total = Number(/of (\d+)/.exec(label ?? '')?.[1]);
    expect(total).toBeGreaterThan(1);
    await expect(boxes.nth(1)).toContainText(`Page ${total}/${total}`);
    await expect(preview(page)).toContainText('Excel decides the page breaks in the middle');
    // The two boxes have the paper's ratio (A4 portrait: about 0.7) and sit on one row.
    const a = await boxes.nth(0).boundingBox();
    const b = await boxes.nth(1).boundingBox();
    expect(a!.width / a!.height).toBeCloseTo(0.7, 0);
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  });

  test('a landscape layout draws wider pages', async ({ page }) => {
    await setup(page, 5);
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await panel(page).getByRole('button', { name: /^Orientation/ }).click();
    await page.getByRole('option', { name: 'Landscape', exact: true }).click();
    await panel(page).getByRole('tab', { name: 'Test' }).click();
    await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
    const box = preview(page).getByRole('img');
    await expect(box).toHaveCount(1, { timeout: 30_000 });
    const r = await box.boundingBox();
    expect(r!.width / r!.height).toBeGreaterThan(1);
  });

  test('"Open the print preview large" opens the wide dialog with the same pages, and Escape closes it and returns the focus', async ({ page }) => {
    await setup(page, 300);
    await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
    await expect(preview(page).getByRole('img')).toHaveCount(2, { timeout: 60_000 });
    const open = preview(page).getByRole('button', { name: 'Open the print preview large' });
    await open.click();
    const dialog = page.getByRole('dialog', { name: /Print preview of/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img')).toHaveCount(2);
    const small = await preview(page).getByRole('img').first().boundingBox();
    const large = await dialog.getByRole('img').first().boundingBox();
    expect(large!.width).toBeGreaterThan(small!.width * 1.5);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test('page numbers off: the pages have no footer', async ({ page }) => {
    await setup(page, 5);
    await panel(page).getByRole('tab', { name: 'Configure' }).click();
    await panel(page).getByRole('switch', { name: 'Page numbers' }).click();
    await panel(page).getByRole('tab', { name: 'Test' }).click();
    await panel(page).getByRole('button', { name: 'Preview first rows' }).click();
    const box = preview(page).getByRole('img');
    await expect(box).toHaveCount(1, { timeout: 30_000 });
    await expect(box).not.toContainText('Page 1/1');
  });
});
