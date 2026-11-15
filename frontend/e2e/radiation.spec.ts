import { test, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18000/api/v1';

test('vehicle radiation streams independently of crew, freezes on pause and resets on restart', async ({ page, request }) => {
  const state = await (await request.get(`${API}/demo/control`)).json();
  const restart = await request.post(`${API}/demo/control`, { data: { action: 'RESTART', expected_revision: state.revision, seed: 42 } });
  expect(restart.ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  const sensors = page.getByRole('table', { name: 'Vehicle radiation sensors' });
  await expect(sensors.getByText('LIVE', { exact: true })).toHaveCount(3);
  await expect(sensors.getByText('No reading received')).toHaveCount(0);
  const running = await (await request.get(`${API}/demo/control`)).json();
  const pause = await request.post(`${API}/demo/control`, { data: { action: 'PAUSE', expected_revision: running.revision } });
  expect(pause.ok()).toBeTruthy();
  const before = await (await request.get(`${API}/vehicle/radiation`)).json();
  await expect(sensors.getByText('DISCONNECTED', { exact: true })).toHaveCount(3);
  const frozen = await (await request.get(`${API}/vehicle/radiation`)).json();
  expect(frozen.simulated_at).toBe(before.simulated_at);
  expect(frozen.readings.map((r: { accumulated_dose_mgy: number }) => r.accumulated_dose_mgy)).toEqual(before.readings.map((r: { accumulated_dose_mgy: number }) => r.accumulated_dose_mgy));
  const shared = await sensors.textContent();
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-002');
  await expect(sensors).toHaveText(shared!);
  const restartAgain = await request.post(`${API}/demo/control`, { data: { action: 'RESTART', expected_revision: (await pause.json()).revision } });
  expect(restartAgain.ok()).toBeTruthy();
  const newRun = (await restartAgain.json()).run_id;
  await expect.poll(async () => {
    const latest = await (await request.get(`${API}/vehicle/radiation`)).json();
    return latest.run_id === newRun && latest.simulated_at > 0;
  }).toBe(true);
  await expect(sensors.getByText('LIVE', { exact: true })).toHaveCount(3);
});
