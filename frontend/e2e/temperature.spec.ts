import { test, expect } from './fixtures';

test('body temperature is acquired by Rust, saved, and linked to arms after reload', async ({ page, request }) => {
  const api = 'http://127.0.0.1:18000/api/v1';
  const current = await (await request.get(`${api}/demo/control`)).json();
  await request.post(`${api}/demo/control`, { data: {
    action: 'RESTART', expected_revision: current.revision, astronaut_id: 'DEMO-CREW-001',
  } });
  const previous = (await (await request.get(`${api}/operations`)).json()).examinations.find(
    (exam: { astronaut_id: string; kind: string; status: string }) => exam.astronaut_id === 'DEMO-CREW-001' && exam.kind === 'BODY_TEMPERATURE' && exam.status === 'SAVED');
  await page.goto('/');
  await expect(page.locator('.crew-strip').getByRole('button', { name: /Alex Morgan/ })).toContainText('LIVE');
  await page.getByRole('button', { name: 'Examinations', exact: true }).click();
  await page.getByRole('radio', { name: /Body temperature/ }).check();
  await expect(page.getByRole('combobox', { name: 'Examination instrument' })).toHaveValue('DEMO-TEMP-001');
  await page.getByRole('button', { name: 'Initiate simulated acquisition' }).click();
  await expect(page.getByRole('button', { name: 'Review & save result' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '36.6 °C', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Arms & movement', exact: true }).locator('text').click();
  const view = page.getByRole('region', { name: 'Crew body view' });
  await expect(view.getByText('Body temperature', { exact: true })).toBeVisible();
  if (previous) {
    // Restart retains saved reports. The unsaved acquisition must not replace one.
    await expect(view).toContainText(new Date(previous.acquired_at).toISOString().slice(11, 19) + ' UTC');
  } else {
    await expect(view.getByText('NOT AVAILABLE', { exact: true })).toBeVisible();
    await expect(view.getByText('36.6 °C', { exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Examinations', exact: true }).click();
  await page.getByRole('button', { name: 'Review & save result' }).click();
  await expect(page.getByRole('button', { name: 'Export synthetic report' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Body temperature', exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Arms & movement', exact: true }).locator('text').click();
  await expect(view.getByText('36.6 °C', { exact: true })).toBeVisible();
  await expect(view.getByText('°C', { exact: true })).toBeVisible();
  await expect(view.getByText(/DEMO-TEMP-001/)).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Arms & movement', exact: true }).locator('text').click();
  await expect(view.getByText('36.6 °C', { exact: true })).toBeVisible();
});
