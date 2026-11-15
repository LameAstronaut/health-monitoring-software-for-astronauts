import { test, expect } from '@playwright/test';

test('each astronaut has a matching profile portrait', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.crew-strip .avatar img')).toHaveCount(3);
  await page.getByRole('button', { name: 'Crew profiles', exact: true }).click();
  for (const [crewId, name, filename] of [
    ['DEMO-CREW-001', 'Alex Morgan', 'alex-morgan.png'],
    ['DEMO-CREW-002', 'Jordan Lee', 'jordan-lee.png'],
    ['DEMO-CREW-003', 'Sam Rivera', 'sam-rivera.png'],
  ]) {
    await page.getByRole('combobox', { name: 'Selected crew' }).selectOption(crewId);
    const portrait = page.getByRole('img', { name: `Synthetic portrait of ${name}`, exact: true });
    await expect(portrait).toHaveAttribute('src', `/assets/crew/${filename}`);
    await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(portrait).toBeVisible();
    await page.locator('.profile-heading').screenshot({ path: testInfo.outputPath(`${crewId}-profile.png`) });
  }
});
