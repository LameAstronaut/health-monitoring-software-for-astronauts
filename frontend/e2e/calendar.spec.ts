import { test, expect } from './fixtures';

test('prescheduled examinations sync with tasks and due reminders and cannot be edited by crew', async ({ page, request }) => {
  const api = 'http://127.0.0.1:18000/api/v1';
  const control = await (await request.get(`${api}/demo/control`)).json();
  await request.post(`${api}/demo/control`, { data: { action: 'RESTART', expected_revision: control.revision, astronaut_id: 'DEMO-CREW-001' } });
  const now = (await (await request.get(`${api}/health`)).json()).server_time;
  // Seed a due fixture through the existing operations API, outside the crew UI.
  await request.post(`${api}/examination-plans`, { data: {
    astronaut_id: 'DEMO-CREW-001', kind: 'BODY_TEMPERATURE',
    scheduled_at: now, notes: 'Crew A thermometer',
  } });
  await page.goto('/');
  const calendar = page.getByRole('region', { name: 'Weekly examination calendar for Alex Morgan', exact: true });
  const appointment = calendar.getByRole('listitem').filter({ hasText: 'Crew A thermometer' });
  await expect(appointment).toContainText('Body temperature');
  for (const name of [/Schedule examination/, /Plan exam/, /Reschedule/, /Cancel plan/]) {
    await expect(calendar.getByRole('button', { name })).toHaveCount(0);
  }
  const tasks = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Upcoming tasks', exact: true }) });
  const temperatureTasks = tasks.getByText('Body temperature examination', { exact: true });
  await expect(temperatureTasks.first()).toBeVisible();
  const initialTemperatureTasks = await temperatureTasks.count();
  const operations = await (await request.get(`${api}/operations`)).json();
  const todayExams = operations.exam_plans.filter((plan: { astronaut_id: string; status: string; scheduled_at: string; kind: string }) =>
    plan.astronaut_id === 'DEMO-CREW-001' && plan.status === 'PLANNED' && plan.kind === 'BODY_TEMPERATURE' && plan.scheduled_at.slice(0, 10) === now.slice(0, 10));
  expect(initialTemperatureTasks).toBe(todayExams.length);
  const reminders = page.getByRole('region', { name: 'Examinations due' });
  // The reminders use a labelled section inside an accessible live status region.
  await expect(reminders).toContainText('Body temperature');
  const initialTemperatureReminders = await reminders.getByText(/Body temperature/).count();
  await reminders.getByRole('button', { name: 'Open examinations' }).click();
  await expect(page.getByRole('heading', { name: 'Examinations', exact: true })).toBeVisible();
  await expect(appointment.getByRole('button', { name: 'Start examination', exact: true })).toBeEnabled();
  await appointment.getByRole('button', { name: 'Start examination', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review & save result', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review & save result', exact: true }).click();
  await expect(appointment).toContainText('COMPLETED');
  await expect(reminders.getByText(/Body temperature/)).toHaveCount(initialTemperatureReminders - 1);
  await page.getByRole('button', { name: 'Mission dashboard', exact: true }).click();
  await expect(temperatureTasks).toHaveCount(initialTemperatureTasks - 1);
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-002');
  await expect(page.getByText('Crew A thermometer')).toHaveCount(0);
  for (const width of [1920, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(false);
  }
});

test('crew body images match the selected crew', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  for (const [crewId, image] of [
    ['DEMO-CREW-001', '/assets/astronaut-body-realistic.png'],
    ['DEMO-CREW-002', '/assets/astronaut-body-male.png'],
    ['DEMO-CREW-003', '/assets/astronaut-body-male.png'],
  ]) {
    await page.getByRole('combobox', { name: 'Selected crew' }).selectOption(crewId);
    const body = page.locator('.body-image');
    await expect(body).toHaveAttribute('src', image);
    await expect(body).toBeVisible();
    await expect.poll(() => body.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.locator(".body-figure").screenshot({ path: testInfo.outputPath(`${crewId}-body.png`) });
  }
});
