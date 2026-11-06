import { test as base, expect, type Page, type Download } from '@playwright/test';
import type { ProjectState } from '../../src/core/types';
const test = base.extend<{ mappingErrors: string[] }>({
  mappingErrors: [
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
async function read(download: Download) {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download unavailable');
  let result = '';
  const decoder = new TextDecoder();
  for await (const chunk of stream)
    result += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  return result + decoder.decode();
}
async function save(page: Page) {
  const pending = page.waitForEvent('download');
  await page.getByTitle('Save project JSON (⌘/Ctrl S)', { exact: true }).click();
  const d = await pending;
  return {
    record: JSON.parse(await read(d)) as {
      project: ProjectState;
      methodRecord: { references: { id: string }[]; resultIsStale: boolean };
    },
    path: (await d.path())!,
  };
}
async function setup(page: Page) {
  await page.goto('./');
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.locator('.surface-import > summary').click();
  await page
    .getByLabel('Import surface file', { exact: true })
    .setInputFiles('tests/fixtures/import/bent-rectangle-uv.obj');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('SUPPLIED OBJ UV CHART');
  await expect(page.getByRole('button', { name: 'Generate network', exact: true })).toBeEnabled();
}
async function generate(page: Page) {
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await expect(page.locator('.error-panel')).toHaveCount(0);
}

test('supplied chart generates all six families with physical paths and real guide/picking attachments', async ({
  page,
}) => {
  await setup(page);
  await expect(
    page.getByLabel('Construction', { exact: true }).locator('option[value="n-sided-patch"]')
  ).toBeDisabled();
  await page.getByRole('slider', { name: 'Target spacing', exact: true }).fill('15');
  await generate(page);
  for (const family of ['Quad', 'Dual', 'Ambo', 'Kis', 'Gyro', 'Diagonal']) {
    await page.getByRole('button', { name: family, exact: true }).click();
    await generate(page);
    const p = (await save(page)).record.project;
    expect(p.surface.mapping).toBe('rectangular-obj-uv-v1');
    expect(p.graph!.provenance.parameters.family).toBe(family.toLowerCase());
    expect(p.statistics!.euler).toBe(1);
    expect(p.statistics!.components).toBe(1);
    expect(p.statistics!.surfaceArea).toBeCloseTo((3600 + Math.sqrt(4000) * 60) * 1e-6, 10);
    for (const n of p.graph!.nodes) {
      expect(n.attachment.patch).toBe(0);
      expect(n.attachment.barycentric).toHaveLength(3);
      expect(n.position[2]).toBeCloseTo(-0.01 + Math.max(n.position[0], 0) / 3, 10);
    }
    const nodes = new Map(p.graph!.nodes.map((n) => [n.id, n]));
    for (const e of p.graph!.edges) {
      const a = nodes.get(e.a)!.attachment.uv[0],
        b = nodes.get(e.b)!.attachment.uv[0];
      if ((a < 0.5 && b > 0.5) || (b < 0.5 && a > 0.5))
        expect(e.path!.some((point) => Math.abs(point[0]) < 1e-10)).toBe(true);
    }
  }
  await page.getByRole('button', { name: 'Quad', exact: true }).click();
  await generate(page);
  await page.getByRole('button', { name: 'top', exact: true }).click();
  await page.getByRole('button', { name: 'Draw mode', exact: true }).click();
  const canvas = page.locator('[data-testid="surface-viewer"] canvas');
  const b = await canvas.boundingBox();
  if (!b) throw new Error('Canvas unavailable');
  await page.mouse.move(b.x + b.width * 0.42, b.y + b.height * 0.51);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.58, b.y + b.height * 0.48, { steps: 18 });
  await page.mouse.up();
  const drawn = (await save(page)).record.project;
  expect(drawn.guides).toHaveLength(1);
  expect(drawn.guides[0]!.samples.length).toBeGreaterThan(2);
  for (const s of drawn.guides[0]!.samples) {
    expect(s.attachment.surfaceRevision).toBe(drawn.surface.revision);
    expect(s.attachment.barycentric).toHaveLength(3);
    expect(s.position[2]).toBeCloseTo(-0.01 + Math.max(s.position[0], 0) / 3, 8);
  }
  await generate(page);
  await page.getByRole('tab', { name: 'Topology', exact: true }).click();
  await page.getByRole('button', { name: 'Select mode', exact: true }).click();
  await page.mouse.click(b.x + b.width * 0.53, b.y + b.height * 0.49);
  await expect(page.locator('.selection-card')).toBeVisible();
  const id = await page.locator('.selection-card > code').innerText();
  const graph = (await save(page)).record.project.graph!;
  expect([...graph.nodes, ...graph.cells].some((e) => e.id === id)).toBe(true);
  await page.screenshot({ path: 'tmp/qa/mapped-generated-selection.png', fullPage: true });
});

test('mapped graph round-trips, keeps stale state, exports references and teaches live barycentric interpolation', async ({
  page,
}) => {
  await setup(page);
  await generate(page);
  const original = await save(page);
  expect(original.record.methodRecord.references.map((r) => r.id)).toContain('lipman2014');
  expect(original.record.methodRecord.resultIsStale).toBe(false);
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const lesson = page.getByTestId('mapped-chart-lesson');
  await expect(lesson).toBeVisible();
  await lesson.getByRole('slider', { name: 'Explore chart u', exact: true }).fill('0.75');
  await lesson.getByRole('slider', { name: 'Explore chart v', exact: true }).fill('0.25');
  await expect(lesson).toContainText('UV (0.75, 0.25)');
  expect((await save(page)).record.project).toEqual(original.record.project);
  await expect(
    lesson.getByRole('link', { name: 'Lipman: primary source', exact: false })
  ).toHaveAttribute('href', 'https://doi.org/10.1137/130939754');
  const refs = page.waitForEvent('download');
  await lesson
    .getByRole('button', { name: 'Download current method references', exact: true })
    .click();
  expect(await read(await refs)).toContain('10.1137/130939754');
  await page.getByRole('button', { name: 'Gyro', exact: true }).click();
  const pending = await save(page);
  expect(pending.record.methodRecord.resultIsStale).toBe(true);
  await expect(page.getByTitle('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  expect((await save(page)).record.project.graph).toEqual(original.record.project.graph);
  await page.getByLabel('Load project file').setInputFiles(original.path);
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  expect((await save(page)).record.project.graph).toEqual(original.record.project.graph);
});

test('mapped controls and live learning fit 375px, and an OBJ without a valid chart remains inspection-only', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await setup(page);
  await generate(page);
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  await expect(page.getByTestId('mapped-chart-lesson')).toBeVisible();
  expect(
    await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
  ).toEqual({ document: 375, body: 375 });
  await page.screenshot({ path: 'tmp/qa/mapped-mobile-375.png', fullPage: true });
  await page
    .getByLabel('Import surface file', { exact: true })
    .setInputFiles('tests/fixtures/import/offset-plane.obj');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspection only', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Draw mode', exact: true })).toBeDisabled();
  await expect(page.getByTestId('uv-mapping-status')).toContainText('UV');
});
