import { expect, test } from '@playwright/test';

test('admin page renders the login form', async ({ page }) => {
  await page.goto('/admin.html');

  await expect(page).toHaveTitle('報名管理');
  await expect(page.getByRole('heading', { name: '報名管理', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '管理者登入' })).toBeVisible();
  await expect(page.getByLabel('帳號')).toBeVisible();
  await expect(page.getByLabel('密碼')).toBeVisible();
  await expect(page.getByRole('button', { name: '登入' })).toBeVisible();
});

test('admin logout clears the login form', async ({ page }) => {
  await page.goto('/admin.html');
  await page.getByRole('textbox', { name: '帳號' }).fill('admin2');
  await page.getByLabel('密碼').fill('admin123');
  await page.getByRole('button', { name: '登入' }).click();

  await expect(page.locator('#adminPanel')).toBeVisible();
  await page.getByRole('button', { name: '登出' }).click();

  await expect(page.locator('#loginPanel')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '帳號' })).toHaveValue('');
  await expect(page.getByLabel('密碼')).toHaveValue('');

  await page.reload();
  await expect(page.locator('#loginPanel')).toBeVisible();
  await expect(page.getByRole('textbox', { name: '帳號' })).toHaveValue('');
  await expect(page.getByLabel('密碼')).toHaveValue('');
});
