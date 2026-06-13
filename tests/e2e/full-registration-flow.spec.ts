import { expect, test, type Locator } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('admin creates meeting and user completes full registration flow', async ({ page }, testInfo) => {
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

    if (testInfo.project.name === 'chromium') {
      const successDetails = page.locator('.detail-list > div');
      await expectFieldsShareRow([
        successDetails.nth(0),
        successDetails.nth(1),
        successDetails.nth(2),
      ]);
      await expectFieldsShareRow([
        successDetails.nth(3),
        successDetails.nth(4),
      ]);
      await expectFieldsShareRow([
        successDetails.nth(5),
        successDetails.nth(6),
      ]);
    }
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
    await expect(page.getByRole('spinbutton', { name: '葷食數量' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: '素食數量' })).toBeVisible();

    if (testInfo.project.name === 'chromium') {
      const identityFields = page.locator('#editForm .form-row.three > label');
      await expectFieldsShareRow([
        identityFields.nth(0),
        identityFields.nth(1),
        identityFields.nth(2),
      ]);

      const mealLabels = page.locator('#mealFields > label');
      await expectFieldsShareRow([
        page.locator('#editForm .meal-attendee-inline > .checkbox-card'),
        mealLabels.nth(0),
        mealLabels.nth(1),
      ]);
    }

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

test('closed meeting blocks later edits from success page', async ({ page }) => {
  const suffix = `${Date.now()}-closed`;
  const meetingTitle = `E2E 關閉修改 ${suffix}`;
  const meetingDate = formatDateTimeLocal(daysFromNow(7, 15, 0));
  const registrationDeadline = formatDateTimeLocal(daysFromNow(6, 20, 0));

  await test.step('admin creates an open meeting', async () => {
    await page.goto('/admin.html');
    await page.getByRole('textbox', { name: '帳號' }).fill('admin2');
    await page.getByLabel('密碼').fill('admin123');
    await page.getByRole('button', { name: '登入' }).click();

    await expect(page.locator('#adminPanel')).toBeVisible();
    await page.getByRole('button', { name: '新增聚會' }).click();
    await page.getByRole('textbox', { name: '聚會名稱' }).fill(meetingTitle);
    await page.getByLabel('聚會時間').fill(meetingDate);
    await page.getByLabel('報名截止時間').fill(registrationDeadline);
    await page.getByRole('textbox', { name: '地點' }).fill('38 會所');
    await page.getByRole('textbox', { name: '說明' }).fill('Playwright 關閉報名後修改限制測試');
    await page.getByRole('button', { name: '建立聚會' }).click();

    await expect(page.locator('#meetingCards')).toContainText(meetingTitle);
  });

  let successUrl = '';

  await test.step('user registers and lands on success page', async () => {
    await page.goto('/');
    await expect(page.locator('#meetingSummary')).not.toContainText('正在載入聚會資料...');

    const meetingPicker = page.locator('#meetingPicker');
    if (await meetingPicker.isVisible().catch(() => false)) {
      await expect(meetingPicker).toContainText(meetingTitle);
      await meetingPicker.selectOption({ label: meetingTitle });
    }

    const registrationForm = page.locator('#registrationForm');
    await registrationForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('關閉測試邀請人');
    await registrationForm.getByRole('combobox', { name: '會所', exact: true }).selectOption('38 會所');
    await registrationForm.getByRole('combobox', { name: '區', exact: true }).selectOption('忠孝區');
    await page.getByRole('button', { name: '送出報名' }).click();

    await expect(page).toHaveURL(/success\.html\?/);
    await expect(page.locator('#confirmMeetingSummary')).toContainText(meetingTitle);
    successUrl = page.url();
  });

  await test.step('admin closes the meeting', async () => {
    await page.goto('/admin.html');
    await expect(page.locator('#adminPanel')).toBeVisible();
    await expect(page.locator('#meetingCards')).toContainText(meetingTitle);

    const meetingCard = page.locator('.meeting-admin-card', { hasText: meetingTitle }).first();
    await meetingCard.getByRole('button', { name: '關閉報名' }).click();
    await expect(page.locator('#meetingStatusMessage')).toContainText('聚會已關閉報名');
  });

  await test.step('success page still loads but edit page becomes read-only blocked', async () => {
    await page.goto(successUrl);
    await expect(page.locator('#confirmMeetingSummary')).toContainText(meetingTitle);
    await page.getByRole('button', { name: '修改報名資料' }).click();

    await expect(page).toHaveURL(/edit\.html\?/);
    await expect(page.locator('#editMessage')).toContainText('這場聚會已關閉或超過報名截止時間，不能再修改');
    await expect(page.locator('#saveButton')).toBeDisabled();
  });

  await test.step('admin reopens the meeting and editing works again', async () => {
    await page.goto('/admin.html');
    await expect(page.locator('#adminPanel')).toBeVisible();
    await expect(page.locator('#meetingCards')).toContainText(meetingTitle);

    const meetingCard = page.locator('.meeting-admin-card', { hasText: meetingTitle }).first();
    await meetingCard.getByRole('button', { name: '開放報名' }).click();
    await expect(page.locator('#meetingStatusMessage')).toContainText('聚會已開放報名');

    await page.goto(successUrl);
    await page.getByRole('button', { name: '修改報名資料' }).click();
    await expect(page.locator('#saveButton')).toBeEnabled();
    const inviterField = page.getByRole('textbox', { name: '邀請人' });
    await inviterField.fill('重新開放後可修改');
    await expect(inviterField).toHaveValue('重新開放後可修改');
    await page.getByRole('button', { name: '修改送出' }).click();

    await expect(page).toHaveURL(/success\.html\?/);
    await expect(page.locator('#confirmInviterName')).toHaveText('重新開放後可修改');
  });
});

test('registration without meals keeps meal counts at zero', async ({ page }) => {
  const suffix = `${Date.now()}-no-meal`;
  const meetingTitle = `E2E 無用餐 ${suffix}`;

  await createMeeting(page, meetingTitle, 'Playwright 無用餐報名測試');

  await page.goto('/');
  await selectOpenMeeting(page, meetingTitle);

  const registrationForm = page.locator('#registrationForm');
  await registrationForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('無用餐邀請人');
  await registrationForm.getByRole('combobox', { name: '會所', exact: true }).selectOption('38 會所');
  await registrationForm.getByRole('combobox', { name: '區', exact: true }).selectOption('忠孝區');
  await page.getByRole('button', { name: '送出報名' }).click();

  await expect(page).toHaveURL(/success\.html\?/);
  await expect(page.locator('#confirmMeetingSummary')).toContainText(meetingTitle);
  await expect(page.locator('#confirmMealRequired')).toHaveText('不需要用餐');
  await expect(page.locator('#confirmMealCounts')).toHaveText('葷食 0 份 / 素食 0 份');
  await expect(page.locator('#confirmAttendeeCount')).toHaveText('1 人');
  await expect(page.locator('#confirmGuestNames')).toHaveText('無');

  await page.goto('/admin.html');
  await expect(page.locator('#adminPanel')).toBeVisible();
  await expect(page.locator('#meetingFilter')).toContainText(meetingTitle);
  await selectOptionByTextStart(page.locator('#meetingFilter'), meetingTitle);
  await expect(page.locator('#registrationTableBody')).toContainText('無用餐邀請人');
  await expect(page.locator('#totalRows')).toHaveText('1');
  await expect(page.locator('#totalPeople')).toHaveText('1');
  await expect(page.locator('#totalMeat')).toHaveText('0');
  await expect(page.locator('#totalVeg')).toHaveText('0');
});

test('multiple guests can be added and removed before registration', async ({ page }) => {
  const suffix = `${Date.now()}-guests`;
  const meetingTitle = `E2E 受邀人增減 ${suffix}`;

  await createMeeting(page, meetingTitle, 'Playwright 多位受邀人新增移除測試');

  await page.goto('/');
  await selectOpenMeeting(page, meetingTitle);

  const registrationForm = page.locator('#registrationForm');
  await registrationForm.getByRole('textbox', { name: '邀請人', exact: true }).fill('受邀人測試邀請人');
  await registrationForm.getByRole('combobox', { name: '會所', exact: true }).selectOption('38 會所');
  await registrationForm.getByRole('combobox', { name: '區', exact: true }).selectOption('忠孝區');

  await page.locator('#inviterMealToggle').check();
  await page.locator('#inviterMealType').getByLabel('葷食').check();

  const firstGuest = page.locator('.registration-guest-entry').first();
  await firstGuest.locator('.registration-guest-input').fill('會被移除');
  await page.getByRole('button', { name: '新增受邀人' }).click();
  await page.locator('.registration-guest-entry').nth(1).locator('.registration-guest-input').fill('保留甲');
  await page.getByRole('button', { name: '新增受邀人' }).click();
  await page.locator('.registration-guest-entry').nth(2).locator('.registration-guest-input').fill('保留乙');

  await firstGuest.getByRole('button', { name: '移除' }).click();
  await expect(page.locator('#registrationAttendeeCountHint')).toContainText('3 人');
  await expect(page.locator('.registration-guest-input')).toHaveCount(2);

  await page.getByRole('button', { name: '送出報名' }).click();
  await expect(page).toHaveURL(/success\.html\?/);
  await expect(page.locator('#confirmAttendeeCount')).toHaveText('3 人');
  await expect(page.locator('#confirmGuestNames')).toHaveText('保留甲、保留乙');
  await expect(page.locator('#confirmMealCounts')).toHaveText('葷食 1 份 / 素食 0 份');
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
  await locator.dispatchEvent('change');
  await expect(locator).toHaveValue(optionValue);
}

async function createMeeting(page: import('@playwright/test').Page, title: string, description: string) {
  await page.goto('/admin.html', { waitUntil: 'domcontentloaded' });
  if (await page.locator('#loginPanel').isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: '帳號' }).fill('admin2');
    await page.getByLabel('密碼').fill('admin123');
    await page.getByRole('button', { name: '登入' }).click();
  }

  await expect(page.locator('#adminPanel')).toBeVisible();
  await page.getByRole('button', { name: '新增聚會' }).click();
  await page.getByRole('textbox', { name: '聚會名稱' }).fill(title);
  await page.getByLabel('聚會時間').fill(formatDateTimeLocal(daysFromNow(7, 10, 0)));
  await page.getByLabel('報名截止時間').fill(formatDateTimeLocal(daysFromNow(6, 18, 0)));
  await page.getByRole('textbox', { name: '地點' }).fill('38 會所');
  await page.getByRole('textbox', { name: '說明' }).fill(description);
  await page.getByRole('button', { name: '建立聚會' }).click();
  await expect(page.locator('#meetingCards')).toContainText(title);
}

async function selectOpenMeeting(page: import('@playwright/test').Page, meetingTitle: string) {
  await expect(page.locator('#meetingSummary')).not.toContainText('正在載入聚會資料...');
  const meetingPicker = page.locator('#meetingPicker');
  if (await meetingPicker.isVisible().catch(() => false)) {
    await expect(meetingPicker).toContainText(meetingTitle);
    await meetingPicker.selectOption({ label: meetingTitle });
  } else {
    await expect(page.locator('#meetingSummary')).toContainText(meetingTitle);
  }
  await expect(page.locator('#meetingSummary')).toContainText(meetingTitle);
}

async function expectFieldsShareRow(locators: Locator[]) {
  const boxes = await Promise.all(locators.map(async (locator) => locator.boundingBox()));
  if (boxes.some((box) => !box)) throw new Error('Expected all layout elements to be visible.');

  const topValues = boxes.map((box) => Math.round(box!.y));
  const firstTop = topValues[0];
  for (const top of topValues.slice(1)) {
    expect(Math.abs(top - firstTop)).toBeLessThanOrEqual(8);
  }
}
