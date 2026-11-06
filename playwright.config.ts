import { defineConfig } from '@playwright/test';

const hardware = process.env.KNITTING_GPU === 'hardware';
export default defineConfig({
  testDir: './tests/browser',
  outputDir: './tmp/qa/results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'tmp/qa/report', open: 'never' }]],
  use: {
    baseURL: process.env.KNITTING_BASE_URL ?? 'http://127.0.0.1:5173/KnittingTopology/',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath:
        process.env.KNITTING_CHROME ??
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: hardware
        ? ['--no-sandbox']
        : [
            '--no-sandbox',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
          ],
    },
  },
});
