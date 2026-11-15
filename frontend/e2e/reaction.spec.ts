import { test, expect } from '@playwright/test';

test('Sensorimotor Adaptation runs a 30-second spacebar reaction test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start reaction test' })).toHaveCount(0);
  await page.getByRole('button', { name: /Sensorimotor Adaptation/ }).click();
  await page.getByRole('button', { name: 'Start reaction test' }).click();
  const area = page.getByRole('group', { name: 'Spacebar reaction test area' });
  await expect(area).toBeFocused();
  const started = Date.now();
  let responses = 0;
  while (Date.now() - started < 26_000) {
    await expect(area.getByText('PRESS SPACE', { exact: true })).toBeVisible({ timeout: 4500 });
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    responses += 1;
    await expect(area.getByText('WAIT FOR THE CUE', { exact: true })).toBeVisible();
  }
  await expect(area.getByText('Test complete', { exact: true })).toBeVisible({ timeout: 5000 });
  const results = page.getByLabel('Reaction test results');
  await expect(results).toBeVisible();
  await expect(results.locator('div').filter({ has: page.getByText('Responses', { exact: true }) }).getByRole('definition')).toHaveText(String(responses));
  await expect(results).toContainText('ms');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(area).toBeFocused();
  await page.getByRole('button', { name: 'Stop test' }).click();
  await expect(area).toContainText('Test stopped');
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  const headResult = page.getByLabel('Latest reaction test result');
  await expect(headResult).toContainText('ms');
  await expect(headResult.locator('dt').filter({ hasText: /^Responses$/ }).locator('..').locator('dd')).toHaveText(String(responses));
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-002');
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await expect(headResult).toContainText('No completed reaction test');
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-001');
  await page.reload();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await expect(headResult).toContainText('ms');
  await expect(headResult.locator('dt').filter({ hasText: /^Responses$/ }).locator('..').locator('dd')).toHaveText(String(responses));
});


test('head region opens the Sensorimotor Adaptation reaction test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await page.getByRole('button', { name: 'Open reaction test', exact: true }).click();
  await expect(page.getByRole('button', { name: /Sensorimotor Adaptation/ })).toHaveAttribute('aria-pressed', 'true');
  const start = page.getByRole('button', { name: 'Start reaction test', exact: true });
  await expect(start).toBeFocused();
  await expect(start).toBeInViewport();
  await start.click();
  await expect(page.getByRole('group', { name: 'Spacebar reaction test area' })).toContainText('WAIT FOR THE CUE');
  await page.getByRole('button', { name: 'Stop test' }).click();
});
