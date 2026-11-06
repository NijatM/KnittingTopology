import { test as base, expect, type Download, type Page } from '@playwright/test';
import type { ProjectState } from '../../src/core/types';

const test = base.extend<{ importErrors: string[] }>({
  importErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await use(errors);
      expect(errors, 'Import interactions have no page or console errors').toEqual([]);
    },
    { auto: true },
  ],
});
async function text(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream unavailable');
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of stream)
    result += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  return result + decoder.decode();
}
async function saved(page: Page): Promise<{
  project: ProjectState;
  path: string;
  methodRecord: { basis: string; references: unknown[] };
}> {
  const pending = page.waitForEvent('download');
  await page.getByTitle('Save project JSON (⌘/Ctrl S)', { exact: true }).click();
  const downloaded = await pending,
    record = JSON.parse(await text(downloaded)),
    path = await downloaded.path();
  if (!path) throw new Error('Project download path unavailable');
  return { project: record.project, methodRecord: record.methodRecord, path };
}
async function ready(page: Page) {
  await page.goto('./');
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await page.locator('.surface-import > summary').click();
}
async function importFile(page: Page, filename: string, unit = 'mm') {
  await page
    .getByLabel('Import surface file', { exact: true })
    .setInputFiles(`tests/fixtures/import/${filename}`);
  await page.getByLabel('Source units', { exact: true }).selectOption(unit);
  await page.getByRole('button', { name: `Import as ${unit}`, exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Imported surface · inspection only');
  await expect(page.getByTestId('mesh-inspector')).toBeVisible();
}
function metric(page: Page, label: string) {
  return page
    .getByTestId('mesh-inspector')
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong');
}

test('OBJ units, retained indices, double-sided triangle picking and undoable import', async ({
  page,
}) => {
  await ready(page);
  const before = await saved(page);
  await importFile(page, 'offset-plane.obj');
  const imported = await saved(page);
  const mesh = imported.project.surface.mesh!;
  expect(imported.project.surface.kind).toBe('mesh');
  expect(imported.project.graph).toBeNull();
  expect(imported.project.guides).toEqual([]);
  expect(mesh.source.unit).toBe('mm');
  expect(mesh.source.centerMeters[0]).toBeCloseTo(0.15, 12);
  expect(mesh.source.centerMeters[1]).toBeCloseTo(0.25, 12);
  expect(mesh.source.centerMeters[2]).toBeCloseTo(0.3, 12);
  expect(mesh.positions).toHaveLength(12);
  expect(mesh.indices).toHaveLength(6);
  expect(imported.methodRecord.references).toEqual([]);
  expect(imported.methodRecord.basis).toContain('inspection');
  await expect(metric(page, 'Triangulated area')).toContainText('10,000');
  await expect(metric(page, 'Boundary edges')).toHaveText('4');
  await expect(page.getByRole('button', { name: 'Inspection only', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Draw mode', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'top', exact: true }).click();
  await page.getByRole('button', { name: 'Select mode', exact: true }).click();
  const canvas = page.locator('[data-testid="surface-viewer"] canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Viewer canvas unavailable');
  await page.mouse.click(box.x + box.width * 0.49, box.y + box.height * 0.48);
  const selection = page.getByTestId('mesh-triangle-selection');
  await expect(selection).toBeVisible();
  const triangle = Number(await selection.locator(':scope > code').innerText());
  expect(triangle).toBeGreaterThanOrEqual(0);
  expect(triangle).toBeLessThan(2);
  for (const index of mesh.indices.slice(triangle * 3, triangle * 3 + 3))
    await expect(selection).toContainText(`Vertex ${index}`);
  await page.screenshot({ path: 'tmp/qa/import-plane-selection.png', fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  expect((await saved(page)).project.graph).toEqual(before.project.graph);
  await page.getByRole('button', { name: 'Draw mode', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('mesh-inspector')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orbit mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect((await saved(page)).project.surface).toEqual(imported.project.surface);
});

test('STL ASCII and solid-header binary use explicit scale and preserve mesh projects on reload/import', async ({
  page,
}) => {
  await ready(page);
  await importFile(page, 'triangle.stl', 'in');
  await expect(metric(page, 'Extent X')).toContainText('25.4');
  await expect(metric(page, 'Triangulated area')).toContainText('322.58');
  expect((await saved(page)).project.surface.mesh!.source.format).toBe('stl-ascii');
  await importFile(page, 'tetra-binary.stl');
  await expect(metric(page, 'Vertices')).toHaveText('4');
  await expect(metric(page, 'Triangles')).toHaveText('4');
  await expect(metric(page, 'Boundary edges')).toHaveText('0');
  await expect(metric(page, 'Euler V − E + F')).toHaveText('2');
  await expect(metric(page, 'Signed oriented volume')).toContainText('166.66667');
  const original = await saved(page);
  expect(original.project.surface.mesh!.source.format).toBe('stl-binary');
  await expect(page.getByTitle('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('mesh-inspector')).toBeVisible();
  expect((await saved(page)).project.surface).toEqual(original.project.surface);
  await page.getByRole('button', { name: /^Sphere / }).click();
  await page.getByRole('button', { name: 'Generate network', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('button', { name: 'Draw mode', exact: true }).click();
  await page.getByLabel('Load project file').setInputFiles(original.path);
  await expect(page.getByTestId('mesh-inspector')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Orbit mode', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect((await saved(page)).project.surface).toEqual(original.project.surface);
  await expect(metric(page, 'Signed oriented volume')).toContainText('166.66667');
});

test('invalid files, cancelled reading, cancelled worker delivery and obsolete results preserve work', async ({
  page,
}) => {
  // Only completion delivery/file reading is delayed. Parsing and reports remain real.
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = async function () {
      const data = await read.call(this);
      await new Promise((resolve) => setTimeout(resolve, 500));
      return data;
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler: ((this: Worker, ev: MessageEvent) => unknown) | null) {
        super.onmessage = (event) => {
          if (event.data?.type === 'result' && event.data?.surface?.kind === 'mesh')
            setTimeout(() => handler?.call(this, event), 1000);
          else handler?.call(this, event);
        };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
  });
  await ready(page);
  const before = (await saved(page)).project;
  const input = page.getByLabel('Import surface file', { exact: true });
  await input.setInputFiles('tests/fixtures/import/invalid.obj');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.locator('.import-error')).toContainText('out of range');
  expect((await saved(page)).project.graph).toEqual(before.graph);
  await input.setInputFiles('tests/fixtures/import/offset-plane.obj');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel surface import', exact: true }).click();
  await expect(page.locator('.import-status')).toContainText('cancelled');
  await page.waitForTimeout(650);
  expect((await saved(page)).project.surface).toEqual(before.surface);
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.locator('.import-status')).toContainText('Surface inspection ready');
  await page.getByRole('button', { name: 'Cancel surface import', exact: true }).click();
  await page.waitForTimeout(1100);
  expect((await saved(page)).project.surface).toEqual(before.surface);
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.locator('.import-status')).toContainText('Surface inspection ready');
  await page.getByRole('button', { name: /^Cube / }).click();
  await expect(page.locator('.import-status')).toContainText('project changed');
  await page.waitForTimeout(1100);
  const changed = (await saved(page)).project;
  expect(changed.surface.kind).toBe('cube');
  expect(changed.graph).toBeNull();
  await expect(page.getByTestId('mesh-inspector')).toHaveCount(0);
});

test('import controls and inspection fit the 375px layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await ready(page);
  await importFile(page, 'offset-plane.obj');
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(widths).toEqual({ document: 375, body: 375 });
  await expect(
    page.getByRole('link', { name: 'Library of Congress: OBJ format reference', exact: false })
  ).toHaveAttribute('href', 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000507.shtml');
  await page.screenshot({ path: 'tmp/qa/import-mobile-375.png', fullPage: true });
});

test('collapsed triangles remain visible as defects without corrupting incidence or count units', async ({
  page,
}) => {
  await ready(page);
  await importFile(page, 'collapsed-tetra.obj');
  await expect(metric(page, 'Triangles')).toHaveText('5');
  await expect(metric(page, 'Incidence triangles')).toHaveText('4');
  await expect(metric(page, 'Collapsed triangles')).toHaveText('1');
  await expect(metric(page, 'Boundary edges')).toHaveText('0');
  await expect(metric(page, 'Non-manifold edges')).toHaveText('0');
  await expect(metric(page, 'Euler V − E + F')).toHaveText('2');
  await expect(page.getByTestId('mesh-inspector')).toContainText('Signed volume unavailable');
  const diagnostic = page
    .getByTestId('mesh-inspector')
    .locator('details.diagnostic')
    .filter({ has: page.locator('summary', { hasText: 'Degenerate triangles' }) });
  await diagnostic.locator('summary').click();
  await expect(diagnostic).toContainText('Value: 1 triangles');
  await expect(diagnostic).not.toContainText('Value: 1 m²');
  await expect(diagnostic.locator('small').last()).toContainText('m²');
});
