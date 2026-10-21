import { test, expect, devices } from '@playwright/test';
function clipboardStub() {
  const state = window as Window & { copiedInvite?: string; denyClipboard?: boolean };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (value: string) => {
        if (state.denyClipboard) throw new Error('Clipboard access denied in test');
        state.copiedInvite = value;
      },
    },
  });
}
test('anonymous submissions, duplicate warning, Submit Anyway, reports and rate limiting', async ({
  page,
  browser,
}) => {
  await page.addInitScript(clipboardStub);
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
  await expect(page.locator('.section-card')).toHaveCount(1);
  // Open a profile first to verify it sees later writes to the shared catalog.
  const profileHref = await page.locator('.section-faculty a').first().getAttribute('href');
  const profile = await page.context().newPage();
  await profile.goto(profileHref!);
  await expect(profile.locator('.inline-group')).toHaveCount(0);
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
  await share('www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite');
  await expect(page.locator('.inline-group')).toHaveCount(1);
  await profile.reload();
  await expect(profile.locator('.inline-group')).toHaveCount(1);
  const anotherSection = await page.context().newPage();
  try {
    await anotherSection.goto('/');
    await anotherSection
      .getByRole('searchbox', { name: 'Search courses and sections' })
      .fill('ACT141.2');
    await expect(anotherSection.locator('.section-card')).toHaveCount(1);
    await anotherSection.getByRole('button', { name: 'Add group link' }).click();
    const blockedDialog = anotherSection.getByRole('dialog');
    const sameInvite = 'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite';
    await blockedDialog.getByLabel('Messenger invite URL').fill(sameInvite);
    await anotherSection.waitForTimeout(2200);
    const blocked = anotherSection.waitForResponse(
      (response) =>
        response.url().endsWith('/api/groups') && response.request().method() === 'POST',
    );
    await blockedDialog.getByRole('button', { name: 'Share group link', exact: true }).click();
    expect((await blocked).status()).toBe(409);
    await expect(blockedDialog.getByRole('alert')).toContainText('ACT141.1 (Fall - 2026)');
    await expect(blockedDialog.getByRole('alert')).toContainText(
      'cannot be shared across multiple sections',
    );
    await expect(blockedDialog.getByLabel('Messenger invite URL')).toHaveValue(sameInvite);
    await expect(anotherSection.locator('.inline-group')).toHaveCount(0);
    await anotherSection.screenshot({ path: 'test-results-db/cross-section-blocked.png' });
  } finally {
    await anotherSection.close();
  }
  await expect(page.locator('.inline-group a')).toHaveAttribute(
    'href',
    'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
  );
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Copy group link', exact: true }).click();
  expect(
    await page.evaluate(() => (window as Window & { copiedInvite?: string }).copiedInvite),
  ).toBe('https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite');
  await expect(page.getByText('Group link copied.', { exact: true })).toBeVisible();
  await page.locator('.section-card').getByRole('link', { name: 'View section' }).click();
  await expect(page.locator('.group-row')).toHaveCount(1);
  await expect(
    page.locator('.group-row').first().getByRole('link', { name: 'Join group' }),
  ).toHaveAttribute(
    'href',
    'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy group link', exact: true }).click();
  expect(
    await page.evaluate(() => (window as Window & { copiedInvite?: string }).copiedInvite),
  ).toBe('https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite');
  await share('https://www.messenger.com/j/SecondTestInvite/?send_source=gc%3Acopy_invite');
  await expect(
    page.getByRole('heading', {
      name: 'A Messenger group already exists for this course section.',
    }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Join Existing Group' })).toHaveAttribute(
    'href',
    'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
  );
  await expect(page.locator('.group-row')).toHaveCount(1);
  await expect(
    page.getByRole('dialog').getByRole('combobox', { name: 'Course', exact: true }),
  ).toBeHidden();
  await expect(page.getByRole('button', { name: 'Submit Anyway', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { denyClipboard?: boolean }).denyClipboard = true;
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Copy group link', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByLabel('Group invite link')).toHaveValue(
    'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('button', { name: 'Submit Anyway', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as Window & { denyClipboard?: boolean }).denyClipboard = false;
  });
  await page.screenshot({ path: 'test-results-db/existing-warning.png' });
  await page.getByRole('button', { name: 'Submit Anyway', exact: true }).click();
  await expect(page.locator('.group-row')).toHaveCount(2);
  await profile.reload();
  await expect(profile.locator('.inline-group')).toHaveCount(2);
  await profile.close();
  await share(
    'https://www.m.me/j/SecondTestInvite/?send_source=gc%3Acopy_invite&utm_source=equivalent',
  );
  // SecondTestInvite was checked once, then confirmed with Submit Anyway. This
  // equivalent third submission must ban further writes before another transaction.
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('blocked for 10 days');
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Bangladesh time');
  await expect(
    page.getByRole('button', { name: 'Submissions temporarily blocked', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: 'test-results-db/ten-day-block.png' });
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
        url: `https://www.messenger.com/j/DifferentInvite${i}/?send_source=gc%3Acopy_invite`,
        submitAnyway: true,
        website: '',
        token,
      },
    });
    statuses.push(response.status());
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(Number(response.headers()['retry-after'])).toBeGreaterThan(863000);
    expect(await response.json()).toMatchObject({ code: 'GROUP_SUBMISSIONS_BLOCKED' });
  }
  // A ban applies to every group submission, including distinct links and Submit Anyway.
  expect(statuses).toEqual([429, 429, 429, 429, 429]);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
  await expect(page.locator('.inline-group')).toHaveCount(2);
  await expect(page.locator('.inline-group a').nth(0)).toHaveAttribute(
    'href',
    'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
  );
  await expect(page.locator('.inline-group a').nth(1)).toHaveAttribute(
    'href',
    'https://www.messenger.com/j/SecondTestInvite/?send_source=gc%3Acopy_invite',
  );
  await page.screenshot({ path: 'test-results-db/direct-join.png' });
  // Read-only phone checks use the same disposable database; no real Messenger request.
  const mobile = await browser.newContext({ ...devices['Pixel 7'] });
  try {
    await mobile.addInitScript(clipboardStub);
    const phone = await mobile.newPage();
    await phone.goto(page.url());
    await phone.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
    await expect(phone.locator('.inline-group')).toHaveCount(2);
    await phone.getByRole('button', { name: 'Copy group link', exact: true }).first().click();
    expect(
      await phone.evaluate(() => (window as Window & { copiedInvite?: string }).copiedInvite),
    ).toBe('https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite');
    // Exercise the actual browser navigation with a locally fulfilled destination.
    // This checks the outbound URL and tab, not Messenger's native app behavior.
    await phone.route('https://www.messenger.com/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<p>Local invite navigation test</p>',
      }),
    );
    await phone.locator('.inline-group a').first().click();
    await expect(phone).toHaveURL(
      'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
    );
    expect(mobile.pages()).toHaveLength(1);
    await phone.goto(page.url());
    await phone.getByRole('searchbox', { name: 'Search courses and sections' }).fill('ACT141.1');
    for (const width of [390, 320]) {
      await phone.setViewportSize({ width, height: 844 });
      expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await phone.screenshot({ path: `test-results-db/mobile-groups-${width}.png` });
    }
    await phone.getByRole('button', { name: 'Trouble opening Messenger?', exact: true }).click();
    await expect(phone.getByRole('dialog')).toContainText('Paste the invite into a Messenger DM');
    await phone.screenshot({ path: 'test-results-db/mobile-invite-help.png' });
    await phone.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
    await phone.evaluate(() => {
      (window as Window & { denyClipboard?: boolean }).denyClipboard = true;
    });
    await phone.getByRole('button', { name: 'Copy group link', exact: true }).first().click();
    const manual = phone.getByRole('dialog');
    await expect(manual.getByLabel('Group invite link')).toHaveValue(
      'https://www.messenger.com/j/FirstTestInvite/?send_source=gc%3Acopy_invite',
    );
    await manual.getByLabel('Group invite link').click();
    expect(
      await manual
        .getByLabel('Group invite link')
        .evaluate(
          (element: HTMLTextAreaElement) =>
            element.selectionStart === 0 && element.selectionEnd === element.value.length,
        ),
    ).toBe(true);
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await phone.screenshot({ path: 'test-results-db/mobile-manual-copy.png' });
    await manual.getByRole('button', { name: 'Close dialog' }).click();
    await phone.getByRole('button', { name: 'Add another invite', exact: true }).click();
    const blockedForm = phone.getByRole('dialog');
    await blockedForm
      .getByLabel('Messenger invite URL')
      .fill('https://m.me/j/FreshButBlockedInvite');
    await phone.waitForTimeout(2200);
    await blockedForm.getByRole('button', { name: 'Share group link', exact: true }).click();
    await expect(blockedForm.getByRole('alert')).toContainText('blocked for 10 days');
    await expect(
      blockedForm.getByRole('button', { name: 'Submissions temporarily blocked', exact: true }),
    ).toBeDisabled();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await phone.screenshot({ path: 'test-results-db/mobile-ten-day-block.png' });
  } finally {
    await mobile.close();
  }
});
