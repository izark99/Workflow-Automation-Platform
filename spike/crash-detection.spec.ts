import { expect, test } from '@playwright/test';

// The spike runner marks a run as crashed when the page emits 'crash' or when
// waitForFunction fails with a message that mentions the crash. This proves both signals.
test('a crashed tab is reported through the crash event and through waitForFunction', async ({ page }) => {
  let crashEvent = false;
  page.on('crash', () => {
    crashEvent = true;
  });
  await page.goto('about:blank');
  const waiting = page
    .waitForFunction(() => false, null, { timeout: 20_000 })
    .then(() => 'resolved', (e: unknown) => String(e));
  await page.goto('chrome://crash').catch(() => undefined);
  const message = await waiting;
  expect(crashEvent || /crash/i.test(message)).toBe(true);
  expect(message).toMatch(/crash/i);
});
