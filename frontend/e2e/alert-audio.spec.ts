import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

declare global { interface Window { __alertToneStarts: number; } }
const API = 'http://127.0.0.1:18000/api/v1';
test.use({ reducedMotion: 'reduce' });

test('red alerts provide gesture-enabled sound, persistent mute, and consistent instrument icons', async ({ page, request }) => {
  await page.addInitScript(() => {
    window.__alertToneStarts = 0;
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const voice = create.call(this);
      const start = voice.start.bind(voice);
      voice.start = (...args) => { window.__alertToneStarts++; start(...args); };
      return voice;
    };
  });
  const current = await (await request.get(`${API}/demo/control`)).json();
  const restarted = await request.post(`${API}/demo/control`, { data: { action: 'RESTART', expected_revision: current.revision, seed: 42, scenario: 'REST', astronaut_id: 'DEMO-CREW-001' } });
  expect(restarted.ok()).toBeTruthy();
  for (const alert of await (await request.get(`${API}/alerts`)).json()) {
    if (alert.state === 'PENDING_REVIEW') await request.post(`${API}/alerts/${alert.id}/acknowledge`);
  }
  await page.goto('/');
  await expect(page.locator('.sidebar nav .app-icon')).toHaveCount(12);
  await expect(page.locator('.metric-card')).toHaveCount(8);
  await expect(page.locator('.crew-summary')).toHaveCount(3);
  await expect(page.locator('.metric-card .status').filter({ hasText: /^LIVE$/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await mkdir('../artifacts/screenshots', { recursive: true });
  await page.screenshot({ path: '../artifacts/screenshots/theme-dashboard.png' });
  const state = await (await request.get(`${API}/demo/control`)).json();
  const warning = await request.post(`${API}/demo/control`, { data: { action: 'CONFIGURE', expected_revision: state.revision, scenario: 'ANOMALY', fault: 'OXYGEN', manual_values: { spo2: 88 } } });
  expect(warning.ok()).toBeTruthy();
  let dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('PRIORITY 2');
  const red = await dialog.evaluate(el => getComputedStyle(el).getPropertyValue('--danger').trim());
  const warningBackground = await dialog.evaluate(el => getComputedStyle(el).backgroundColor);
  await dialog.getByRole('button', { name: 'Enable alert sounds', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__alertToneStarts)).toBeGreaterThan(0);
  await page.screenshot({ path: '../artifacts/screenshots/theme-warning-alert.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Mute alert sounds', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('astra-alert-audio'))).toBe('muted');
  const mutedCount = await page.evaluate(() => window.__alertToneStarts);
  await page.waitForTimeout(12500);
  expect(await page.evaluate(() => window.__alertToneStarts)).toBe(mutedCount);
  await dialog.getByRole('button', { name: 'Enable alert sounds', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__alertToneStarts)).toBeGreaterThan(mutedCount);
  await dialog.getByRole('button', { name: 'Minimize', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const minimizedCount = await page.evaluate(() => window.__alertToneStarts);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__alertToneStarts)).toBe(minimizedCount);
  await page.getByRole('button', { name: 'Mute alert sounds', exact: true }).click();
  const latest = await (await request.get(`${API}/demo/control`)).json();
  const critical = await request.post(`${API}/demo/control`, { data: { action: 'CONFIGURE', expected_revision: latest.revision, scenario: 'ANOMALY', fault: 'PRESSURE', manual_values: { suit_pressure: 20 } } });
  expect(critical.ok()).toBeTruthy();
  dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('PRIORITY 1');
  expect(await dialog.evaluate(el => getComputedStyle(el).getPropertyValue('--danger').trim())).toBe(red);
  // Stop the attention animation before comparing the two base surfaces.
  if (await dialog.getByRole('button', { name: 'Stop flashing' }).count()) await dialog.getByRole('button', { name: 'Stop flashing' }).click();
  expect(await dialog.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(warningBackground);
  const beforeCritical = await page.evaluate(() => window.__alertToneStarts);
  await dialog.getByRole('button', { name: 'Enable alert sounds', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__alertToneStarts)).toBeGreaterThan(beforeCritical);
  await page.screenshot({ path: '../artifacts/screenshots/theme-critical-alert.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Acknowledge', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const acknowledgedCount = await page.evaluate(() => window.__alertToneStarts);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__alertToneStarts)).toBe(acknowledgedCount);
  await page.getByRole('button', { name: 'Mute alert sounds', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('astra-alert-audio'))).toBe('muted');
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Review alert full screen', exact: true }).click();
    const review = page.getByRole('alertdialog');
    expect(await review.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(review.getByRole('button', { name: 'Acknowledge', exact: true })).toBeInViewport();
    await review.getByRole('button', { name: 'Minimize', exact: true }).click();
  }
});
