import { expect, test } from '@playwright/test';

test('registration page renders the main form', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('聚會報名');
  await expect(page.getByRole('heading', { name: '聚會報名', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '填寫報名資料' })).toBeVisible();
  const registrationForm = page.locator('#registrationForm');
  await expect(registrationForm.getByLabel('邀請人')).toBeVisible();
  await expect(registrationForm.getByLabel('會所')).toBeVisible();
  await expect(page.getByRole('button', { name: '送出報名' })).toBeVisible();
});

test('meal fields toggle when meal is required', async ({ page }) => {
  await page.goto('/');

  const mealFields = page.locator('#mealFields');
  await expect(mealFields).toBeHidden();

  await page.getByLabel('需要用餐').check();
  await expect(mealFields).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '葷食數量' })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '素食數量' })).toBeVisible();
});
