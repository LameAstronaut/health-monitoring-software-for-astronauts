import { test, expect } from './fixtures';

const API = 'http://127.0.0.1:18000/api/v1';

test('zero pulse marks only the affected crew deceased while the dashboard remains usable', async ({ page, request }) => {
  const current = await (await request.get(`${API}/demo/control`)).json();
  await request.post(`${API}/demo/control`, { data: {
    action: 'RESTART', expected_revision: current.revision,
    scenario: 'REST', fault: 'NONE', astronaut_id: 'DEMO-CREW-001',
  } });
  await page.goto('/');
  await expect(page.getByText('API CONNECTED', { exact: true })).toBeVisible();
  const control = await (await request.get(`${API}/demo/control`)).json();
  const response = await request.post(`${API}/demo/control`, { data: {
    action: 'CONFIGURE', expected_revision: control.revision, speed: 4, manual_values: { heart_rate: 0 },
  } });
  expect(response.ok()).toBeTruthy();

  const crew = page.locator('.crew-strip').getByRole('button', { name: /Alex Morgan/ });
  await expect(crew).toContainText('DECEASED');
  await expect(crew).not.toContainText('LIVE');
  const oxygen = page.locator('.metric-card').filter({ has: page.getByRole('heading', { name: 'Oxygen saturation', exact: true }) });
  await expect(oxygen).toContainText('NO SIGNAL');
  await expect(page.locator('.ecg-chart')).toContainText('DECEASED');
  await expect.poll(async () => {
    const summaries = await (await request.get(`${API}/crew/summaries`)).json();
    const readings = summaries.find((summary: {crew: {id: string}}) => summary.crew.id === 'DEMO-CREW-001').readings;
    return readings.filter((reading: { code: string; value: number }) => ['respiratory_rate', 'systolic_bp', 'diastolic_bp'].includes(reading.code)).map((reading: { value: number }) => reading.value);
  }, { timeout: 18000 }).toEqual([0, 0, 0]);
  const waves = await (await request.get(`${API}/waveforms?astronaut_id=DEMO-CREW-001`)).json();
  expect(waves.at(-1).waveform.samples.every((sample: number) => sample === 0)).toBeTruthy();
  const summaries = await (await request.get(`${API}/crew/summaries`)).json();
  const otherCrew = summaries.find((summary: {crew: {id: string}}) => summary.crew.id === 'DEMO-CREW-002');
  expect(otherCrew.readings.find((reading: {code: string}) => reading.code === 'heart_rate').value).toBeGreaterThan(50);
  await page.reload();
  await expect(crew).toContainText('DECEASED');
  await expect(oxygen).toContainText('NO SIGNAL');

  await expect(page.getByText('The End', { exact: true })).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Simulator controls', exact: true }).click();
  await page.getByRole('button', { name: 'Mission dashboard', exact: true }).click();
  await expect(crew).toContainText('DECEASED');

  const beforeRestart = await (await request.get(`${API}/demo/control`)).json();
  await request.post(`${API}/demo/control`, { data: {
    action: 'CONFIGURE', expected_revision: beforeRestart.revision, fault: 'DISCONNECT',
  } });
  await page.getByRole('button', { name: 'Simulator controls', exact: true }).click();
  await expect(page.getByText('Applied: Sensor disconnected')).toBeVisible();
  await page.getByRole('button', { name: 'Restart seeded playback' }).click();
  await expect.poll(async () => (await (await request.get(`${API}/demo/control`)).json()).run_id).not.toBe(beforeRestart.run_id);
  const restarted = await (await request.get(`${API}/demo/control`)).json();
  expect(restarted.fault).toBe('NONE');
  expect(restarted.scenario).toBe('REST');
  expect(restarted.manual_values.heart_rate ?? null).toBeNull();
  await page.getByRole('button', { name: 'Mission dashboard', exact: true }).click();
  await expect(crew).toContainText('LIVE');
  await expect(crew).not.toContainText('DECEASED');
  await expect.poll(async () => {
    const summaries = await (await request.get(`${API}/crew/summaries`)).json();
    return summaries.flatMap((summary: {readings: {code: string; value: number; deceased: boolean; run_id: string}[]}) => summary.readings.filter(reading => reading.code === 'heart_rate')).every((reading: {value: number; deceased: boolean; run_id: string}) => reading.value > 50 && !reading.deceased && reading.run_id === restarted.run_id);
  }).toBeTruthy();
  await expect(oxygen).toContainText('LIVE');
  await expect(oxygen).not.toContainText('NO SIGNAL');
  await expect.poll(async () => {
    const waves = await (await request.get(`${API}/waveforms?astronaut_id=DEMO-CREW-001`)).json();
    return waves.at(-1).run_id === restarted.run_id && waves.at(-1).waveform.samples.some((sample: number) => sample > 0.5);
  }).toBeTruthy();
});
