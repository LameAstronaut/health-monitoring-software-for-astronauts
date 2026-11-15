import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:18000/api/v1';

test('sleep duration is placed below oxygen and beside diastolic pressure, with recorded values and history', async ({ page, request }) => {
  const control = await (await request.get(`${API}/demo/control`)).json();
  await request.post(`${API}/demo/control`, { data: {
    action: 'RESTART', expected_revision: control.revision, astronaut_id: 'DEMO-CREW-001',
  } });
  await page.goto('/');
  const card = (name: string) => page.locator('.metric-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const sleep = card('Sleep duration');
  await expect(sleep).toContainText('7.5');
  await expect(sleep).toContainText('RECORDED');
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const oxygen = await card('Oxygen saturation').boundingBox();
    const diastolic = await card('Diastolic pressure').boundingBox();
    const bounds = await sleep.boundingBox();
    expect(Math.abs(bounds!.x - oxygen!.x)).toBeLessThan(1);
    expect(bounds!.y).toBeGreaterThan(oxygen!.y);
    expect(bounds!.x).toBeGreaterThan(diastolic!.x);
    expect(Math.abs(bounds!.y - diastolic!.y)).toBeLessThan(1);
  }
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.screenshot({ path: test.info().outputPath('sleep-duration-dashboard.png'), fullPage: true });
  // Seed an edge-case reading through the simulator API; there is no manual editor.
  const state = await (await request.get(`${API}/demo/control`)).json();
  expect((await request.post(`${API}/demo/control`, { data: { action: 'CONFIGURE', expected_revision: state.revision, manual_values: { sleep_duration: 0 } } })).ok()).toBe(true);

  await expect(sleep.locator('.metric-value')).toContainText('0.0');
  await expect(page.locator('.crew-strip').getByRole('button', { name: /Alex Morgan/ })).toContainText('LIVE');
  await expect(page.locator('.crew-strip').getByRole('button', { name: /Alex Morgan/ })).not.toContainText('DECEASED');
  await page.getByRole('button', { name: 'Live monitoring', exact: true }).click();
  await page.getByRole('combobox', { name: 'Measurement', exact: true }).selectOption('sleep_duration');
  await expect(sleep).toContainText('RECORDED');
  await expect(page.getByRole('cell', { name: /^Sleep duration/ }).first()).toBeVisible();
  await page.reload();
  await expect(sleep).toContainText('0.0');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sleep).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
});
