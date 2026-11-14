import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const API = 'http://127.0.0.1:18000/api/v1';
test.beforeEach(async ({request,page}) => {
  const state = await (await request.get(`${API}/demo/control`)).json();
  const reset = await request.post(`${API}/demo/control`,{data:{action:'RESTART',expected_revision:state.revision,scenario:'REST',fault:'NONE',seed:42,speed:1,astronaut_id:'DEMO-CREW-001'}});
  expect(reset.ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(4);
});

test('complete examination is acquired from Rust, saved, exported and retrieved after reload', async ({page}) => {
  await page.getByRole('button',{name:'Examinations',exact:true}).click();
  await page.getByRole('button',{name:'Initiate simulated acquisition'}).click();
  await expect(page.getByRole('button',{name:'Review & save result'})).toBeVisible();
  await expect(page.getByRole('cell',{name:'118.0 mmHg',exact:true})).toBeVisible();
  await page.getByRole('textbox',{name:'Demo review note'}).fill('E2E synthetic review; not a clinical report');
  await page.getByRole('button',{name:'Review & save result'}).click();
  await expect(page.getByText('Examination saved to local history')).toBeVisible();
  await expect(page.getByRole('button',{name:'Export synthetic report'})).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button',{name:'Export synthetic report'}).click();
  expect((await downloadPromise).suggestedFilename()).toContain('SIMULATED.json');
  await mkdir('../artifacts/screenshots',{recursive:true});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.screenshot({path:'../artifacts/screenshots/examination-laptop.png',fullPage:true});
  await page.reload();
  await page.getByRole('button',{name:'Examinations',exact:true}).click();
  await page.getByRole('button',{name:'View report'}).first().click();
  await expect(page.getByText(/E2E synthetic review; not a clinical report/)).toBeVisible();
});

test('crew selection, individual baselines and every navigation destination work', async ({page}) => {
  await page.getByRole('combobox',{name:'Selected crew'}).selectOption('DEMO-CREW-002');
  await page.getByRole('button',{name:'Crew profiles'}).click();
  await expect(page.getByText('72 beats/min',{exact:true})).toBeVisible();
  for (const name of ['Equipment','Live monitoring','Nutrition','Fitness','EVA operations','Alerts','Simulator controls','Risk monitoring']) {
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
    if (name === 'Equipment' || name === 'Live monitoring') {
      if (name === 'Live monitoring') await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(4);
      await mkdir('../artifacts/screenshots',{recursive:true});
      await page.screenshot({path:`../artifacts/screenshots/${name === 'Equipment' ? 'equipment' : 'live-monitoring'}-laptop.png`,fullPage:true});
    }
  }
  await expect(page.getByRole('navigation',{name:'Health risk categories'}).getByRole('button')).toHaveCount(11);
  await page.getByRole('button',{name:/VisionTrack/}).click();
  await expect(page.getByText(/No OCT, tonometry or vision-test adapter is configured/).first()).toBeVisible();
});

test('pause freezes model time, resume continues, and exercise/recovery change smoothly', async ({page,request}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByRole('button',{name:'Pause simulation'}).click();
  await expect.poll(async () => (await (await request.get(`${API}/demo/control`)).json()).worker_state).toBe('PAUSED');
  const paused = (await (await request.get(`${API}/demo/control`)).json()).simulated_at;
  await page.waitForTimeout(1400);
  expect((await (await request.get(`${API}/demo/control`)).json()).simulated_at).toBe(paused);
  await page.getByRole('button',{name:'Mission dashboard',exact:true}).click();
  await expect(page.locator('.metric-card .status').filter({hasText:/^(STALE|DISCONNECTED)$/})).toHaveCount(4);
  await expect(page.locator('.metric-card .status').filter({hasText:/^DISCONNECTED$/})).toHaveCount(4);
  await expect(page.locator('.ecg-chart').getByText('DISCONNECTED',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByRole('button',{name:'Resume simulation'}).click();
  await page.getByLabel('Scenario for selected crew').selectOption('EXERCISE');
  await page.getByLabel('Simulation speed').selectOption('4');
  await expect.poll(async () => {
    const summaries = await (await request.get(`${API}/crew/summaries`)).json();
    return summaries[0].readings.find((r:{code:string}) => r.code === 'heart_rate').value;
  }).toBeGreaterThan(68.5);
  await page.getByLabel('Scenario for selected crew').selectOption('RECOVERY');
  await expect.poll(async () => (await (await request.get(`${API}/demo/control`)).json()).scenario).toBe('RECOVERY');
});

test('sensor disconnect is explicit and last values never stay live', async ({page}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByLabel('Synthetic sensor / anomaly fault').selectOption('DISCONNECT');
  await page.getByRole('button',{name:'Mission dashboard',exact:true}).click();
  await expect(page.locator('.metric-card .status').filter({hasText:/^DISCONNECTED$/})).toHaveCount(4);
  await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(0);
  await page.getByRole('button',{name:'Equipment',exact:true}).click();
  await expect(page.locator('.panel').filter({hasText:'DEMO-SUIT-001'}).getByText('DISCONNECTED',{exact:true})).toBeVisible();
});

test('meal logging updates inventory and exercise creates a durable history', async ({page}) => {
  await page.getByRole('button',{name:'Nutrition',exact:true}).click();
  await page.getByRole('button',{name:'Log meal',exact:true}).click();
  await expect(page.getByText('Meal logged and inventory updated')).toBeVisible();
  await expect(page.getByRole('cell',{name:'Oat & berry breakfast SIMULATED'})).toBeVisible();
  await page.getByRole('button',{name:'Fitness',exact:true}).click();
  await page.getByRole('button',{name:'Start exercise session'}).click();
  await expect(page.getByRole('button',{name:'Finish session & recover'})).toBeVisible();
  await page.getByRole('button',{name:'Finish session & recover'}).click();
  await expect(page.getByText('COMPLETED',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Fitness',exact:true}).click();
  await expect(page.getByText('COMPLETED',{exact:true})).toBeVisible();
});

test('EVA checklist gates a real saved timeline', async ({page}) => {
  await page.getByRole('button',{name:'EVA operations',exact:true}).click();
  await page.getByRole('button',{name:'Prepare EVA demonstration'}).click();
  const start = page.getByRole('button',{name:'Start EVA demonstration'});
  await expect(start).toBeDisabled();
  const checkboxes = page.locator('.checklist').getByRole('checkbox');
  for (let i = 0; i < 5; i++) { await checkboxes.nth(i).check(); await expect(checkboxes.nth(i)).toBeEnabled(); }
  await start.click();
  await page.getByRole('button',{name:'Complete EVA demonstration'}).click();
  await expect(page.getByText('EVA demonstration completed',{exact:true}).first()).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'EVA operations',exact:true}).click();
  await expect(page.getByText('EVA demonstration completed',{exact:true}).first()).toBeVisible();
});

test('gradual anomalies create prioritized evidence and acknowledgment persists', async ({page}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByLabel('Simulation speed').selectOption('4');
  await page.getByLabel('Synthetic sensor / anomaly fault').selectOption('BOTH');
  await page.getByRole('button',{name:'Alerts',exact:true}).click();
  await expect(page.locator('.alert-record.priority-1').first()).toBeVisible({timeout:30000});
  await expect(page.locator('.alert-record').filter({hasText:'oxygen-decrease'}).first()).toBeVisible({timeout:30000});
  await page.locator('.alert-record.priority-1').first().getByRole('button',{name:'Acknowledge demo alert'}).click();
  await expect(page.locator('.alert-record.priority-1').first().getByText('ACKNOWLEDGED',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Alerts',exact:true}).click();
  await expect(page.locator('.alert-record.priority-1').first().getByText('ACKNOWLEDGED',{exact:true})).toBeVisible();
});
