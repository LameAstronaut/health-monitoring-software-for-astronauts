import { test, expect } from '@playwright/test';
const API = 'http://127.0.0.1:18000/api/v1';

test('weight sits below suit pressure and supports overrides, history and body view', async ({ page, request }) => {
  const control = await (await request.get(`${API}/demo/control`)).json();
  await request.post(`${API}/demo/control`, { data: { action: 'RESTART', expected_revision: control.revision, astronaut_id: 'DEMO-CREW-001' } });
  await page.goto('/');
  const card = (name: string) => page.locator('.metric-card').filter({ has: page.getByRole('heading', { name, exact: true }) });
  const weight = card('Weight');
  await expect(weight).toContainText('64.0');
  await expect(weight).toContainText('RECORDED');
  for (const width of [1366, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const suit = await card('Suit pressure').boundingBox();
    const sleep = await card('Sleep duration').boundingBox();
    const bounds = await weight.boundingBox();
    expect(Math.abs(bounds!.x - suit!.x)).toBeLessThan(1);
    expect(bounds!.y).toBeGreaterThan(suit!.y);
    expect(bounds!.x).toBeGreaterThan(sleep!.x);
    expect(Math.abs(bounds!.y - sleep!.y)).toBeLessThan(1);
  }
  await page.getByRole('button', { name: 'Simulator controls', exact: true }).click();
  await page.getByRole('spinbutton', { name: /Weight/ }).fill('0');
  await page.getByRole('button', { name: 'Apply readings', exact: true }).click();
  await page.getByRole('button', { name: 'Mission dashboard', exact: true }).click();
  await expect(weight.locator('.metric-value')).toContainText('0.0');
  await expect(page.locator('.crew-strip').getByRole('button', { name: /Alex Morgan/ })).not.toContainText('DECEASED');
  await page.getByRole('button', { name: 'Simulator controls', exact: true }).click();
  await page.getByRole('spinbutton', { name: /Weight/ }).fill('64.5');
  await page.getByRole('button', { name: 'Apply readings', exact: true }).click();
  await page.getByRole('button', { name: 'Live monitoring', exact: true }).click();
  await expect(weight.locator('.metric-value')).toContainText('64.5');
  await page.getByRole('combobox', { name: 'Measurement', exact: true }).selectOption('weight');
  await expect(page.getByRole('cell', { name: /^Weight/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Nutrition & labs', exact: true }).click();
  const body = page.locator('.body-map-detail');
  await expect(body).toContainText('Weight');
  await expect(body).toContainText('64.5');
  await page.reload();
  await expect(weight.locator('.metric-value')).toContainText('64.5');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(weight).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
});
