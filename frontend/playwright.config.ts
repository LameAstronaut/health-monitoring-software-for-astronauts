import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const python = existsSync('../backend/.venv/bin/python') ? resolve('../backend/.venv/bin/python') : 'python';
export default defineConfig({
  testDir:'./e2e', fullyParallel:false, workers:1, timeout:45000,
  expect:{timeout:10000}, reporter:'list',
  use:{baseURL:'http://127.0.0.1:15173', browserName:'chromium', trace:'retain-on-failure', screenshot:'only-on-failure'},
  projects:[
    {name:'laptop', use:{viewport:{width:1366,height:768}}},
    {name:'desktop', testMatch:'visual.spec.ts', use:{viewport:{width:1920,height:1080}}},
    {name:'tablet', testMatch:'visual.spec.ts', use:{viewport:{width:1024,height:768}}},
  ],
  webServer:{command:`${python} ../scripts/e2e_server.py`, url:'http://127.0.0.1:15173/api/v1/health', timeout:45000,
    reuseExistingServer:false, gracefulShutdown:{signal:'SIGTERM',timeout:10000}},
});
