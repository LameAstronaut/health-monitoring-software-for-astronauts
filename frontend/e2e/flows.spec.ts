import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const API = 'http://127.0.0.1:18000/api/v1';
test.beforeEach(async ({request,page}) => {
  const state = await (await request.get(`${API}/demo/control`)).json();
  const reset = await request.post(`${API}/demo/control`,{data:{action:'RESTART',expected_revision:state.revision,scenario:'REST',fault:'NONE',seed:42,speed:1,astronaut_id:'DEMO-CREW-001'}});
  expect(reset.ok()).toBeTruthy();
  for (const alert of await (await request.get(`${API}/alerts`)).json()) {
    if (alert.state === 'PENDING_REVIEW') await request.post(`${API}/alerts/${alert.id}/acknowledge`);
  }
  await page.goto('/');
  await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(6);
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
      if (name === 'Live monitoring') await expect(page.locator('.metric-card .status').filter({hasText:/^LIVE$/})).toHaveCount(6);
      await mkdir('../artifacts/screenshots',{recursive:true});
      await page.screenshot({path:`../artifacts/screenshots/${name === 'Equipment' ? 'equipment' : 'live-monitoring'}-laptop.png`,fullPage:true});
    }
  }
  const categories = page.getByRole('navigation',{name:'Health risk categories'});
  await expect(categories.getByRole('button')).toHaveCount(9);
  await expect(categories.getByRole('button',{name:/VisionTrack|MicrobiomeAI/})).toHaveCount(0);
  await categories.getByRole('button',{name:/Skeletal Health/}).click();
  await expect(page.getByText(/Structural imaging, bone-turnover markers and mineral panels are unavailable/).first()).toBeVisible();
});

