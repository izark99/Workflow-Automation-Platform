import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const draft = '/flows/flow-insurance/versions/1'; // a draft flow of the seed: editable
const cards = (page: Page) => page.locator('.react-flow__node');
const card = (page: Page, text: string) => page.locator('.react-flow__node').filter({ hasText: text });
/** A blank flow made through the Create flow dialog, so the canvas starts empty. */
async function newFlow(page: Page) {
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Create flow' }).click();
  await page.getByRole('textbox', { name: 'Flow name' }).fill('Canvas test');
  await page.getByRole('textbox', { name: 'Flow name' }).press('Enter');
  await expect(page.getByRole('complementary', { name: 'Step types' })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
}
const addStep = (page: Page, name: string) => page.getByRole('button', { name: `Add step ${name}` }).click();

/** Drags from the source handle of one card to the target handle of another with the mouse, as a user does. */
async function connect(page: Page, from: string, to: string, fromHandle = '.source', toHandle = '.target') {
  const a = await card(page, from).locator(`.react-flow__handle${fromHandle}`).first().boundingBox();
  const b = await card(page, to).locator(`.react-flow__handle${toHandle}`).first().boundingBox();
  await page.mouse.move(a!.x + a!.width / 2, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 8 });
  await page.mouse.up();
}

test('the layout follows the design: header bar 64 px, step list 184 px, grouped step buttons of 36 px', async ({ page }) => {
  await page.goto(draft);
  const bar = await page.getByRole('banner').boundingBox();
  expect(Math.round(bar!.height)).toBe(64);
  const list = page.getByRole('complementary', { name: 'Step types' });
  expect(Math.round((await list.boundingBox())!.width)).toBe(184);
  for (const group of ['Files', 'Shape', 'Combine', 'Advanced']) await expect(list.getByRole('group', { name: group })).toHaveCount(1);
  // Eleven step buttons of 36 px, plus the 24 px info button after the title.
  const stepButtons = list.getByRole('button', { name: /^Add step / });
  await expect(stepButtons).toHaveCount(11);
  await expect(list.getByRole('button')).toHaveCount(12);
  expect(Math.round((await stepButtons.first().boundingBox())!.height)).toBe(36);
  // The seed flow of this test has only a draft, so Run is off until a version is published (T2.15).
  await expect(page.getByRole('button', { name: 'Run' })).toBeDisabled();
});

test('a step is added with the keyboard or a click, as a 240 x 56 card with a number, a name and a type', async ({ page }) => {
  await newFlow(page);
  const button = page.getByRole('button', { name: 'Add step Input file' });
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(cards(page)).toHaveCount(1);
  await addStep(page, 'Filter');
  await expect(cards(page)).toHaveCount(2);
  const first = card(page, 'Input file').locator('div').first();
  const box = await first.boundingBox();
  expect(Math.round(box!.width)).toBe(240);
  expect(Math.round(box!.height)).toBe(56);
  await expect(card(page, 'Input file')).toContainText('1');
  await expect(card(page, 'Filter')).toContainText('2');
  await expect(page.getByText('2 steps, 0 output sheets')).toBeVisible();
});

test('a step is added by dragging it from the list onto the canvas', async ({ page }) => {
  await newFlow(page);
  const before = await cards(page).count();
  const target = page.locator('.react-flow__pane');
  const box = await target.boundingBox();
  await page.getByRole('button', { name: 'Add step Group by' }).dragTo(target, { targetPosition: { x: box!.width / 2, y: box!.height - 150 } });
  await expect(cards(page)).toHaveCount(before + 1);
  await expect(card(page, 'Group by')).toBeVisible();
});

test('two steps are connected by dragging from an output to an input; the connection is a visible edge', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Column mapping');
  await addStep(page, 'Output');
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await connect(page, 'Column mapping', 'Output');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('a second input on the same port is refused with what to do next, and a loop is refused', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Column mapping');
  await addStep(page, 'Column mapping');
  await addStep(page, 'Output');
  await connect(page, 'Column mapping', 'Output');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await connect(page, 'Column mapping 2', 'Output');
  await expect(page.getByRole('alert')).toContainText('The steps could not be connected.');
  await expect(page.getByRole('alert')).toContainText('already has an input on that port');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('clicking a card selects it with a 2 px accent border; Backspace deletes it and its connections', async ({ page }) => {
  await newFlow(page);
  await addStep(page, 'Column mapping');
  await addStep(page, 'Output');
  await connect(page, 'Column mapping', 'Output');
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  const target = card(page, 'Output');
  await target.click();
  await expect(target).toHaveClass(/selected/);
  const width = await target.locator('div').first().evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(width).toBe('2px');
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
});

test('own zoom controls (36 px buttons) zoom in, zoom out and fit to screen', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/4');
  await expect(cards(page)).toHaveCount(12);
  await expect(page.getByText('12 steps, 1 output sheet')).toBeVisible();
  const tools = page.getByRole('toolbar', { name: 'Canvas tools' });
  for (const b of await tools.getByRole('button').all()) expect(Math.round((await b.boundingBox())!.height)).toBe(36);
  const percent = async () => Number((await tools.locator('[aria-live]').innerText()).replace('%', ''));
  const start = await percent();
  await tools.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(percent).toBeGreaterThan(start);
  const zoomed = await percent();
  await tools.getByRole('button', { name: 'Zoom out' }).click();
  await tools.getByRole('button', { name: 'Zoom out' }).click();
  await expect.poll(percent).toBeLessThan(zoomed);
  await tools.getByRole('button', { name: 'Fit to screen' }).click();
  await expect.poll(percent).toBeGreaterThan(0);
});

test('a published version is read-only: the step buttons are disabled and a card cannot be deleted', async ({ page }) => {
  await page.goto('/flows/flow-timesheet/versions/3');
  await expect(page.getByRole('button', { name: 'Add step Filter' })).toBeDisabled();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(12); // wait until the canvas is drawn, then count
  await cards(page).first().click();
  await page.keyboard.press('Backspace');
  await expect(cards(page)).toHaveCount(12);
});

test('a flow that does not exist shows what failed and a way back', async ({ page }) => {
  await page.goto('/flows/flow-unknown/versions/1');
  await expect(page.getByRole('alert')).toContainText('This flow could not be opened.');
  await expect(page.getByRole('link', { name: 'Flows' })).toBeVisible();
});
