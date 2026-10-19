import { test, expect } from '@playwright/test';
test('anonymous submissions, duplicate warning, Submit Anyway, reports and rate limiting', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
  await expect(page.locator('.section-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Add group link' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.selected-class')).toContainText('ACT141.1');
  await expect(dialog.getByRole('combobox', { name: 'Course', exact: true })).toBeHidden();
  await dialog.getByRole('button', { name: 'Change class', exact: true }).click();
  const courseSelect = dialog.getByRole('combobox', { name: 'Course', exact: true });
  const sectionSelect = dialog.getByRole('combobox', { name: 'Section', exact: true });
  const selectedCourse = await courseSelect.inputValue();
  const selectedSection = await sectionSelect.inputValue();
  expect(selectedCourse).not.toBe('');
  expect(selectedSection).not.toBe('');
  await page.screenshot({ path: 'test-results-db/share-dialog.png' });
  const rejectedUrl = 'https://m.me/j/FirstTestInvite?unknown=unsupported';
  await dialog.getByLabel('Messenger invite URL').fill(rejectedUrl);
  const rejectedResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/groups') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Share group link', exact: true }).click();
  expect((await rejectedResponse).status()).toBe(400);
  await expect(dialog.locator('.form-error')).toContainText('unsupported invite query parameters');
  await expect(courseSelect).toHaveValue(selectedCourse);
  await expect(sectionSelect).toHaveValue(selectedSection);
  await expect(dialog.getByLabel('Messenger invite URL')).toHaveValue(rejectedUrl);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  async function share(url: string) {
    await page.getByRole('button', { name: 'Add group link' }).click();
    await page.getByRole('dialog').getByLabel('Messenger invite URL').fill(url);
    await page.waitForTimeout(2200);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Share group link', exact: true })
      .click();
  }
  await share('https://m.me/j/FirstTestInvite/?send_source=gc%3Acopy_invite');
  await expect(page.locator('.inline-group')).toHaveCount(1);
  await expect(page.locator('.inline-group a')).toHaveAttribute(
    'href',
    'https://m.me/j/FirstTestInvite',
  );
  await expect(page).toHaveURL(/\/$/);
  await page.locator('.section-card').getByRole('link', { name: 'View section' }).click();
  await expect(page.locator('.group-row')).toHaveCount(1);
  await expect(
    page.locator('.group-row').first().getByRole('link', { name: 'Join group' }),
  ).toHaveAttribute('href', 'https://m.me/j/FirstTestInvite');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await share('https://m.me/j/SecondTestInvite');
  await expect(
    page.getByRole('heading', {
      name: 'A Messenger group already exists for this course section.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join Existing Group' })).toHaveAttribute(
    'href',
    'https://m.me/j/FirstTestInvite',
  );
  await expect(page.locator('.group-row')).toHaveCount(1);
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Course', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Submit Anyway', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results-db/existing-warning.png' });
  await page.getByRole('button', { name: 'Submit Anyway', exact: true }).click();
  await expect(page.locator('.group-row')).toHaveCount(2);
  await share(
    'https://www.m.me/j/SecondTestInvite/?send_source=gc%3Acopy_invite&utm_source=equivalent',
  );
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('already listed');
  await expect(page.locator('.group-row')).toHaveCount(2);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Report link' }).first().click();
  await page
    .getByRole('dialog')
    .getByLabel('Details (optional)')
    .fill('Synthetic local test report; no real Messenger network request.');
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Send report' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Report sent to administrators.')).toBeVisible();
  await page.getByRole('button', { name: 'Add group link' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Change class', exact: true }).click();
  const semesterId = await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Semester', exact: true })
    .inputValue();
  const courseId = await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Course', exact: true })
    .inputValue();
  const sectionId = await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Section', exact: true })
    .inputValue();
  const challenge = await page.request.get('/api/challenge');
  const { token } = await challenge.json();
  await page.waitForTimeout(2200);
  const statuses: number[] = [];
  for (let i = 0; i < 5; i++) {
    const response = await page.request.post('/api/groups', {
      headers: { origin: 'http://127.0.0.1:3001' },
      data: {
        semesterId,
        courseId,
        sectionId,
        url: 'https://m.me/j/FirstTestInvite',
        submitAnyway: true,
        website: '',
        token,
      },
    });
    statuses.push(response.status());
  }
  expect(statuses).toEqual([200, 200, 200, 200, 429]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
  await expect(page.locator('.inline-group')).toHaveCount(2);
  await expect(page.locator('.inline-group a').nth(0)).toHaveAttribute(
    'href',
    'https://m.me/j/FirstTestInvite',
  );
  await expect(page.locator('.inline-group a').nth(1)).toHaveAttribute(
    'href',
    'https://m.me/j/SecondTestInvite',
  );
  await page.screenshot({ path: 'test-results-db/direct-join.png' });
});
