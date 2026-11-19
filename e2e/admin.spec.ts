import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { seedSnapshot } from '../src/store/seed';

const URL = '/admin';
const table = (page: Page, name: string) => page.getByRole('table', { name });
const rows = (page: Page, name: string) => table(page, name).locator('tbody tr');
const toastWith = (page: Page, text: string) => page.getByRole('status').filter({ hasText: text });
const seed = async (page: Page, change: (s: ReturnType<typeof seedSnapshot>) => void) => {
  const s = seedSnapshot();
  change(s);
  await page.addInitScript((json) => localStorage.setItem('dfw.seed', json), JSON.stringify(s));
};

test('the screen has Users, Groups, Access to shared flows and Deleted flows, with the data of the seed', async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole('heading', { name: 'Admin', level: 1 })).toBeVisible();
  for (const h of ['Users', 'Groups', 'Access to shared flows', 'Deleted flows']) await expect(page.getByRole('heading', { name: h, level: 2 })).toBeVisible();
  await expect(rows(page, 'Users')).toHaveCount(4);
  await expect(rows(page, 'Users').nth(0)).toContainText('Harold');
  await expect(rows(page, 'Users').nth(0)).toContainText('harold@example.com');
  await expect(rows(page, 'Users').nth(0)).toContainText('All groups');
  await expect(rows(page, 'Users').nth(1)).toContainText('Lan');
  await expect(rows(page, 'Users').nth(1)).toContainText('HR Payroll');
  await expect(rows(page, 'Users').nth(3)).toContainText('HR Payroll, HR Analytics');
  await expect(page.getByText('4 users.')).toBeVisible();
  await expect(rows(page, 'Groups')).toHaveCount(2);
  await expect(rows(page, 'Groups').nth(0)).toContainText('HR Payroll');
  await expect(rows(page, 'Groups').nth(0).locator('td').nth(1)).toHaveText('3');
  await expect(rows(page, 'Access to shared flows')).toHaveCount(2);
  await expect(rows(page, 'Deleted flows')).toHaveCount(2);
  await expect(rows(page, 'Deleted flows').nth(0)).toContainText('Payroll export check');
  await expect(rows(page, 'Deleted flows').nth(0)).toContainText('05 Nov 2026');
  await expect(rows(page, 'Deleted flows').nth(0)).toContainText('05 Dec 2026');
  await expect(rows(page, 'Deleted flows').nth(1)).toContainText('27 Nov 2026');
});

test('Edit user changes the role and the groups; an admin shows "All groups"', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Edit Lan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Lan' });
  await dialog.getByRole('checkbox', { name: 'HR Analytics' }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page, 'Users').nth(1)).toContainText('HR Payroll, HR Analytics');
  await page.getByRole('button', { name: 'Edit Lan' }).click();
  await page.getByRole('dialog', { name: 'Edit Lan' }).getByRole('button', { name: /^Role: User/ }).click();
  await page.getByRole('option', { name: 'Admin' }).click();
  await page.getByRole('dialog', { name: 'Edit Lan' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page, 'Users').nth(1)).toContainText('Admin');
  await expect(rows(page, 'Users').nth(1)).toContainText('All groups');
});

test('Add user: the checks say what to do, Generate fills a 16 character password, and the new account shows in the list', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Add user' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add user' });
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The name is empty');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Mai');
  await dialog.getByRole('textbox', { name: 'Email' }).fill('mai');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('"mai" is not an email address');
  await dialog.getByRole('textbox', { name: 'Email' }).fill('mai@example.com');
  await dialog.getByRole('textbox', { name: 'Password' }).fill('short');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('at least 10 characters');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  const password = await dialog.getByRole('textbox', { name: 'Password' }).inputValue();
  expect(password).toMatch(/^[A-Za-z0-9]{16}$/);
  await dialog.getByRole('textbox', { name: 'Email' }).fill('LAN@example.com');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('An account with the email LAN@example.com exists');
  await dialog.getByRole('textbox', { name: 'Email' }).fill('mai@example.com');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(toastWith(page, 'Mai added.')).toBeVisible();
  await expect(rows(page, 'Users')).toHaveCount(5);
  const row = rows(page, 'Users').filter({ hasText: 'mai@example.com' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Must change password'); // on by default
});

