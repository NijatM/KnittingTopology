// Optional targeted native-GPU check: node tests/browser/camera-check.mjs
// Observe real GPU upload matrices without exposing camera/debug state in the app.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.KNITTING_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__qaMatrices = [];
    for (const ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!ctor) continue;
      const proto = ctor.prototype;
      const labels = new WeakMap();
      const get = proto.getUniformLocation,
        upload = proto.uniformMatrix4fv;
      proto.getUniformLocation = function (program, name) {
        const location = get.call(this, program, name);
        if (location) labels.set(location, name);
        return location;
      };
      proto.uniformMatrix4fv = function (location, transpose, data, ...rest) {
        if (location && labels.get(location) === 'modelViewMatrix') {
          window.__qaMatrices.push(Array.from(data));
          if (window.__qaMatrices.length > 500) window.__qaMatrices.shift();
        }
        return upload.call(this, location, transpose, data, ...rest);
      };
    }
  });
  await page.goto(process.env.KNITTING_BASE_URL ?? 'http://127.0.0.1:5173/KnittingTopology/');
  const ready = () =>
    page.locator('.canvas-heading').getByText('Connected geometric network').waitFor();
  await ready();
  await page.getByRole('button', { name: /^Plane / }).click();
  await page.getByRole('button', { name: 'Generate network', exact: true }).click();
  await ready();
  await page.evaluate(() => {
    window.__qaMatrices = [];
  });
  await page.getByTitle('top view', { exact: true }).click();
  await page.waitForFunction(() => window.__qaMatrices.length > 0);
  const top = await page.evaluate(() => window.__qaMatrices.at(-1));
  await page.screenshot({ path: 'tmp/qa/native-plane-top-camera.png' });
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.evaluate(() => {
    window.__qaMatrices = [];
  });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y + 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(() => window.__qaMatrices.length > 0);
  const orbit = await page.evaluate(() => window.__qaMatrices.at(-1));
  const determinant = (m) =>
    m[0] * (m[5] * m[10] - m[9] * m[6]) -
    m[4] * (m[1] * m[10] - m[9] * m[2]) +
    m[8] * (m[1] * m[6] - m[5] * m[2]);
  const distance = (m) => Math.hypot(m[12], m[13], m[14]);
  const summary = (matrix) => ({
    finite: matrix.every(Number.isFinite),
    determinant: determinant(matrix),
    distance: distance(matrix),
    worldYToScreenY: matrix[5],
  });
  const results = { top: summary(top), orbit: summary(orbit), errors };
  if (
    !results.top.finite ||
    !results.orbit.finite ||
    Math.abs(results.top.determinant - 1) > 1e-6 ||
    Math.abs(results.orbit.determinant - 1) > 1e-6 ||
    Math.abs(results.orbit.distance / results.top.distance - 1) > 1e-6 ||
    results.top.worldYToScreenY < 0.99 ||
    results.orbit.worldYToScreenY < 0.99 ||
    errors.length
  ) {
    throw new Error(JSON.stringify(results));
  }
  await page.screenshot({ path: 'tmp/qa/native-plane-top-orbit-camera.png' });
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
