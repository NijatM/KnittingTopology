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
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
async function textOf(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Missing download stream.');
  const pieces: Uint8Array[] = [];
  for await (const p of stream)
    pieces.push(typeof p === 'string' ? new TextEncoder().encode(p) : p);
  const bytes = new Uint8Array(pieces.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of pieces) {
    bytes.set(p, offset);
    offset += p.length;
  }
  return new TextDecoder().decode(bytes);
}
async function file(page: Page, label: string) {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return JSON.parse(await textOf(await waiting));
}
async function ready(page: Page) {
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
}
test('cube cut preset, actual edge editing, invalid draft, undo, cancellation and export', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as unknown as { cutTerminations: number }).cutTerminations = 0;
    window.Worker = class extends NativeWorker {
      override terminate() {
        (window as unknown as { cutTerminations: number }).cutTerminations++;
        super.terminate();
      }
    };
  });
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: /^Cube / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await ready(page);
  const original = await file(page, 'Save');
  await page.getByRole('button', { name: 'Cube cross-net cut', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect cut and seams', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cut topology result' })).toContainText(
    'Validated disk'
  );
  const exportButton = page.getByRole('button', { name: 'Seam map JSON', exact: true });
  await expect(exportButton).toBeEnabled();
  const seam = await file(page, 'Seam map JSON');
  expect(seam).toMatchObject({
    format: 'knitting-topology-seam-map',
    version: 1,
    units: 'm',
    statistics: { components: 1, boundaryComponents: 1, euler: 1 },
  });
  expect(seam.boundary.length).toBe(seam.seams.length * 2);
  const project = await file(page, 'Save');
  expect(project.project.graph).toEqual(original.project.graph);
  expect(project.project.knit.cut.edgeIds).toHaveLength(seam.seams.length);
  expect(project.project.knit.cut).not.toHaveProperty('complex');
  await page
    .getByRole('button', { name: `Inspect seam ${seam.seams[0].sourceEdgeId}`, exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Selected seam pair' })).toBeVisible();
  const citationWaiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Cut citation BibTeX', exact: true }).click();
  expect(await textOf(await citationWaiting)).toContain('@article{erickson2004cut');
  await page.screenshot({ path: 'tmp/qa/m4a-cube-cuts.png', fullPage: true });
  await page.getByRole('button', { name: 'Edit cut edges in viewer', exact: true }).click();
  const canvas = page.locator('[data-testid="surface-viewer"] canvas'),
    box = (await canvas.boundingBox())!;
  const status = page.locator('.cut-controls .knit-status'),
    before = await status.innerText();
  let edited = false;
  for (const [x, y] of [
    [0.5, 0.5],
    [0.45, 0.45],
    [0.55, 0.45],
    [0.4, 0.55],
    [0.6, 0.55],
    [0.5, 0.4],
    [0.5, 0.6],
  ]) {
    await page.mouse.click(box.x + box.width * x!, box.y + box.height * y!);
    if ((await status.innerText()) !== before) {
      edited = true;
      break;
    }
  }
  expect(edited, 'A real visible network edge was toggled').toBe(true);
  await page.getByRole('button', { name: 'Stop editing cut edges', exact: true }).click();
  await expect(exportButton).toBeDisabled();
  await expect(page.locator('.cut-panel')).toContainText('Current draft is unvalidated');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(exportButton).toBeEnabled();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(exportButton).toBeDisabled();
  await page.getByRole('button', { name: 'New empty cut draft', exact: true }).click();
  await page.getByRole('button', { name: 'Validate cut draft', exact: true }).click();
  await expect(page.locator('.cut-controls [role="alert"]')).toContainText('at least one cut edge');
  await expect(exportButton).toBeDisabled();
  const terminations = await page.evaluate(
    () => (window as unknown as { cutTerminations: number }).cutTerminations
  );
  await page.evaluate(async () => {
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Validate cut draft')!
      .click();
    await Promise.resolve();
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Cancel cut validation')!
      .click();
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { cutTerminations: number }).cutTerminations)
    )
    .toBe(terminations + 1);
  await expect(
    page.getByRole('button', { name: 'Cancel cut validation', exact: true })
  ).toHaveCount(0);
  await expect(page.locator('.cut-panel')).toContainText('Previous validation shown');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(exportButton).toBeEnabled();
  const beforeSourceChange = await page.evaluate(
    () => (window as unknown as { cutTerminations: number }).cutTerminations
  );
  await page.evaluate(async () => {
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Validate cut draft')!
      .click();
    await Promise.resolve();
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim().startsWith('Sphere'))!
      .click();
  });
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { cutTerminations: number }).cutTerminations)
    )
    .toBe(beforeSourceChange + 1);
  await expect(exportButton).toHaveCount(0);
});
test('sphere meridian, saved draft revalidation, source change and narrow layout', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await page.getByRole('button', { name: 'Sphere meridian cut', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect cut and seams', exact: true }).click();
  const exportButton = page.getByRole('button', { name: 'Seam map JSON', exact: true });
  await expect(exportButton).toBeEnabled();
  const result = await file(page, 'Seam map JSON');
  expect(result.statistics).toMatchObject({ euler: 1, boundaryComponents: 1, branchVertices: 0 });
  await expect(page.locator('.save-dot.saved')).toBeVisible();
  await page.reload();
  await ready(page);
  await page.getByRole('button', { name: 'Inspect cut and seams', exact: true }).click();
  await expect(exportButton).toHaveCount(0);
  await page.getByRole('button', { name: 'Validate cut draft', exact: true }).click();
  await expect(exportButton).toBeEnabled();
  const restored = await file(page, 'Seam map JSON');
  expect(restored.cut).toEqual(result.cut);
  expect(restored.boundary).toEqual(result.boundary);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.getByRole('button', { name: 'Inspect cut and seams', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: 'tmp/qa/m4a-sphere-mobile.png', fullPage: true });
  await page.getByRole('button', { name: /^Cube / }).click();
  await expect(page.locator('.cut-controls')).toContainText('Generate a network first');
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await ready(page);
  await expect(page.locator('.cut-controls')).toContainText('source changed');
  await expect(exportButton).toHaveCount(0);
});
