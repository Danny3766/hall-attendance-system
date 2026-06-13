import { expect, test, type Locator } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('admin creates meeting and user completes full registration flow', async ({ page }) => {
  const suffix = Date.now().toString();
  const meetingTitle = `E2E 聚會 ${suffix}`;
  const meetingLocation = '38 會所';
  const meetingDate = formatDateTimeLocal(daysFromNow(7, 9, 0));
  const registrationDeadline = formatDateTimeLocal(daysFromNow(6, 18, 0));

  await test.step('admin logs in and creates a new meeting', async () => {
    await page.goto('/admin.html');
    await page.getByRole('textbox', { name: '帳號' }).fill('admin2');
    await page.getByLabel('密碼').fill('admin123');
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page.locator('#adminPanel')).toBeVisible();
    await page.getByRole('button', { name: '新增聚會' }).click();
    await page.getByRole('textbox', { name: '聚會名稱' }).fill(meetingTitle);
    await page.getByLabel('聚會時間').fill(meetingDate);
    await page.getByLabel('報名截止時間').fill(registrationDeadline);
    await page.getByRole('textbox', { name: '地點' }).fill(meetingLocation);
    await page.getByRole('textbox', { name: '說明' }).fill('Playwright 建立的完整流程測試聚會');
    await page.getByRole('button', { name: '建立聚會' }).click();

    await expect(page.locator('#meetingStatusMessage')).toContainText('聚會已建立');
    await expect(page.locator('#meetingCards')).toContainText(meetingTitle);
  });

  await test.step('user registers for the new meeting', async () => {
    await page.goto('/');
    const registrationForm = page.locator('#registrationForm');
    await expect(page.locator('#meetingSummary')).not.toContainText('正在載入聚會資料...');

    const meetingPicker = page.locator('#meetingPicker');
    if (await meetingPicker.isVisible().catch(() => false)) {
      await expect(meetingPicker).toContainText(meetingTitle);
      await meetingPicker.selectOption({ label: meetingTitle });
    } else {
      await expect(page.locator('#meetingSummary')).toContainText(meetingTitle);
    }

    await expect(page.locator('#meetingSummary')).toContainText(meetingTitle);
    await registrationForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('測試邀請人');
    await registrationForm.getByRole('combobox', { name: '會所', exact: true }).selectOption('38 會所');
    await registrationForm.getByRole('combobox', { name: '區', exact: true }).selectOption('忠孝區');

    await page.locator('#inviterMealToggle').check();
    await page.locator('#inviterMealType').getByLabel('葷食').check();

    const guestEntry = page.locator('.registration-guest-entry').first();
    await guestEntry.locator('.registration-guest-input').fill('王小明');
    await guestEntry.locator('.guest-meal-toggle').check();
    await guestEntry.locator('.guest-diet-choice').getByLabel('素食').check();

    await expect(page.locator('#registrationAttendeeCountHint')).toContainText('2 人');
    await expect(page.locator('#meatMealCountDisplay')).toHaveText('1');
    await expect(page.locator('#vegetarianMealCountDisplay')).toHaveText('1');

    await page.getByRole('button', { name: '送出報名' }).click();
    await expect(page).toHaveURL(/success\.html\?/);
    await expect(page.locator('#confirmMeetingSummary')).toContainText(meetingTitle);
    await expect(page.locator('#confirmInviterName')).toHaveText('測試邀請人');
    await expect(page.locator('#confirmAttendeeCount')).toHaveText('2 人');
    await expect(page.locator('#confirmMealCounts')).toHaveText('葷食 1 份 / 素食 1 份');
    await expect(page.locator('#confirmGuestNames')).toHaveText('王小明');
  });

  await test.step('lookup can find the existing registration and wrong lookup shows error', async () => {
    await page.getByRole('button', { name: '確認無誤，回報名首頁' }).click();
    await expect(page).toHaveURL(/index\.html|\/$/);
    await expect(page.locator('#meetingSummary')).not.toContainText('正在載入聚會資料...');

    const homeMeetingPicker = page.locator('#meetingPicker');
    if (await homeMeetingPicker.isVisible().catch(() => false)) {
      await expect(homeMeetingPicker).toContainText(meetingTitle);
      await homeMeetingPicker.selectOption({ label: meetingTitle });
    }

    const lookupForm = page.locator('#lookupForm');
    await lookupForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('不存在的邀請人');
    await lookupForm.getByRole('combobox', { name: '會所', exact: true }).selectOption('38 會所');
    await lookupForm.getByRole('combobox', { name: '區', exact: true }).selectOption('忠孝區');
    await page.getByRole('button', { name: '查詢報名' }).click();
    await expect(page.locator('#lookupMessage')).toContainText('找不到符合的報名資料');

    await lookupForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('測試邀請人');
    await page.getByRole('button', { name: '查詢報名' }).click();
    await expect(page).toHaveURL(/success\.html\?/);
    await expect(page.locator('#confirmGuestNames')).toHaveText('王小明');
  });

  await test.step('edit validation appears, then successful edit redirects back to success', async () => {
    await page.getByRole('button', { name: '修改報名資料' }).click();
    await expect(page).toHaveURL(/edit\.html\?/);

    await expect(page.getByRole('spinbutton', { name: '葷食數量' })).toHaveValue('1');
    await expect(page.getByRole('spinbutton', { name: '素食數量' })).toHaveValue('1');

    await page.getByRole('button', { name: '新增受邀人' }).click();
    const guestInputs = page.locator('.guest-input');
    await guestInputs.nth(1).fill('陳小華');
    await page.getByRole('spinbutton', { name: '素食數量' }).fill('3');
    await page.getByRole('button', { name: '修改送出' }).click();

    await expect(page.locator('#editMessage')).toContainText('餐點數量不可超過報名人數');
    await expect(page.locator('#editMessage')).toBeFocused();

    await page.getByRole('spinbutton', { name: '素食數量' }).fill('2');
    await page.getByRole('button', { name: '修改送出' }).click();

    await expect(page).toHaveURL(/success\.html\?/);
    await expect(page.locator('#confirmAttendeeCount')).toHaveText('3 人');
    await expect(page.locator('#confirmMealCounts')).toHaveText('葷食 1 份 / 素食 2 份');
    await expect(page.locator('#confirmGuestNames')).toContainText('王小明');
    await expect(page.locator('#confirmGuestNames')).toContainText('陳小華');
  });

  await test.step('admin list reflects updated registration totals', async () => {
    await page.goto('/admin.html');
    await expect(page.locator('#adminPanel')).toBeVisible();
    await expect(page.locator('#meetingFilter')).toContainText(meetingTitle);

    await selectOptionByTextStart(page.locator('#meetingFilter'), meetingTitle);
    await expect(page.locator('#registrationTableBody')).toContainText('測試邀請人');
    await expect(page.locator('#registrationTableBody')).toContainText('王小明、陳小華');
    await expect(page.locator('#totalRows')).toHaveText('1');
    await expect(page.locator('#totalPeople')).toHaveText('3');
    await expect(page.locator('#totalMeat')).toHaveText('1');
    await expect(page.locator('#totalVeg')).toHaveText('2');
  });
});

function daysFromNow(days: number, hours: number, minutes: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hours, minutes, 0, 0);
  return value;
}

function formatDateTimeLocal(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

async function selectOptionByTextStart(locator: Locator, textStart: string) {
  const optionValue = await locator.evaluate((element, startText) => {
    const select = element as HTMLSelectElement;
    const option = Array.from(select.options).find((item) => item.textContent?.trim().startsWith(startText));
    return option?.value || '';
  }, textStart);

  if (!optionValue) throw new Error(`Option starting with "${textStart}" not found.`);
  await locator.selectOption(optionValue);
}
