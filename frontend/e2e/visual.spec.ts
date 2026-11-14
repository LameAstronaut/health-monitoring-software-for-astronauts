import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('dashboard is readable and fits laptop, desktop and tablet widths', async ({page,request}, testInfo) => {
  const api = 'http://127.0.0.1:18000/api/v1';
  const control = await (await request.get(`${api}/demo/control`)).json();
  await request.post(`${api}/demo/control`,{data:{action:'RESTART',expected_revision:control.revision,scenario:'REST',fault:'NONE',speed:1,seed:42,astronaut_id:'DEMO-CREW-001'}});
  for (const alert of await (await request.get(`${api}/alerts`)).json()) {
    if (alert.state === 'PENDING_REVIEW') await request.post(`${api}/alerts/${alert.id}/acknowledge`);
  }
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Mission dashboard',exact:true})).toBeVisible();
  await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(6);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to medical workspace'})).toBeFocused();
  await page.getByRole('button',{name:'Live monitoring',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{level:1,name:'Live monitoring',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mission dashboard',exact:true}).focus();
  await page.keyboard.press('Enter');
  const sizes = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth > innerWidth + 1,
    body:parseFloat(getComputedStyle(document.body).fontSize),
    heading:parseFloat(getComputedStyle(document.querySelector('h1')!).fontSize),
    metric:parseFloat(getComputedStyle(document.querySelector('.metric-value')!).fontSize),
    buttons:[...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().width > 0)
      .every(b => b.getBoundingClientRect().height >= 55.5),
  }));
  expect(sizes.overflow).toBe(false);
  expect(sizes.body).toBeGreaterThanOrEqual(18);
  expect(sizes.heading).toBeGreaterThanOrEqual(28);
  expect(sizes.metric).toBeGreaterThanOrEqual(48);
  expect(sizes.buttons).toBe(true);
  await mkdir('../artifacts/screenshots',{recursive:true});
  await page.screenshot({path:`../artifacts/screenshots/dashboard-${testInfo.project.name}.png`,fullPage:true});
  await page.screenshot({path:`../artifacts/screenshots/dashboard-${testInfo.project.name}-viewport.png`});
  const latest = await (await request.get(`${api}/demo/control`)).json();
  const restarted = await (await request.post(`${api}/demo/control`,{data:{action:'RESTART',expected_revision:latest.revision,scenario:'ANOMALY',speed:4,astronaut_id:'DEMO-CREW-001'}})).json();
  await request.post(`${api}/demo/control`,{data:{action:'CONFIGURE',expected_revision:restarted.revision,fault:'PRESSURE'}});
  const dialog = page.getByRole('alertdialog',{name:/Alex Morgan/});
  await expect(dialog).toBeVisible({timeout:30000});
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(page.viewportSize()!.width);
  expect(bounds?.height).toBe(page.viewportSize()!.height);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const acknowledge = dialog.getByRole('button',{name:'Acknowledge',exact:true});
  await expect(acknowledge).toBeInViewport();
  expect((await acknowledge.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await page.screenshot({path:`../artifacts/screenshots/critical-alert-${testInfo.project.name}.png`,animations:'disabled'});
  await acknowledge.click();
  await expect(dialog).not.toBeVisible();
});
