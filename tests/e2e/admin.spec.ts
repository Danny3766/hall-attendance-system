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
