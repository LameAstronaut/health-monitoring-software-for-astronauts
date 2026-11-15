import { test, expect } from './fixtures';

test('alert review and history show response actions without citation clutter', async ({ page, request }) => {
  const api = 'http://127.0.0.1:18000/api/v1';
  const control = await (await request.get(`${api}/demo/control`)).json();
  const restarted = await (await request.post(`${api}/demo/control`, { data: { action: 'RESTART', expected_revision: control.revision, scenario: 'ANOMALY', speed: 4, astronaut_id: 'DEMO-CREW-001' } })).json();
  const configured = await request.post(`${api}/demo/control`, { data: { action: 'CONFIGURE', expected_revision: restarted.revision, scenario: 'ANOMALY', fault: 'OXYGEN', manual_values: { spo2: 88 } } });
  expect(configured.ok()).toBe(true);
  await page.goto('/');
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible({ timeout: 20000 });
  const guidance = dialog.getByRole('region', { name: 'Response guidance' });
  await expect(guidance).toContainText('Falling oxygen saturation');
  await expect(guidance.getByRole('link')).toHaveCount(0);
  await expect(guidance).not.toContainText('NASA');
  await expect(guidance).toContainText('crew medical officer / flight surgeon');
  await dialog.getByRole('button', { name: 'Minimize', exact: true }).click();
  await page.getByRole('button', { name: 'Alerts', exact: true }).click();
  await page.getByText('Response guidance', { exact: true }).first().click();
  await expect(page.getByRole('region', { name: 'Response guidance' }).first()).toBeVisible();
});
