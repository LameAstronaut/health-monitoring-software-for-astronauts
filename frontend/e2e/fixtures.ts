import { test as base, expect } from '@playwright/test';

const API = 'http://127.0.0.1:18000/api/v1';
export const test = base.extend<{ cleanPlayback: void }>({
  cleanPlayback: [async ({ request }, use) => {
    const control = await (await request.get(`${API}/demo/control`)).json();
    const restarted = await request.post(`${API}/demo/control`, { data: {
      action: 'RESTART', expected_revision: control.revision, scenario: 'REST',
      seed: 42, speed: 1, astronaut_id: 'DEMO-CREW-001',
    } });
    expect(restarted.ok()).toBe(true);
    for (const alert of await (await request.get(`${API}/alerts?limit=500`)).json()) {
      if (alert.state === 'PENDING_REVIEW') {
        expect((await request.post(`${API}/alerts/${alert.id}/acknowledge`)).ok()).toBe(true);
      }
    }
    await use();
  }, { auto: true }],
});
export { expect };
