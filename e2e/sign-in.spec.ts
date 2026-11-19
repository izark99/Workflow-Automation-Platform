import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The e2e build has no server. A stand-in sign-in service (MemoryAuth, D67) is switched on by the dev key `dfw.auth`;
// the real service is tested against the local Auth container by `npm run test:store`.
const USERS = [{ email: 'harold@example.com', password: 'correct horse battery' }];
const withSignIn = (page: Page) => page.addInitScript((json) => localStorage.setItem('dfw.auth', json), JSON.stringify(USERS));
const alertText = (page: Page) => page.getByRole('alert');
const fill = async (page: Page, email: string, password: string) => {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
};
const signIn = async (page: Page) => {
  await fill(page, USERS[0]!.email, USERS[0]!.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
};

test('without the stand-in key there is no sign-in: the local store opens the app at once', async ({ page }) => {
  await page.goto('/flows');
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});

test('a person who is not signed in sees only the sign-in screen, and no data is shown behind it', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeFocused();
  await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Admin' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin$/);
});

test('a form that is not complete says what is missing and what to do', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/flows');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alertText(page)).toContainText('You could not be signed in.');
  await expect(alertText(page)).toContainText('Enter your email address, then sign in.');

  await fill(page, 'harold', 'x');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alertText(page)).toContainText('"harold" is not an email address. Type it like name@company.com.');

  await fill(page, 'harold@example.com', '');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alertText(page)).toContainText('Enter your password, then sign in.');
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('a wrong password and an unknown email give the same message, and the person stays on the screen', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/flows');
  await fill(page, 'harold@example.com', 'not the password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const message = 'The email or the password is wrong. Check both and try again.';
  await expect(alertText(page)).toContainText(message);
  await fill(page, 'nobody@example.com', USERS[0]!.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(alertText(page)).toContainText(message);
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toHaveCount(0);
});

test('Enter in the password field signs in; the app opens on the page asked for, with a Sign out button', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/reference-tables');
  await fill(page, ' HAROLD@example.com ', USERS[0]!.password);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('heading', { name: 'Reference tables', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0);
});

test('a reload keeps the session; Sign out returns to the sign-in screen without a notice, and a reload stays signed out', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/flows');
  await signIn(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(page.getByText('Your session ended.')).toHaveCount(0);
  await expect(page.getByLabel('Password')).toHaveValue('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('a session that ends by itself says so on the sign-in screen, and the next sign-in works', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/flows');
  await signIn(page);
  await page.evaluate(() => (window as unknown as { dfwAuth: { expire: () => void } }).dfwAuth.expire());
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  await expect(alertText(page)).toContainText('Your session ended.');
  await expect(alertText(page)).toContainText('Sign in again to continue.');
  await expect(page.getByRole('navigation')).toHaveCount(0);

  await fill(page, USERS[0]!.email, USERS[0]!.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  await expect(page.getByText('Your session ended.')).toHaveCount(0);
});

test('the sign-in form is reachable with the keyboard: email, password, Sign in', async ({ page }) => {
  await withSignIn(page);
  await page.goto('/flows');
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
});
