import { expect, test } from '@playwright/test';

test('registration page renders the main form', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('聚會報名');
  await expect(page.getByRole('heading', { name: '聚會報名', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '填寫報名資料' })).toBeVisible();
  const registrationForm = page.locator('#registrationForm');
  await expect(registrationForm.getByRole('textbox', { name: '邀請人', exact: true })).toBeVisible();
  await expect(registrationForm.getByRole('combobox', { name: '會所', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '送出報名' })).toBeVisible();
});

test('meal choices appear and counts aggregate from checked attendees', async ({ page }) => {
  await page.goto('/');

  const inviterMealType = page.locator('#inviterMealType');
  await expect(inviterMealType).toBeHidden();

  await page.locator('#inviterMealToggle').check();
  await expect(inviterMealType).toBeVisible();
  await inviterMealType.getByLabel('葷食').check();

  const guestRow = page.locator('.registration-guest-entry').first();
  await expect(guestRow.locator('.guest-meal-panel')).toBeHidden();

  await guestRow.locator('.registration-guest-input').fill('王小明');
  await expect(guestRow.locator('.guest-meal-panel')).toBeVisible();
  await guestRow.locator('.guest-meal-toggle').check();
  await guestRow.locator('.guest-diet-choice').getByLabel('素食').check();

  await expect(page.locator('#meatMealCountDisplay')).toHaveText('1');
  await expect(page.locator('#vegetarianMealCountDisplay')).toHaveText('1');
  await expect(page.locator('#registrationForm [name="meat_meal_count"]')).toHaveValue('1');
  await expect(page.locator('#registrationForm [name="vegetarian_meal_count"]')).toHaveValue('1');
});