test('Copy puts the password on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(URL);
  await page.getByRole('button', { name: 'Add user' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add user' });
  await expect(dialog.getByRole('button', { name: 'Copy' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Generate' }).click();
  const password = await dialog.getByRole('textbox', { name: 'Password' }).inputValue();
  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(toastWith(page, 'Password copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);
});

test('a user can be made without the password flag, and the checkbox is on by default', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Add user' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add user' });
  await expect(dialog.getByRole('checkbox', { name: 'Must change password at next sign-in' })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByRole('checkbox', { name: 'Must change password at next sign-in' }).click();
  await dialog.getByRole('textbox', { name: 'Name' }).fill('Bao');
  await dialog.getByRole('textbox', { name: 'Email' }).fill('bao@example.com');
  await dialog.getByRole('textbox', { name: 'Password' }).fill('a-long-password');
  await dialog.getByRole('button', { name: 'Create account' }).click();
  await expect(rows(page, 'Users').filter({ hasText: 'bao@example.com' })).not.toContainText('Must change password');
});

test('Reset password asks for a password of 10 characters and marks the user as having to change it', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'More actions for Lan' }).click();
  await page.getByRole('option', { name: 'Reset password' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reset password for Lan' });
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(dialog.getByRole('alert')).toContainText('at least 10 characters');
  await dialog.getByRole('button', { name: 'Generate' }).click();
  await dialog.getByRole('button', { name: 'Reset password' }).click();
  await expect(toastWith(page, 'Password reset for Lan.')).toBeVisible();
  await expect(rows(page, 'Users').filter({ hasText: 'Lan' })).toContainText('Must change password');
});

test('Lock asks first, names the user and says what happens; Unlock brings the account back; nobody locks themselves', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'More actions for Lan' }).click();
  await page.getByRole('option', { name: 'Lock account' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lock Lan?' });
  await expect(dialog).toContainText('is signed out now');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page, 'Users').filter({ hasText: 'Lan' })).toContainText('Active');
  await page.getByRole('button', { name: 'More actions for Lan' }).click();
  await page.getByRole('option', { name: 'Lock account' }).click();
  await page.getByRole('dialog', { name: 'Lock Lan?' }).getByRole('button', { name: 'Lock account' }).click();
  await expect(toastWith(page, 'Lan locked.')).toBeVisible();
  await expect(rows(page, 'Users').filter({ hasText: 'Lan' })).toContainText('Locked');
  await page.getByRole('button', { name: 'More actions for Lan' }).click();
  await page.getByRole('option', { name: 'Unlock account' }).click();
  await page.getByRole('dialog', { name: 'Unlock Lan?' }).getByRole('button', { name: 'Unlock account' }).click();
  await expect(rows(page, 'Users').filter({ hasText: 'Lan' })).toContainText('Active');
  // the signed-in admin cannot lock themselves
  await page.getByRole('button', { name: 'More actions for Harold' }).click();
  await page.getByRole('option', { name: 'Lock account' }).click();
  await page.getByRole('dialog', { name: 'Lock Harold?' }).getByRole('button', { name: 'Lock account' }).click();
  await expect(page.getByRole('dialog', { name: 'Lock Harold?' }).getByRole('alert')).toContainText('You cannot lock your own account');
});

test('the last admin cannot be made a user', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Edit Harold' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit Harold' });
  await dialog.getByRole('button', { name: /^Role: Admin/ }).click();
  await page.getByRole('option', { name: 'User' }).click();
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('At least one admin is needed');
});

