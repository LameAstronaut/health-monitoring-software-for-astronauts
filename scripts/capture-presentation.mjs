/** Capture actual app workflows in a disposable demo stack; no UI modifications. */
import { chromium } from '../frontend/node_modules/playwright/index.mjs';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'artifacts/presentation');
const python = join(root, 'backend/.venv/bin/python');
const base = 'http://127.0.0.1:15173';
const logDir = await mkdtemp(join(tmpdir(), 'memento-presentation-'));
const log = createWriteStream(join(logDir, 'capture.log'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let stack;
const shots = [];

async function api(route, data) {
  const response = await fetch(`${base}/api/v1/${route}`, {
    method: data ? 'POST' : 'GET',
    headers: data ? { 'Content-Type': 'application/json' } : {},
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}

async function until(check, description, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  const occupied = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
  if (occupied) throw new Error('Port 15173 is already in use; stop the test stack before capture.');
  await mkdir(output, { recursive: true });
  stack = spawn(python, [join(root, 'scripts/e2e_server.py')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  stack.stdout.pipe(log);
  stack.stderr.pipe(log);
  stack.on('error', error => console.error(error.message));
  await until(async () => {
    if (stack.exitCode !== null) throw new Error(`Demo stack exited: ${stack.exitCode}; log: ${logDir}`);
    try { return (await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(1000) })).ok; }
    catch { return false; }
  }, 'isolated demo stack', 45000);
  const initial = await api('demo/control');
  await api('demo/control', { action: 'RESTART', expected_revision: initial.revision,
    astronaut_id: 'DEMO-CREW-001', scenario: 'REST', seed: 42, speed: 1 });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(base);
  await until(async () => await page.locator('.crew-summary').count() === 3 &&
    await page.locator('.metric-card .status-live').count() >= 6, 'live crew telemetry');

  const navigate = async name => {
    await page.getByRole('button', { name, exact: true }).click();
    await page.getByRole('heading', { name, level: 1, exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  const capture = async (file, title, caption, focus) => {
    if (focus) {
      await focus.evaluate(el => window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + scrollY - 16)));
    } else await page.evaluate(() => window.scrollTo(0, 0));
    // Refresh Chromium's full viewport raster after large scrolls, including fixed navigation.
    await page.setViewportSize({ width: 1920, height: 1081 });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(async () => {
      document.querySelector('.sidebar').scrollTop = 0;
      await document.fonts.ready;
      await Promise.all([...document.images].map(img => img.decode().catch(() => {})));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await delay(100);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `Overflow: ${title}`);
    await page.mouse.move(1910, 1070);
    await page.screenshot({ path: join(output, file), fullPage: false, animations: 'disabled', caret: 'hide' });
    const bytes = await readFile(join(output, file));
    assert.equal(bytes.readUInt32BE(16), 1920);
    assert.equal(bytes.readUInt32BE(20), 1080);
    shots.push({ file, title, caption });
    console.log(`Captured ${file}`);
  };

  // Populate a real saved check-in through the normal interface.
  await page.getByRole('button', { name: /^Mood for Alex Morgan:/ }).click();
  await page.getByRole('slider', { name: 'Mood', exact: true }).press('End');
  await page.getByRole('button', { name: 'Submit mood', exact: true }).click();
  await page.getByRole('button', { name: /^Mood for Alex Morgan: Happy/ }).waitFor();

  // Complete the actual 30-second practice test, preserving realistic browser timings.
  await navigate('Risk monitoring');
  await page.getByRole('button', { name: /NeuroAdapt/ }).click();
  await page.getByRole('button', { name: 'Start reaction test', exact: true }).click();
  const area = page.getByRole('group', { name: 'Spacebar reaction test area' });
  const deadline = Date.now() + 35000;
  while (!await area.getByText('Test complete', { exact: true }).isVisible()) {
    if (Date.now() > deadline) throw new Error('Reaction practice did not complete');
    if (await area.getByText('PRESS SPACE', { exact: true }).isVisible()) {
      await delay(180);
      await page.keyboard.press('Space');
    } else await delay(100);
  }
  await page.getByLabel('Reaction test results', { exact: true }).waitFor();
  await capture('07-reaction-practice.png', 'Reaction practice',
    'A completed 30-second browser practice test records response times for the selected crew member.',
    page.locator('section.panel').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }));

  await navigate('Mission dashboard');
  await capture('01-mission-dashboard.png', 'Mission dashboard',
    'A shared mission overview brings crew status, current physiological readings, and the daily mood check-in together.');

  await navigate('Live monitoring');
  await page.getByRole('heading', { name: 'Continuous ECG waveform', exact: true }).waitFor();
  await until(async () => await page.locator('.ecg-chart polyline').count() > 0, 'ECG waveform');
  await capture('02-live-telemetry.png', 'Live telemetry & ECG',
    'Time-stamped telemetry trends and a separate continuous synthetic ECG support traceable observation.',
    page.getByRole('heading', { name: 'Longitudinal telemetry', exact: true }).locator('..').locator('..'));

  await navigate('Risk monitoring');
  await until(async () => await page.getByRole('table', { name: 'Vehicle radiation sensors' }).getByText('LIVE', { exact: true }).count() === 3, 'vehicle radiation sensors');
  await capture('03-vehicle-radiation.png', 'Vehicle radiation monitoring',
    'Cabin, airlock, and shelter sensors report environmental radiation for the vehicle, separate from personal health records.');
  await capture('04-crew-body-map.png', 'Interactive crew body map',
    'An anatomical view links body regions to the selected crew member’s latest available measurements.',
    page.locator('section.body-map'));

  await navigate('Examinations');
  await page.getByRole('button', { name: 'Initiate simulated acquisition', exact: true }).click();
  await page.getByRole('button', { name: 'Review & save result', exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole('textbox', { name: 'Demo review note' }).fill('Presentation demo — synthetic blood-pressure acquisition reviewed.');
  await capture('05-examination-review.png', 'Examination review workflow',
    'A virtual instrument produces an event-based result for explicit review and saving.',
    page.locator('.examination-grid'));
  await page.getByRole('button', { name: 'Review & save result', exact: true }).click();
  await page.getByRole('button', { name: 'Export synthetic report', exact: true }).waitFor();

  await navigate('Equipment');
  await capture('06-instrument-registry.png', 'Instrument registry',
    'A shared registry shows virtual instrument capabilities, crew associations, and acquisition status.');

  await navigate('Mission dashboard');
  await page.getByRole('button', { name: /^Mood for Alex Morgan:/ }).click();
  await capture('08-mood-check-in.png', 'Daily mood check-in',
    'Yellow-and-black mood faces provide a simple, crew-specific daily check-in.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await navigate('Simulator controls');
  await capture('09-simulator-controls.png', 'Reproducible simulation',
    'Playback, scenarios, sensor faults, and a fixed seed support repeatable demonstrations.',
    page.getByRole('heading', { name: 'Playback', exact: true }).locator('..').locator('..').locator('..'));

  const state = await api('demo/control');
  await api('demo/control', { action: 'CONFIGURE', expected_revision: state.revision,
    scenario: 'ANOMALY', fault: 'PRESSURE', manual_values: { suit_pressure: 20 } });
  const alert = page.locator('.alert-takeover.priority-1');
  await alert.waitFor({ timeout: 25000 });
  // Expose the actual audio-enabled state; the captured PNG itself is silent.
  const enable = alert.getByRole('button', { name: 'Enable alert sounds', exact: true });
  if (await enable.count()) await enable.click();
  await alert.getByRole('button', { name: 'Mute alert sounds', exact: true }).waitFor();
  await capture('10-red-alert.png', 'Red alert & response guidance',
    'A simulated suit-pressure anomaly opens a red alert with triggering evidence, response guidance, and audio controls.');
  await alert.getByRole('button', { name: 'Mute alert sounds', exact: true }).click();

  shots.sort((a, b) => a.file.localeCompare(b.file));
  const readme = `# Memento Mori — presentation screenshots\n\n` +
    `Ten lossless PNG screenshots, each **1920 × 1080 (16:9)**. They show the real app using an isolated, seeded demo database.\n\n` +
    `The images preserve the app layout, text, and simulation labels. Reduced motion is enabled for clean captures. No loading placeholders or invented readings are inserted.\n\n` +
    `## Suggested slide order and captions\n\n| Image | Slide title | Suggested caption |\n| --- | --- | --- |\n` +
    shots.map(shot => `| [${shot.file}](${shot.file}) | ${shot.title} | ${shot.caption} |`).join('\n') +
    `\n\nUse the PNG files directly in widescreen slides with **Fit**, preserving the aspect ratio. The overview is a contact sheet for browsing, not a full-size application capture.\n\n` +
    `All physiological and radiation values are simulated fixtures. The reaction practice was driven by browser automation; its results are demonstration data, not a human performance assessment. The screenshots do not establish clinical validity or physical sensor integration.\n\n` +
    `## Recreate\n\nAfter the normal project setup and simulator build, run from the repository root:\n\n\`\`\`sh\nnode scripts/capture-presentation.mjs\n\`\`\`\n\n` +
    `The script starts a disposable local stack on ports 15173/18000, captures real workflows, and shuts it down. Existing demo records are untouched. Chromium must be installed for Playwright.\n`;
  await writeFile(join(output, 'README.md'), readme);

  const overview = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const cards = await Promise.all(shots.map(async shot => `<figure><img src="data:image/png;base64,${(await readFile(join(output, shot.file))).toString('base64')}"><figcaption>${shot.file.slice(0, 2)} · ${shot.title}</figcaption></figure>`));
  await overview.setContent(`<html><head><style>
    *{box-sizing:border-box}body{margin:0;background:#070d18;color:#f0f5fc;font-family:Arial,sans-serif;padding:48px 56px}
    header{display:flex;justify-content:space-between;align-items:end;margin-bottom:28px}h1{font-size:40px;margin:0}p{color:#a4b5ca;margin:0;font-size:20px}
    main{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}figure{margin:0;border:1px solid #2b3e56;border-radius:8px;overflow:hidden;background:#111d2e}
    img{display:block;width:100%;aspect-ratio:16/9}figcaption{padding:12px 14px;font-size:18px;color:#d5dfec}
    </style></head><body><header><div><p>MEMENTO MORI · FLIGHT DECK</p><h1>Presentation screenshots</h1></div><p>10 views · 1920 × 1080 · SIMULATED</p></header><main>${cards.join('')}</main></body></html>`);
  await overview.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
  await overview.screenshot({ path: join(output, 'overview.png') });
  const archive = join(root, 'artifacts/presentation-screenshots.zip');
  const packed = spawnSync(python, ['-c', 'import pathlib,sys,zipfile; folder=pathlib.Path(sys.argv[1]); archive=zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED); [archive.write(p, p.name) for p in sorted(folder.iterdir()) if p.suffix in (".png", ".md")]; archive.close()', output, archive], { encoding: 'utf8' });
  if (packed.status !== 0) throw new Error(packed.stderr || 'Archive creation failed');
  console.log(`Saved 10 screenshots, overview, captions, and archive: ${archive}`);
} catch (error) {
  console.error(`Capture failed. Stack log: ${join(logDir, 'capture.log')}`);
  throw error;
} finally {
  if (browser) await browser.close();
  if (stack && stack.exitCode === null) {
    stack.kill('SIGTERM');
    await Promise.race([new Promise(resolve => stack.once('exit', resolve)), delay(15000)]);
  }
  log.end();
}
