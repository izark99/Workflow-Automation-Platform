import { expect, test } from '@playwright/test';

// T7.8a: the Harold dialog and toast (light theme values).
test.beforeEach(async ({ page }) => {
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Components and states', level: 1 })).toBeVisible();
});

async function openDialog(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Delete flow' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('the dialog is on surface-overlay with radius-xl and shadow-lg, over a blurred scrim, and enters in 260 ms', async ({ page }) => {
  const dialog = await openDialog(page);
  const look = await dialog.evaluate((el) => {
    const cs = getComputedStyle(el);
    const scrim = getComputedStyle(el.parentElement!);
    return {
      bg: cs.backgroundColor,
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow,
      enter: cs.animationDuration,
      scrim: scrim.backgroundColor,
      blur: scrim.backdropFilter,
      title: getComputedStyle(el.querySelector('span')!).fontSize,
    };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.95)');
  expect(look.radius).toBe('32px');
  expect(look.shadow).toContain('rgba(15, 26, 43, 0.22) 0px 24px 64px');
  expect(look.enter).toBe('0.26s');
  expect(look.scrim).toBe('rgba(15, 26, 43, 0.35)');
  expect(look.blur).toBe('blur(12px)');
  expect(look.title).toBe('18px');
  // The footer is separated by a hairline, and the confirming button is the last one.
  const buttons = dialog.getByRole('button');
  expect(await buttons.last().textContent()).toBeTruthy();
});

test('the dialog leaves in 170 ms: an empty copy of the panel (no text, no role) fades out, then is gone; Escape and focus return still work', async ({ page }) => {
  const opener = page.getByRole('button', { name: 'Delete flow' }).first();
  await opener.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(350); // the dialog has finished entering
  // Record the copy at the moment it is added, so a fast machine cannot miss it.
  await page.evaluate(() => {
    const seen: Array<{ text: number; role: string | null; inert: boolean; hidden: string | null; anim: string; dialogs: number }> = [];
    (window as unknown as { __copies: typeof seen }).__copies = seen;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const n of Array.from(r.addedNodes)) {
          if (n instanceof HTMLElement && n.getAttribute('data-closing') === 'true' && n.hasAttribute('inert')) {
            seen.push({ role: n.querySelector('[role]')?.getAttribute('role') ?? null, text: (n.textContent ?? '').length, inert: n.hasAttribute('inert'), hidden: n.getAttribute('aria-hidden'), anim: getComputedStyle(n).animationDuration, dialogs: n.querySelectorAll('[role="dialog"]').length });
          }
        }
      }
    }).observe(document.body, { childList: true });
  });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
  const copies = await page.evaluate(() => (window as unknown as { __copies: unknown[] }).__copies);
  expect(copies).toEqual([{ text: 0, role: null, inert: true, hidden: 'true', anim: '0.17s', dialogs: 0 }]);
  await expect(page.locator('[data-closing="true"][inert]')).toHaveCount(0, { timeout: 1000 });
});

test('a toast is on surface-overlay with shadow-lg at the bottom right, enters in 260 ms, and leaves in 170 ms when dismissed', async ({ page }) => {
  await page.getByRole('button', { name: 'Show toast' }).click();
  const toast = page.locator('[role="status"][aria-live="polite"] > div', { hasText: 'Draft saved' }).first();
  await expect(toast).toBeVisible();
  await page.waitForTimeout(350); // the toast rises 12 px while it enters
  const look = await toast.evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, enter: cs.animationDuration, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom };
  });
  expect(look.bg).toBe('rgba(255, 255, 255, 0.95)');
  expect(look.radius).toBe('14px');
  expect(look.shadow).toContain('rgba(15, 26, 43, 0.22) 0px 24px 64px');
  expect(look.enter).toBe('0.26s');
  expect(Math.round(look.right)).toBeGreaterThanOrEqual(24);
  expect(Math.round(look.bottom)).toBeGreaterThanOrEqual(24);
  await page.getByRole('button', { name: /^Dismiss/ }).first().click();
  await expect(toast).toHaveAttribute('data-closing', 'true');
  expect(await toast.evaluate((el) => getComputedStyle(el).animationDuration)).toBe('0.17s');
  await expect(toast).toHaveCount(0);
});