test('groups: create, rename and delete; deleting says how many members and flows it affects and removes the group everywhere', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'New group' }).click();
  await page.getByRole('dialog', { name: 'New group' }).getByRole('textbox', { name: 'Group name' }).fill('hr payroll');
  await page.getByRole('dialog', { name: 'New group' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('A group named "hr payroll" exists');
  await page.getByRole('textbox', { name: 'Group name' }).fill('HR Test');
  await page.getByRole('dialog', { name: 'New group' }).getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page, 'Groups')).toHaveCount(3);
  await expect(table(page, 'Access to shared flows').getByRole('columnheader')).toHaveText(['Shared flow', 'HR Payroll', 'HR Analytics', 'HR Test']);
  await page.getByRole('button', { name: 'Rename HR Test' }).click();
  await page.getByRole('textbox', { name: 'Group name' }).fill('HR Testing');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rows(page, 'Groups').nth(2)).toContainText('HR Testing');

  await page.getByRole('button', { name: 'Delete HR Analytics' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete HR Analytics?' });
  await expect(dialog).toContainText('3 members lose this group, and 2 shared flows stop being open to it.');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(rows(page, 'Groups')).toHaveCount(2);
  await expect(rows(page, 'Users').nth(3)).toContainText('HR Payroll');
  await expect(rows(page, 'Users').nth(3)).not.toContainText('HR Analytics');
});

test('access to a shared flow is a box for each group; unticking changes who can open it, also after a reload', async ({ page }) => {
  await page.goto(URL);
  const box = page.getByRole('checkbox', { name: 'HR Analytics can view and run Headcount report cleanup' });
  await expect(box).toHaveAttribute('aria-checked', 'true');
  await box.click();
  await expect(toastWith(page, 'Access updated.')).toBeVisible();
  await expect(box).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'HR Analytics can view and run Headcount report cleanup' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'HR Payroll can view and run Headcount report cleanup' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/flows');
  const row = page.getByRole('table', { name: 'Flows' }).locator('tbody tr').filter({ hasText: 'Headcount report cleanup' });
  await expect(row).toContainText('HR Payroll');
  await expect(row).not.toContainText('HR Analytics');
});

test('Restore brings a deleted flow back to the Flows list', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Restore Payroll export check' }).click();
  await expect(toastWith(page, 'Payroll export check restored.')).toBeVisible();
  await expect(rows(page, 'Deleted flows')).toHaveCount(1);
  await page.goto('/flows');
  await expect(page.getByRole('table', { name: 'Flows' }).locator('tbody tr').filter({ hasText: 'Payroll export check' })).toBeVisible();
});

test('Delete for good asks first, names the flow, and removes it; it is gone after a reload', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Delete for good Old headcount merge' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete Old headcount merge for good?' });
  await expect(dialog).toContainText('cannot be undone');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(rows(page, 'Deleted flows')).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete for good Old headcount merge' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete for good' }).click();
  await expect(toastWith(page, 'Old headcount merge deleted for good.')).toBeVisible();
  await expect(rows(page, 'Deleted flows')).toHaveCount(1);
  await page.reload();
  await expect(rows(page, 'Deleted flows')).toHaveCount(1);
});

test('a flow deleted more than 30 days ago is removed when the admin opens the screen', async ({ page }) => {
  await seed(page, (s) => {
    s.flows.find((f) => f.id === 'flow-old-headcount')!.deletedAt = '2026-08-01T09:00:00.000Z';
  });
  await page.goto(URL);
  await expect(rows(page, 'Deleted flows')).toHaveCount(1);
  await expect(rows(page, 'Deleted flows').first()).toContainText('Payroll export check');
});

test('a user who is not the admin cannot open the screen and is told why', async ({ page }) => {
  await seed(page, (s) => (s.currentUserId = 'user-lan'));
  await page.goto(URL);
  await expect(page.getByRole('alert')).toContainText('Only the admin can open this screen.');
  await expect(page.getByRole('alert')).toContainText('Go back to the Flows list');
  await expect(page.getByRole('table', { name: 'Users' })).toHaveCount(0);
});

test('the explanations of "Access to shared flows" and "Deleted flows" are behind info buttons, not under the titles', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Access to shared flows' })).toBeVisible();
  await expect(page.getByText('Members of a ticked group can view and run the flow.')).toHaveCount(0);
  await expect(page.getByText('A deleted flow is kept for 30 days.')).toHaveCount(0);
  await page.getByRole('button', { name: 'About Access to shared flows' }).click();
  await expect(page.getByText('Members of a ticked group can view and run the flow.')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'About Deleted flows' }).click();
  await expect(page.getByText('A deleted flow is kept for 30 days.')).toBeVisible();
});
