import { test, expect } from '@playwright/test';
import { CATALOG_CHANGE_EVENT } from '../../src/lib/catalog-events';

test('open directory tabs refresh after edits elsewhere and keep search filters', async ({
  page,
  context,
}) => {
  await page.clock.install();
  await page.goto('/faculty');
  const search = page.getByRole('searchbox', { name: 'Search faculty' });
  await search.fill('FZC');
  await search.blur();
  await expect(page.locator('.faculty-card')).toHaveCount(1);
  await page.clock.fastForward(6000);
  const otherTab = await context.newPage();
  await otherTab.goto('/about');
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/faculty' &&
      response.request().headers()['rsc'] === '1',
  );
  await otherTab.evaluate(
    (key) => localStorage.setItem(key, String(Date.now())),
    CATALOG_CHANGE_EVENT,
  );
  await refreshed;
  await expect(search).toHaveValue('FZC');
  await expect(page.locator('.faculty-card')).toHaveCount(1);
  await otherTab.close();
});

test('visible pages refresh periodically while open forms keep their input', async ({ page }) => {
  await page.clock.install();
  await page.goto('/faculty');
  // An actual filter interaction confirms hydration/effect registration before
  // advancing the browser clock past the first refresh interval.
  const search = page.getByRole('searchbox', { name: 'Search faculty' });
  await search.fill('FZC');
  await expect(page.locator('.faculty-card')).toHaveCount(1);
  await search.blur();
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/faculty' &&
      response.request().headers()['rsc'] === '1',
  );
  await page.clock.fastForward(60_000);
  await refreshed;
  await search.fill('FZC');
  let refreshes = 0;
  page.on('request', (request) => {
    if (request.headers()['rsc'] === '1') refreshes++;
  });
  await page.clock.fastForward(60_000);
  await expect(search).toHaveValue('FZC');
  expect(refreshes).toBe(0);
});
const fits = async (page: import('@playwright/test').Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
test('home search filters immediately and sharing already knows the class', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your class group.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /All sections/ })).toContainText('496');
  const search = page.getByRole('searchbox', { name: 'Search courses and sections' });
  await search.fill('CSE361.9');
  await expect(page.locator('.section-card')).toHaveCount(1);
  await expect(page.locator('.section-card')).toHaveAccessibleName('CSE361.9');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Operating Systems', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show CSE361.10', exact: true }).click();
  await expect(page.locator('.section-card')).toHaveAccessibleName('CSE361.10');
  await page.getByRole('button', { name: 'Show CSE361.9', exact: true }).click();
  await page
    .locator('.section-card')
    .getByRole('button', { name: 'Add group link', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.selected-class')).toContainText('CSE361.9');
  await expect(dialog.getByRole('combobox', { name: 'Course', exact: true })).toBeHidden();
  await expect(dialog.getByLabel('Messenger invite URL')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Share group link', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: `test-results/${info.project.name}-share-dialog.png` });
  await dialog.getByRole('button', { name: 'Change class', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Course', exact: true })).toHaveValue('CSE361');
  await expect(dialog.getByRole('combobox', { name: 'Section', exact: true })).toHaveValue(
    'CSE361.9',
  );
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await fits(page);
  expect(errors).toEqual([]);
});
test('saved sections persist across navigation and reloads', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('CSE361.9');
  await page.getByRole('button', { name: 'Save CSE361.9', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unsave CSE361.9', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const navigation = page.getByRole('navigation', {
    name: info.project.name === 'mobile' ? 'Mobile navigation' : 'Main navigation',
    exact: true,
  });
  await navigation.getByRole('link', { name: 'Saved sections', exact: true }).click();
  await expect(page).toHaveURL(/\/saved/);
  await expect(page.locator('.section-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.section-card')).toHaveAccessibleName('CSE361.9');
  await page.getByRole('button', { name: 'Unsave CSE361.9', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Keep your classes close.' })).toBeVisible();
});
test('courses reveal sections and group actions inline', async ({ page }) => {
  await page.goto('/courses');
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('CSE361');
  await expect(page.locator('.course-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Show CSE361.9', exact: true }).click();
  await expect(page.locator('.section-card')).toHaveCount(1);
  await expect(page.locator('.section-card')).toHaveAccessibleName('CSE361.9');
  await expect(page).toHaveURL(/\/courses$/);
  await expect(
    page.locator('.section-card').getByRole('button', { name: 'Add group link' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show all sections', exact: true }).click();
  await expect(page.locator('.section-card')).toHaveCount(8);
});
test('faculty profiles provide schedules and sharing without opening another page', async ({
  page,
}) => {
  await page.goto('/faculty');
  await page.getByRole('searchbox', { name: 'Search faculty' }).fill('FZC');
  await expect(page.locator('.faculty-card')).toHaveCount(1);
  await page.locator('.faculty-card').getByText('View faculty profile', { exact: true }).click();
  await expect(page).toHaveURL(/\/faculty\/FZC\?semester=source$/);
  await expect(page.getByRole('heading', { name: 'Dr. Faieza Chowdhury' })).toBeVisible();
  await expect(page.locator('.section-card')).toHaveCount(2);
  await expect(page.getByText('SEU516', { exact: true }).first()).toBeVisible();
  await page
    .locator('.section-card')
    .first()
    .getByRole('button', { name: 'Add group link' })
    .click();
  await expect(page.getByRole('dialog').locator('.selected-class')).toContainText('ACT141.1');
});
test('profile clicks show progress while navigation waits and do not prefetch other profiles', async ({
  page,
}, info) => {
  const prefetched: string[] = [];
  page.on('request', (request) => {
    if (
      /\/faculty\/[^/?]+/.test(new URL(request.url()).pathname) &&
      request.headers()['next-router-prefetch']
    )
      prefetched.push(request.url());
  });
  await page.goto('/faculty');
  await page.getByRole('searchbox', { name: 'Search faculty' }).fill('FZC');
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/faculty/FZC?*', async (route) => {
    if (route.request().headers()['rsc'] === '1') await gate;
    await route.continue();
  });
  try {
    await page.locator('.faculty-card').getByText('View faculty profile', { exact: true }).click();
    await expect(page.getByText('Opening profile…', { exact: true })).toBeVisible();
    await page.screenshot({ path: `test-results/${info.project.name}-faculty-opening.png` });
    expect(prefetched).toEqual([]);
    release();
    await expect(
      page.getByRole('heading', { name: 'Dr. Faieza Chowdhury', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.section-card')).toHaveCount(2);
    await page.screenshot({ path: `test-results/${info.project.name}-faculty-profile.png` });
  } finally {
    release();
  }
});
test('faculty profiles open directly and survive a full reload', async ({ page, baseURL }) => {
  await page.goto('/faculty');
  const href = await page.locator('.faculty-card').first().getAttribute('href');
  expect(href).toMatch(/^\/faculty\/ANMM\?semester=source$/);
  await page.goto(baseURL + href!);
  await expect(
    page.getByRole('heading', { name: 'A N M Zahid Hossain Milkan', exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'A N M Zahid Hossain Milkan', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Assigned courses & sections', exact: true }),
  ).toBeVisible();
});
test('empty results recover and mobile destinations are directly accessible', async ({
  page,
}, info) => {
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('not-a-course');
  await expect(page.getByRole('heading', { name: 'No matches found' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('.section-card')).toHaveCount(8);
  await page.getByRole('button', { name: /With groups/ }).click();
  await expect(page.getByRole('heading', { name: 'No matches found' })).toBeVisible();
  await page.getByRole('button', { name: /All sections/ }).click();
  if (info.project.name === 'mobile') {
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'Course directory' })
      .click();
    await expect(page.getByRole('heading', { name: 'Browse courses.' })).toBeVisible();
  } else {
    await page.keyboard.press('/');
    await expect(
      page.getByRole('searchbox', { name: 'Search courses and sections' }),
    ).toBeFocused();
  }
  await fits(page);
});
test('protects admin routes and explains unavailable configuration', async ({ page }) => {
  await page.goto('/admin/faculty');
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole('textbox', { name: 'Email address' }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to dashboard' }).click();
  await expect(page.locator('.form-error')).toContainText('Configure Supabase');
  await expect(page.getByRole('textbox', { name: 'Email address' })).toHaveValue(
    'admin@example.com',
  );
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong-password');
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation', exact: true }),
  ).toHaveCount(0);
});
test('phone filters disclose without adding steps to searching and section chips stay in one row', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Mobile filter interaction.');
  await page.goto('/');
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  const semester = page.getByRole('combobox', { name: 'Select semester', exact: true });
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  await expect(semester).toBeHidden();
  await filters.click();
  await expect(semester).toBeVisible();
  await page.getByRole('combobox', { name: 'Filter by course area' }).selectOption('CSE');
  await filters.click();
  await expect(semester).toBeHidden();
  const search = page.getByRole('searchbox', { name: 'Search courses and sections' });
  await search.fill('CSE361.9');
  await search.press('Enter');
  await expect(search).not.toBeFocused();
  await expect(page.locator('.section-card')).toHaveAccessibleName('CSE361.9');
  const strip = page.locator('.section-jump > div');
  expect(await strip.evaluate((el) => el.scrollHeight <= 60)).toBe(true);
  await expect(page.getByRole('button', { name: 'Show CSE361.9', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await fits(page);
});
test('short phone dialogs keep their close action visible while the form scrolls', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Mobile sheet interaction.');
  await page.setViewportSize({ width: 390, height: 480 });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('CSE361.9');
  const share = page
    .locator('.section-card')
    .getByRole('button', { name: 'Add group link', exact: true });
  await share.click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Change class', exact: true }).click();
  const body = dialog.locator('.dialog-body');
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await dialog.getByLabel('Messenger invite URL').fill('https://m.me/j/testMobileInvite/');
  await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeInViewport();
  const closeBox = await dialog.getByRole('button', { name: 'Close dialog' }).boundingBox();
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/mobile-short-sheet.png' });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(dialog).toBeHidden();
  await expect(share).toBeFocused();
  await fits(page);
});
test('mobile sheets follow a reduced visual viewport and keep navigation out of the keyboard area', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile', 'Mobile visual viewport simulation.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('CSE361.9');
  await page
    .locator('.section-card')
    .getByRole('button', { name: 'Add group link', exact: true })
    .click();
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 430 });
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('html')).toHaveAttribute('data-keyboard-open', '');
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation', exact: true }),
  ).toBeHidden();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Messenger invite URL').fill('https://m.me/j/testMobileInvite/');
  const bounds = await dialog.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(12);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(431);
  expect(
    await dialog.getByLabel('Messenger invite URL').evaluate((el) => getComputedStyle(el).fontSize),
  ).toBe('16px');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    delete (viewport as unknown as Record<string, unknown>).height;
    viewport.dispatchEvent(new Event('resize'));
  });
  await expect(
    page.getByRole('navigation', { name: 'Mobile navigation', exact: true }),
  ).toBeVisible();
});
test('all public layouts fit desktop and phone viewports', async ({ page }, info) => {
  for (const route of ['/', '/courses', '/faculty', '/sections', '/submit', '/saved', '/login']) {
    await page.goto(route);
    await page.evaluate(() => document.fonts.ready);
    await fits(page);
    await page.screenshot({
      path: `test-results/${info.project.name}-${route.slice(1) || 'home'}.png`,
      fullPage: true,
    });
    if (route === '/')
      await page.screenshot({ path: `test-results/${info.project.name}-viewport.png` });
  }
});
test('search and results remain readable at small phone and tablet widths', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'Additional widths are checked once.');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search courses and sections' }).fill('CSE361.9');
    await expect(page.locator('.section-card')).toHaveCount(1);
    await fits(page);
    await page.screenshot({ path: `test-results/finder-${width}.png` });
  }
});
