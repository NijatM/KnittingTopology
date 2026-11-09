import { test as base, expect, type Page, type Download } from '@playwright/test';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await use(errors);
      expect(errors, 'No browser JavaScript or console errors').toEqual([]);
    },
    { auto: true },
  ],
});
async function textOf(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing download stream.');
  const chunks: Uint8Array[] = [];
  for await (const c of stream)
    chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(out);
}
async function file(page: Page, button: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  return pending;
}
async function ready(page: Page) {
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await expect(page.locator('.error-panel')).toHaveCount(0);
}
async function regenerate(page: Page) {
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await ready(page);
}
async function shapeSetup(page: Page) {
  await page.getByRole('combobox', { name: 'Knit mode', exact: true }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface', exact: true }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not measured gauges or machine specifications.
  await page.getByRole('textbox', { name: 'Stitch width (mm)', exact: true }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
}

test('polar holes: network, meridian-only seam pairs, knit report and stale-domain protection', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  const opening = page.getByRole('slider', { name: 'Pole opening diameter', exact: true });
  const fraction = page.getByRole('slider', { name: 'Sphere fraction', exact: true });
  await expect(opening).toHaveValue('0');
  await expect(fraction).toHaveValue('1');
  await opening.fill('60');
  await expect(page.getByLabel('Sphere domain summary', { exact: true })).toContainText(
    'two open polar rims; no caps'
  );
  await regenerate(page);
  const saved = JSON.parse(await textOf(await file(page, 'Save'))).project;
  expect(saved.surface).toMatchObject({ kind: 'sphere', poleOpeningDiameter: 0.06 });
  expect(saved.statistics.euler).toBe(0);
  expect(
    saved.graph.nodes.every(
      (n: { position: number[] }) =>
        Math.abs(n.position[2]!) <= Math.sqrt(0.09 ** 2 - 0.03 ** 2) + 1e-9
    )
  ).toBe(true);
  await shapeSetup(page);
  await page.getByRole('button', { name: 'Sphere meridian cut', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cut topology result' })).toContainText(
    'Validated disk'
  );
  await page.getByRole('button', { name: 'Inspect cut and seams', exact: true }).click();
  const seam = JSON.parse(await textOf(await file(page, 'Seam map JSON')));
  expect(seam.statistics).toMatchObject({ sourceEuler: 0, euler: 1, boundaryComponents: 1 });
  expect(seam.naturalBoundaries.length).toBeGreaterThan(0);
  expect(seam.boundary.length).toBe(2 * seam.seams.length + seam.naturalBoundaries.length);
  const paired = new Set(seam.seams.map((x: { sourceEdgeId: string }) => x.sourceEdgeId));
  expect(
    seam.naturalBoundaries.every((x: { sourceEdgeId: string }) => !paired.has(x.sourceEdgeId))
  ).toBe(true);
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  const report = page.getByRole('region', { name: 'Shape report' });
  await expect(report).toContainText('Polar rims remain open');
  await expect(report).not.toContainText('Gather the pole');
  const text = await textOf(await file(page, 'Report TXT'));
  expect(text).toContain('target polar opening diameter 60 mm');
  expect(text).toContain('Longest held loop');
  expect(text).toContain('Polar rims are not seam pairs');
  expect(text).toContain('Yarn jumps: 0');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'tmp/qa/sphere-open-rims.png', fullPage: true });
  await opening.fill('80');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toHaveCount(0);
  await expect(page.locator('.canvas-heading')).toContainText('Surface ready');
  await expect(page.getByRole('button', { name: 'Seam map JSON', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(opening).toHaveValue('60');
  await ready(page);
});

test('half-shell: natural boundaries, cut-free knitting, persisted parameters and 375px controls', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('slider', { name: 'Pole opening diameter', exact: true }).fill('60');
  await page.getByRole('slider', { name: 'Sphere fraction', exact: true }).fill('0.5');
  await expect(page.getByLabel('Sphere domain summary', { exact: true })).toContainText('180.0°');
  await expect(page.locator('.cut-controls')).toHaveCount(0);
  await regenerate(page);
  const download = await file(page, 'Save'),
    path = await download.path();
  if (!path) throw new Error('Project path missing.');
  const original = JSON.parse(await textOf(download)).project;
  expect(original.surface).toMatchObject({ sphereFraction: 0.5, poleOpeningDiameter: 0.06 });
  expect(original.statistics.euler).toBe(1);
  await shapeSetup(page);
  await expect(
    page.getByRole('combobox', { name: 'Start edge', exact: true }).locator('option')
  ).toHaveText(['Needle 1 at the bottom rim (default)', 'Needle 1 at the top rim']);
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shape report' })).toContainText(
    'separate natural boundaries'
  );
  const text = await textOf(await file(page, 'Report TXT'));
  expect(text).toContain('180.00°');
  expect(text).toContain(
    'Project construction; not the open-surface distance-contour connection method.'
  );
  expect(text).toContain('Open-sector meridian boundaries');
  expect(text).toContain('Yarn jumps: 0');
  await page.getByRole('combobox', { name: 'Start edge', exact: true }).selectOption('v1');
  await page.getByRole('combobox', { name: 'Knit mode', exact: true }).selectOption('both');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'tmp/qa/sphere-half-shell.png', fullPage: true });
  await page.getByRole('slider', { name: 'Sphere fraction', exact: true }).fill('0.25');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toHaveCount(0);
  await page.getByLabel('Load project file', { exact: true }).setInputFiles(path);
  await ready(page);
  await expect(page.getByRole('slider', { name: 'Sphere fraction', exact: true })).toHaveValue(
    '0.5'
  );
  await expect(
    page.getByRole('slider', { name: 'Pole opening diameter', exact: true })
  ).toHaveValue('60');
  await expect(page.locator('.cut-controls')).toHaveCount(0);
  const restored = JSON.parse(await textOf(await file(page, 'Save'))).project;
  expect(restored.graph).toEqual(original.graph);
  await page.setViewportSize({ width: 375, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(375);
  await page.getByRole('slider', { name: 'Sphere fraction', exact: true }).fill('0.01');
  await expect(page.getByLabel('Sphere domain summary', { exact: true })).toContainText('3.6°');
  await regenerate(page);
  await page.screenshot({ path: 'tmp/qa/sphere-sector-mobile.png', fullPage: true });
});
