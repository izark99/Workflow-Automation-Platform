import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

// SPEC 11.1: a password change that an admin asks for, a locked account, and the sidebar action. The stand-in sign-in
// (D67) serves the sign-in; the real Auth is tested by `npm run test:store`.
const USERS = [{ email: 'harold@example.com', password: 'correct horse battery' }];

async function start(page: Page, change?: (user: { id: string; locked?: boolean; mustChangePassword?: boolean }) => void, pollMs?: number) {
  const snapshot = seedSnapshot();
  if (change) change(snapshot.users.find((u) => u.id === 'user-harold')!);
  await page.addInitScript(([auth, seed, poll]) => {
    localStorage.setItem('dfw.auth', auth!);
    localStorage.setItem('dfw.seed', seed!);
    if (poll) localStorage.setItem('dfw.statusPollMs', poll);
  }, [JSON.stringify(USERS), JSON.stringify(snapshot), pollMs ? String(pollMs) : ''] as const);
  await page.goto('/flows');
}
const signIn = async (page: Page, password = USERS[0]!.password) => {
  await page.getByLabel('Email').fill(USERS[0]!.email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
};

test('an account that must change its password sees only the change-password screen until it chooses one', async ({ page }) => {
  await start(page, (u) => (u.mustChangePassword = true));
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Choose a new password', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('alert')).toContainText('at least 10 characters');
  await page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('another-long-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('alert')).toContainText('not the same');
  await page.getByLabel('Confirm new password', { exact: true }).fill('a-long-new-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible(); // the flag is cleared
});

test('the new password is the one that signs in afterwards', async ({ page }) => {
  await start(page, (u) => (u.mustChangePassword = true));
  await signIn(page);
  await page.getByLabel('New password', { exact: true }).fill('a-long-new-password');
  await page.getByLabel('Confirm new password', { exact: true }).fill('a-long-new-password');
  await page.getByRole('button', { name: 'Save password' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page); // the old password
  await expect(page.getByRole('alert')).toContainText('The email or the password is wrong');
  await signIn(page, 'a-long-new-password');
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
});

test('a locked account sees the locked message and can only sign out', async ({ page }) => {
  await start(page, (u) => (u.locked = true));
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your account is locked', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('An admin locked this account');
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
});

test('a session that an admin locks while it is open ends with the locked message', async ({ page }) => {
  await start(page, undefined, 400);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { dfwStore: { changeAccounts: (f: (s: { users: { id: string; locked?: boolean }[] }) => void) => Promise<void> } }).dfwStore.changeAccounts((s) => {
      s.users.find((u) => u.id === 'user-harold')!.locked = true;
    }),
  );
  await expect(page.getByRole('heading', { name: 'Your account is locked', level: 1 })).toBeVisible({ timeout: 10_000 });
});

test('Change password in the sidebar: the checks, the toast, and the new password at the next sign-in', async ({ page }) => {
  await start(page);
  await signIn(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Change password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change password' });
  await dialog.getByLabel('New password', { exact: true }).fill('a-long-new-password');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('different-password-1');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByRole('alert')).toContainText('not the same');
  await dialog.getByLabel('New password', { exact: true }).fill('correct horse battery');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('correct horse battery');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(dialog.getByRole('alert')).toContainText('same as the old one');
  await dialog.getByLabel('New password', { exact: true }).fill('a-long-new-password');
  await dialog.getByLabel('Confirm new password', { exact: true }).fill('a-long-new-password');
  await dialog.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Password changed.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'a-long-new-password');
  await expect(page.getByRole('heading', { name: 'Flows', level: 1 })).toBeVisible();
});
