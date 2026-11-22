import { expect, test } from '@playwright/test';

// T7.2: the Harold fonts come from the app, and Vietnamese text with stacked marks is not clipped.
test('Be Vietnam Pro and JetBrains Mono load from the app and no request goes to a font host', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  const ok = await page.evaluate(async () => {
    await document.fonts.load('400 16px "Be Vietnam Pro"', 'Ể');
    await document.fonts.load('500 13px "JetBrains Mono"', 'a');
    return {
      sans: document.fonts.check('400 16px "Be Vietnam Pro"', 'Ể'),
      mono: document.fonts.check('500 13px "JetBrains Mono"', 'a'),
    };
  });
  expect(ok).toEqual({ sans: true, mono: true });
  const origin = new URL(page.url()).origin;
  const foreign = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(foreign).toEqual([]);
  expect(requests.some((u) => /\.woff2?$/.test(u))).toBe(true);
});

test('a Vietnamese line with stacked marks is not clipped in a single-line element', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  const clipped = await page.evaluate(async () => {
    await document.fonts.load('400 16px "Be Vietnam Pro"', 'Ể');
    const results: Array<{ size: string; scrollHeight: number; clientHeight: number }> = [];
    for (const [size, line] of [['16px', '24px'], ['14px', '20px'], ['28px', '38px']] as const) {
      const el = document.createElement('div');
      el.textContent = 'Ể Ỗ ẫ Ắ Ặ Ừ Ở Ữ — Nhân viên có ngày vào làm';
      el.style.cssText = `position:absolute;left:0;top:0;white-space:nowrap;overflow:hidden;font-family:var(--family-sans);font-size:${size};line-height:${line};`;
      document.body.append(el);
      results.push({ size, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      el.remove();
    }
    return results.filter((r) => r.scrollHeight > r.clientHeight);
  });
  expect(clipped).toEqual([]);
});
