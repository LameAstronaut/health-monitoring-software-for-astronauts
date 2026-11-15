import { test, expect } from './fixtures';

const screens = ['Mission dashboard', 'Crew profiles', 'Live monitoring', 'Examinations',
  'Equipment', 'Risk monitoring', 'Nutrition', 'Fitness', 'EVA operations', 'Alerts',
  'Simulator controls', 'Data workspace'];

test('every screen fits phone, tablet and desktop without runtime errors or broken images', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('API CONNECTED', { exact: true })).toBeVisible();
  for (const width of [320, 390, 640, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const screen of screens) {
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: screen, exact: true }).click();
      await expect(page.getByRole('heading', { level: 1, name: screen, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${screen} at ${width}px`).toBe(true);
      expect(await page.locator('input, select, textarea').evaluateAll(controls => controls.every(control =>
        (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) &&
        (control.labels?.length || control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')),
      )), `Form labels in ${screen}`).toBe(true);
      await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)), { message: `Images in ${screen}` }).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test('an unavailable initial snapshot retries automatically without a reload', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/crew', route => unavailable ? route.fulfill({ status: 503, body: '{}' }) : route.continue());
  await page.goto('/');
  await expect(page.getByRole('alert').filter({ hasText: 'API 503' })).toBeVisible();
  unavailable = false;
  await expect(page.locator('.crew-strip .crew-summary')).toHaveCount(3);
  await expect(page.getByRole('alert').filter({ hasText: 'API 503' })).toHaveCount(0);
  await expect(page.locator('.metric-card .status').filter({ hasText: /^LIVE$/ })).toHaveCount(6);
});

test('manual reference tables preserve edited cells, added fields and saved revisions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Data workspace', exact: true }).click();
  await page.getByLabel('Table title').fill('QA manual reference');
  await page.getByLabel('Column 1 name').fill('Dose');
  await page.getByLabel('Column 1 unit').fill('µGy/h');
  await page.getByLabel('Row 1, Dose', { exact: true }).fill('14.0');
  await page.getByRole('button', { name: 'Add data field', exact: true }).click();
  await page.getByLabel('Column 2 name').fill('Location');
  await page.getByLabel('Row 1, Location', { exact: true }).fill('Cabin');
  await page.getByRole('button', { name: 'Add row', exact: true }).click();
  await page.getByLabel('Row 2, Dose', { exact: true }).fill('15.5');
  await page.getByLabel('Row 2, Location', { exact: true }).fill('Airlock');
  await page.getByRole('button', { name: 'Save reference table', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reference table · revision 0', exact: true })).toBeVisible();
  await page.getByLabel('Row 1, Dose', { exact: true }).fill('14.5');
  await page.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Reference table · revision 1', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Data workspace', exact: true }).click();
  await page.getByRole('button', { name: /QA manual reference MANUAL/ }).click();
  await expect(page.getByLabel('Row 1, Dose', { exact: true })).toHaveValue('14.5');
  await expect(page.getByLabel('Row 2, Location', { exact: true })).toHaveValue('Airlock');
  await expect(page.getByLabel('Column 1 unit')).toHaveValue('µGy/h');
});