test('pause freezes model time, resume continues, and exercise/recovery change smoothly', async ({page,request}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByRole('button',{name:'Pause simulation'}).click();
  await expect.poll(async () => (await (await request.get(`${API}/demo/control`)).json()).worker_state).toBe('PAUSED');
  const paused = (await (await request.get(`${API}/demo/control`)).json()).simulated_at;
  await page.waitForTimeout(1400);
  expect((await (await request.get(`${API}/demo/control`)).json()).simulated_at).toBe(paused);
  await page.getByRole('button',{name:'Mission dashboard',exact:true}).click();
  await expect(page.locator('.metric-card .status').filter({hasText:/^(STALE|DISCONNECTED)$/})).toHaveCount(7);
  await expect(page.locator('.metric-card .status').filter({hasText:/^DISCONNECTED$/})).toHaveCount(7);
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
  await expect(page.locator('.metric-card .status').filter({hasText:/^DISCONNECTED$/})).toHaveCount(7);
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

test('acute anomalies open full screen, minimize without acknowledgment and retain saved history', async ({page,request}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByLabel('Synthetic sensor / anomaly fault').selectOption('BOTH');
  const dialog = page.getByRole('alertdialog',{name:/Alex Morgan/});
  await expect(dialog).toBeVisible({timeout:20000});
  const control = await (await request.get(`${API}/demo/control`)).json();
  expect((await request.post(`${API}/demo/control`,{data:{action:'PAUSE',expected_revision:control.revision}})).ok()).toBe(true);
  await expect.poll(async () => (await (await request.get(`${API}/demo/control`)).json()).worker_state).toBe('PAUSED');
  await expect(dialog.getByRole('button',{name:'Minimize',exact:true})).toBeFocused();
  expect((await dialog.innerText()).split(/\s+/).length).toBeLessThan(55);
  const bounds = await dialog.boundingBox();
  expect(bounds?.width).toBe(1366);
  expect(bounds?.height).toBe(768);
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button',{name:'Acknowledge',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('region',{name:'Pending simulated alerts'})).toContainText('PRIORITY 1');
  await page.getByRole('button',{name:'Alerts',exact:true}).click();
  await expect(page.locator('.alert-record.priority-1').first().getByText('PENDING REVIEW',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review alert full screen'}).click();
  await expect(dialog).toBeVisible();
  await mkdir('../artifacts/screenshots',{recursive:true});
  await page.screenshot({path:'../artifacts/screenshots/critical-alert-laptop.png',animations:'disabled'});
  await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  const paused = await (await request.get(`${API}/demo/control`)).json();
  expect((await request.post(`${API}/demo/control`,{data:{action:'RESUME',expected_revision:paused.revision}})).ok()).toBe(true);
  await expect(dialog).toBeVisible({timeout:20000});
  await expect(dialog.getByRole('heading',{name:'Oxygen falling'})).toBeVisible();
  await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'Alerts',exact:true}).click();
  await expect(page.locator('.alert-record.priority-1').first().getByText('ACKNOWLEDGED',{exact:true})).toBeVisible();
  await expect(page.locator('.alert-record').filter({hasText:'oxygen-decrease'}).first().getByText('ACKNOWLEDGED',{exact:true})).toBeVisible();
});

test('pulse rises quickly at 1x and every alert opens full screen with controllable flashing', async ({page}) => {
  await page.getByRole('button',{name:'Simulator controls'}).click();
  await page.getByLabel('Synthetic sensor / anomaly fault').selectOption('PULSE_SURGE');
  const dialog = page.getByRole('alertdialog',{name:/Alex Morgan/});
  await expect(dialog).toBeVisible({timeout:20000});
  await expect(dialog.getByRole('heading',{name:'Pulse rising'})).toBeVisible();
  await expect(dialog).toContainText('PRIORITY 2');
  await expect(dialog.locator('.alert-symbol')).toHaveCSS('animation-name','alert-attention');
  await expect(dialog.locator('.alert-symbol')).toHaveCSS('animation-duration','0.5s');
  await expect(dialog.locator('.alert-evidence-value')).toHaveCSS('animation-name','none');
  await expect(dialog.getByText(/Rule pulse-rise/)).not.toBeVisible();
  await dialog.getByRole('button',{name:'Stop flashing'}).click();
  await expect(dialog.locator('.alert-symbol')).toHaveCSS('animation-name','none');
  await dialog.getByRole('button',{name:'Enable flashing'}).click();
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(dialog.locator('.alert-symbol')).toHaveCSS('animation-name','none');
  await expect(dialog.getByRole('button',{name:'Stop flashing'})).toHaveCount(0);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(dialog.locator('.alert-symbol')).toHaveCSS('animation-name','alert-attention');
  await page.screenshot({path:'../artifacts/screenshots/pulse-alert-laptop.png',animations:'disabled'});
  await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel('Synthetic sensor / anomaly fault').selectOption('RESPIRATORY_SURGE');
  await expect(dialog).toBeVisible({timeout:20000});
  await expect(dialog.getByRole('heading',{name:'Breathing rate rising'})).toBeVisible();
  await expect(dialog).toContainText('PRIORITY 1');
  await dialog.getByRole('button',{name:'Acknowledge',exact:true}).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Alerts',exact:true}).click();
  await expect(page.locator('.alert-record').filter({hasText:'respiratory-rise'})).toContainText('ACKNOWLEDGED');
});

test('reference tables import, persist and retain NASA provenance', async ({page}) => {
  await page.getByRole('button', {name:'Data workspace',exact:true}).click();
  await page.getByLabel('Import CSV').setInputFiles({name:'research.csv',mimeType:'text/csv',buffer:Buffer.from('Subject,Temperature\n001,22.5\n002,23.1\n')});
  await page.getByLabel('Dataset identifier').fill('OSD-test-fixture');
  await page.getByLabel('Original NASA source URL').fill('https://osdr.nasa.gov/bio/repo/');
  await page.getByLabel('Column 2 unit').fill('C');
  await page.getByRole('button',{name:'Save reference table'}).click();
  await expect(page.getByText('Table saved. Provenance and checksum recorded.')).toBeVisible();
  await expect(page.getByLabel('Row 1, Subject')).toHaveValue('001');
  await expect(page.getByLabel('Row 1, Subject')).toBeDisabled();
  await page.reload();
  await page.getByRole('button',{name:'Data workspace',exact:true}).click();
  await page.getByRole('button',{name:/research NASA/}).click();
  await expect(page.getByLabel('Column 2 unit')).toHaveValue('C');
  await page.screenshot({path:'../artifacts/screenshots/data-workspace.png',fullPage:true});
});

test('manual editor changes worker readings and 3D body responds to selection', async ({page,request}) => {
  await page.getByRole('button',{name:'Simulator controls',exact:true}).click();
  await page.getByLabel(/Heart rate beats/).fill('88');
  await page.getByRole('button',{name:'Apply readings'}).click();
  await expect(page.getByText('Manual overrides active for this crew.')).toBeVisible();
  await expect.poll(async () => {
    const observations = await (await request.get(`${API}/observations?astronaut_id=DEMO-CREW-001`)).json();
    return observations.filter((o: {code:string}) => o.code === 'heart_rate').at(-1)?.value;
  }).toBe(88);
  await page.getByRole('button',{name:'Risk monitoring',exact:true}).click();
  expect((await page.locator('.body-figure').boundingBox())!.width).toBeGreaterThan(200);
  await page.getByRole('button',{name:'3D schematic',exact:true}).click();
  await page.getByRole('slider',{name:'Rotate body'}).fill('45');
  await page.getByRole('button',{name:'Heart & lungs',exact:true}).click();
  await expect(page.locator('.body-map-measurements')).toContainText('88');
  await page.screenshot({path:'../artifacts/screenshots/body-3d.png',fullPage:true});
});
