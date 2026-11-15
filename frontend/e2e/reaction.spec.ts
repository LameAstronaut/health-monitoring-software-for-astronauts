import { test, expect } from './fixtures';

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
  const averageText = await results.locator('dt').filter({ hasText: /^Average reaction time$/ }).locator('..').locator('dd').innerText();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(area).toBeFocused();
  await page.getByRole('button', { name: 'Stop test' }).click();
  await expect(area).toContainText('Test stopped');
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  const headResult = page.locator('.body-map').getByLabel('Average reaction time', { exact: true });
  await expect(headResult).toContainText('ms');
  await expect(headResult.locator('b')).toHaveText(averageText);
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-002');
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await expect(headResult).toContainText('NOT AVAILABLE');
  await page.getByRole('combobox', { name: 'Selected crew' }).selectOption('DEMO-CREW-001');
  await page.reload();
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await expect(headResult).toContainText('ms');
  await expect(headResult.locator('b')).toHaveText(averageText);
});


test('head region has no launch button and reaction practice remains in Sensorimotor Adaptation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Risk monitoring', exact: true }).click();
  await page.getByRole('button', { name: 'Head & eyes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Open reaction test', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Average reaction time', { exact: true })).toContainText('NOT AVAILABLE');
  await page.getByRole('button', { name: /Sensorimotor Adaptation/ }).click();
  await expect(page.getByRole('button', { name: /Sensorimotor Adaptation/ })).toHaveAttribute('aria-pressed', 'true');
  const start = page.getByRole('button', { name: 'Start reaction test', exact: true });
  await start.click();
  await expect(page.getByRole('group', { name: 'Spacebar reaction test area' })).toContainText('WAIT FOR THE CUE');
  await page.getByRole('button', { name: 'Stop test' }).click();
});
