import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// T9.6: the group "Print layout" of the Output form (SPEC 16.1, DESIGN "Print layout").
const panel = (page: Page) => page.getByRole('complementary', { name: 'Step settings' });
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();
const printGroup = (page: Page) => panel(page).getByRole('group', { name: 'Print layout' });
const printSwitch = (page: Page) => panel(page).getByRole('switch', { name: 'Print layout' });

async function outputStep(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Print test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await addStep(page, 'Input file');
  await addStep(page, 'Output');
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'File name' })).toBeVisible();
}
const reopen = async (page: Page) => {
  await panel(page).getByRole('tab', { name: 'Test' }).click();
  await panel(page).getByRole('tab', { name: 'Configure' }).click();
};
const choose = async (page: Page, button: RegExp | string, option: string) => {
  await panel(page).getByRole('button', { name: button }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};

test.describe('Print layout group', () => {
  test('is off by default: only the switch shows; turning it on shows the page, the header lines and the signatures with the defaults', async ({ page }) => {
    await outputStep(page);
    await expect(printSwitch(page)).toHaveAttribute('aria-checked', 'false');
    await expect(panel(page).getByRole('button', { name: /^Paper/ })).toHaveCount(0);
    await printSwitch(page).click();
    await expect(printSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await expect(panel(page).getByRole('button', { name: /^Paper/ })).toContainText('A4');
    await expect(panel(page).getByRole('button', { name: /^Orientation/ })).toContainText('Portrait');
    await expect(panel(page).getByRole('button', { name: /^Margins/ })).toContainText('Normal');
    for (const name of ['Fit all columns on one page wide', 'Repeat the header row', 'Page numbers']) await expect(panel(page).getByRole('switch', { name })).toHaveAttribute('aria-checked', 'true');
    await expect(panel(page).getByRole('textbox', { name: /^Header line/ })).toHaveCount(0);
    await expect(panel(page).getByRole('textbox', { name: /^Signer title/ })).toHaveCount(0);
    await expect(printGroup(page).getByRole('button', { name: 'Add line' })).toBeVisible();
    await expect(printGroup(page).getByRole('button', { name: 'Add signer' })).toBeVisible();
  });

  test('the page controls change and are kept when the step is closed and opened again', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await choose(page, /^Paper/, 'A3');
    await choose(page, /^Orientation/, 'Landscape');
    await choose(page, /^Margins/, 'Narrow');
    await panel(page).getByRole('switch', { name: 'Repeat the header row' }).click();
    await reopen(page);
    await expect(panel(page).getByRole('button', { name: /^Paper/ })).toContainText('A3');
    await expect(panel(page).getByRole('button', { name: /^Orientation/ })).toContainText('Landscape');
    await expect(panel(page).getByRole('button', { name: /^Margins/ })).toContainText('Narrow');
    await expect(panel(page).getByRole('switch', { name: 'Repeat the header row' })).toHaveAttribute('aria-checked', 'false');
  });

  test('turning the switch off and on again keeps the settings', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await choose(page, /^Paper/, 'Letter');
    await printSwitch(page).click();
    await expect(panel(page).getByRole('button', { name: /^Paper/ })).toHaveCount(0);
    await reopen(page);
    await printSwitch(page).click();
    await expect(panel(page).getByRole('button', { name: /^Paper/ })).toContainText('Letter');
  });

  test('the first header line is centred, bold and large; a second is plain; the alignment toggles; a line is removed', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    await expect(panel(page).getByRole('button', { name: 'Align line 1 centre' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByRole('switch', { name: 'Bold line 1' })).toHaveAttribute('aria-checked', 'true');
    await expect(panel(page).getByRole('button', { name: /^Size of line 1/ })).toContainText('Large');
    await panel(page).getByRole('textbox', { name: 'Header line 1' }).fill('MONTHLY REPORT {month_year}');
    await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    await expect(panel(page).getByRole('button', { name: 'Align line 2 left' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByRole('switch', { name: 'Bold line 2' })).toHaveAttribute('aria-checked', 'false');
    await panel(page).getByRole('button', { name: 'Align line 2 right' }).click();
    await expect(panel(page).getByRole('button', { name: 'Align line 2 right' })).toHaveAttribute('aria-pressed', 'true');
    await expect(panel(page).getByRole('button', { name: 'Align line 2 left' })).toHaveAttribute('aria-pressed', 'false');
    await reopen(page);
    await expect(panel(page).getByRole('textbox', { name: 'Header line 1' })).toHaveValue('MONTHLY REPORT {month_year}');
    await expect(panel(page).getByRole('button', { name: 'Align line 2 right' })).toHaveAttribute('aria-pressed', 'true');
    await panel(page).getByRole('button', { name: 'Remove header line 1' }).click();
    await expect(panel(page).getByRole('textbox', { name: /^Header line/ })).toHaveCount(1);
  });

  test('at most 6 header lines and 5 signers: the add button is disabled and says why', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    for (let i = 0; i < 6; i++) await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    await expect(printGroup(page).getByRole('button', { name: 'Add line' })).toBeDisabled();
    await expect(printGroup(page)).toContainText('at most 6 header lines');
    for (let i = 0; i < 5; i++) await printGroup(page).getByRole('button', { name: 'Add signer' }).click();
    await expect(printGroup(page).getByRole('button', { name: 'Add signer' })).toBeDisabled();
    await expect(printGroup(page)).toContainText('at most 5 signers');
  });

  test('a signer starts with the line "(Ký, ghi rõ họ tên)"; the date line, titles and names are kept', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await printGroup(page).getByRole('button', { name: 'Add signer' }).click();
    await expect(panel(page).getByRole('textbox', { name: 'Line under the title 1' })).toHaveValue('(Ký, ghi rõ họ tên)');
    await panel(page).getByRole('textbox', { name: 'Signer title 1' }).fill('Người lập biểu');
    await panel(page).getByRole('textbox', { name: 'Signer name (optional) 1' }).fill('Nguyễn Văn An');
    await panel(page).getByRole('textbox', { name: 'Date line' }).fill('Hà Nội, ngày {day} tháng {month} năm {year}');
    await reopen(page);
    await expect(panel(page).getByRole('textbox', { name: 'Signer title 1' })).toHaveValue('Người lập biểu');
    await expect(panel(page).getByRole('textbox', { name: 'Signer name (optional) 1' })).toHaveValue('Nguyễn Văn An');
    await expect(panel(page).getByRole('textbox', { name: 'Date line' })).toHaveValue('Hà Nội, ngày {day} tháng {month} năm {year}');
  });

  test('errors sit under the field: a token that does not exist, a parameter the flow lacks, a text over 200 characters, a date line without a signer', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    const line = panel(page).getByRole('textbox', { name: 'Header line 1' });
    await line.fill('Report {nope}');
    await expect(panel(page).getByRole('alert').filter({ hasText: '{nope} is not a token' })).toBeVisible();
    await line.fill('Report {param:period}');
    await expect(panel(page).getByRole('alert').filter({ hasText: 'names the parameter "period"' })).toBeVisible();
    await line.fill('x'.repeat(201));
    await expect(panel(page).getByRole('alert').filter({ hasText: '201 characters' })).toBeVisible();
    await line.fill('Fine {flow}');
    await expect(panel(page).getByRole('alert').filter({ hasText: /token|parameter|characters/ })).toHaveCount(0);
    await panel(page).getByRole('textbox', { name: 'Date line' }).fill('Ngày {day}');
    await expect(panel(page).getByRole('alert').filter({ hasText: 'needs a signer' })).toBeVisible();
    await printGroup(page).getByRole('button', { name: 'Add signer' }).click();
    await expect(panel(page).getByRole('alert').filter({ hasText: 'needs a signer' })).toHaveCount(0);
  });

  test('a text with an error is not saved: the last good text stays after the step is opened again', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).click();
    await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    const line = panel(page).getByRole('textbox', { name: 'Header line 1' });
    await line.fill('Good');
    await line.fill('Bad {nope}');
    await reopen(page);
    await expect(panel(page).getByRole('textbox', { name: 'Header line 1' })).toHaveValue('Good');
  });

  test('a csv file has no print layout group', async ({ page }) => {
    await outputStep(page);
    await expect(printGroup(page)).toBeVisible();
    await panel(page).getByRole('button', { name: /^File type/ }).click();
    await page.getByRole('option', { name: /csv/ }).click();
    await expect(printGroup(page)).toHaveCount(0);
  });

  test('every control can be reached with the keyboard and the group does not scroll sideways', async ({ page }) => {
    await outputStep(page);
    await printSwitch(page).focus();
    await page.keyboard.press('Space');
    await expect(printSwitch(page)).toHaveAttribute('aria-checked', 'true');
    await printGroup(page).getByRole('button', { name: 'Add line' }).click();
    await printGroup(page).getByRole('button', { name: 'Add signer' }).click();
    // The panel clips sideways, so a control that is too wide is cut off: every element of the group ends inside the group.
    const outside = await printGroup(page).evaluate((el) => {
      const right = el.getBoundingClientRect().right;
      return [...el.querySelectorAll<HTMLElement>('*')].filter((n) => n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().right > right + 1).map((n) => `${n.tagName} ${n.getAttribute('aria-label') ?? n.textContent?.slice(0, 20)} +${Math.round(n.getBoundingClientRect().right - right)} w${Math.round(n.getBoundingClientRect().width)}`);
    });
    expect(outside).toEqual([]);
      });
});
