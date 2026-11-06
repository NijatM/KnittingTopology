import { test as base, expect, type Page, type Download } from '@playwright/test';
import type { ProjectState } from '../../src/core/types';

// Every test uses a fresh Playwright context, never an existing user browser.
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error')
          errors.push(`console: ${message.text()} (${message.location().url})`);
      });
      await use(errors);
      expect(errors, 'No browser JavaScript or console errors').toEqual([]);
    },
    { auto: true },
  ],
});

async function bytes(download: Download): Promise<Uint8Array> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Local browser download stream missing.');
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream)
    chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
async function projectJSON(
  page: Page
): Promise<{ text: string; path: string; project: ProjectState }> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Project JSON', exact: true }).click();
  const download = await pending;
  const text = new TextDecoder().decode(await bytes(download));
  const path = await download.path();
  if (!path) throw new Error('Downloaded project path missing.');
  const record = JSON.parse(text);
  expect(record.format).toBe('knitting-topology');
  expect(record.units).toBe('m');
  return { text, path, project: record.project };
}
async function ready(page: Page) {
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await expect(page.locator('.error-panel')).toHaveCount(0);
  await expect(page.locator('[data-testid="surface-viewer"] canvas')).toBeVisible();
}
async function regenerate(page: Page) {
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await ready(page);
}
async function surface(page: Page, kind: 'Plane' | 'Cube' | 'Sphere' | 'Saddle') {
  await page.getByRole('button', { name: new RegExp(`^${kind} `) }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Surface ready');
  await regenerate(page);
}
async function slider(page: Page, label: string, value: number) {
  await page.getByRole('slider', { name: label, exact: true }).fill(String(value));
}
function graphIds(project: ProjectState) {
  return {
    nodes: project.graph!.nodes.map((n) => n.id),
    edges: project.graph!.edges.map((e) => e.id),
    cells: project.graph!.cells.map((c) => c.id),
  };
}
async function screenshot(page: Page, name: string) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('.sidebar-scroll,.inspector-content').forEach((element) => {
      element.scrollTop = 0;
    });
  });
  await page.screenshot({ path: `tmp/qa/${name}.png`, fullPage: true });
}

test('initial generation, analytic surfaces, overlays, drawing and actual graph selection', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  const first = (await projectJSON(page)).project;
  expect(first.surface.kind).toBe('sphere');
  expect(first.statistics!.euler).toBe(2);
  expect(first.statistics!.components).toBe(1);
  expect(first.graph!.nodes.length).toBeGreaterThan(20);
  await screenshot(page, 'desktop-initial-sphere');
  for (const [kind, euler, boundary] of [
    ['Plane', 1, true],
    ['Cube', 2, false],
    ['Sphere', 2, false],
  ] as const) {
    await surface(page, kind);
    const p = (await projectJSON(page)).project;
    expect(p.surface.kind).toBe(kind.toLowerCase());
    expect(p.statistics!.euler).toBe(euler);
    expect(p.statistics!.components).toBe(1);
    expect(p.statistics!.boundaryEdges > 0).toBe(boundary);
    expect(p.graph!.provenance.surfaceRevision).toBe(p.surface.revision);
    expect(new Set(p.graph!.nodes.map((n) => n.id)).size).toBe(p.graph!.nodes.length);
  }
  await page.getByLabel('Diagnostic overlay').selectOption('patches');
  await page.getByRole('button', { name: 'Seams / features', exact: true }).click();
  await screenshot(page, 'desktop-sphere-patch-seams');
  await surface(page, 'Plane');
  await page.getByTitle('top view', { exact: true }).click();
  await page.getByLabel('Diagnostic overlay').selectOption('plain');
  await page.getByRole('button', { name: 'Draw mode', exact: true }).click();
  const canvas = page.locator('[data-testid="surface-viewer"] canvas');
  const rect = (await canvas.boundingBox())!;
  const cx = rect.x + rect.width / 2,
    cy = rect.y + rect.height / 2;
  await page.mouse.move(cx - 45, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 45, cy + 20, { steps: 20 });
  await expect(page.getByRole('button', { name: 'Remove guide 1', exact: true })).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Remove guide 1', exact: true })).toBeVisible();
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  const guided = (await projectJSON(page)).project;
  expect(guided.guides).toHaveLength(1);
  expect(guided.guides[0].samples.length).toBeGreaterThan(5);
  for (const sample of guided.guides[0].samples) {
    expect(sample.position[2]).toBe(0);
    expect(sample.attachment.surfaceRevision).toBe(guided.surface.revision);
    expect(sample.attachment.uv.every((v) => v >= 0 && v <= 1)).toBe(true);
  }
  expect(
    guided.guides[0].samples.some(
      (s) => s.attachment.faceId !== undefined && s.attachment.barycentric
    )
  ).toBe(true);
  await regenerate(page);
  await page.getByRole('button', { name: 'Select mode', exact: true }).click();
  await page.getByRole('tab', { name: 'Topology', exact: true }).click();
  // Test real canvas picking at a bounded set of central positions. A regular
  // grid has both vertex neighborhoods and cell interiors; IDs must exist.
  const selected = new Set<string>();
  const graph = (await projectJSONAfterMeasures(page)).graph!;
  await page.getByRole('tab', { name: 'Topology', exact: true }).click();
  for (const [dx, dy] of [
    [0, 0],
    [10, 10],
    [20, 0],
    [0, 20],
    [-10, 10],
    [30, 30],
    [-20, -20],
    [15, -15],
  ]) {
    await page.mouse.click(cx + dx, cy + dy);
    const card = page.locator('.selection-card');
    if (!(await card.count())) continue;
    const label = await card.locator('.eyebrow').innerText();
    const id = await card.locator('code').first().innerText();
    if (label === 'VERTEX') {
      expect(graph.nodes.some((n) => n.id === id)).toBe(true);
      selected.add('node');
    }
    if (label === 'CELL') {
      expect(graph.cells.some((c) => c.id === id)).toBe(true);
      selected.add('cell');
    }
    if (selected.size === 2) break;
  }
  expect([...selected].sort()).toEqual(['cell', 'node']);
  await screenshot(page, 'desktop-plane-selection');
});

async function projectJSONAfterMeasures(page: Page) {
  await page.getByRole('tab', { name: 'Measures', exact: true }).click();
  return (await projectJSON(page)).project;
}

test('undo and redo restore explicit graph content through keyboard and mouse', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await surface(page, 'Plane');
  const before = (await projectJSON(page)).project;
  await slider(page, 'Target spacing', 22);
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  await regenerate(page);
  const after = (await projectJSON(page)).project;
  expect(after.graph!.cells.length).not.toBe(before.graph!.cells.length);
  await page.getByRole('button', { name: 'Orbit mode', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  expect((await projectJSON(page)).project.graph).toEqual(before.graph);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await ready(page);
  const reverted = (await projectJSON(page)).project;
  expect(reverted.parameters).toEqual(before.parameters);
  expect(graphIds(reverted)).toEqual(graphIds(before));
  expect(reverted.graph).toEqual(before.graph);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  await page.getByRole('button', { name: 'Orbit mode', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await ready(page);
  expect((await projectJSON(page)).project.graph).toEqual(after.graph);
});

test('saved JSON reloads in a fresh session and geometry exports contain the actual network', async ({
  page,
  browser,
}) => {
  await page.goto('./');
  await ready(page);
  await surface(page, 'Cube');
  await page.getByLabel('Project name', { exact: true }).fill('Cube export check');
  const saved = await projectJSON(page);
  const context = await browser.newContext({
    baseURL: page.url(),
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  const restored = await context.newPage();
  const errors: string[] = [];
  restored.on('pageerror', (e) => errors.push(e.message));
  await restored.goto('./');
  await ready(restored);
  await restored.getByLabel('Load project file').setInputFiles(saved.path);
  await expect(restored.locator('.status-message')).toContainText('Loaded Cube export check.');
  await ready(restored);
  const roundTrip = (await projectJSON(restored)).project;
  expect(roundTrip.surface).toEqual(saved.project.surface);
  expect(roundTrip.parameters).toEqual(saved.project.parameters);
  expect(roundTrip.graph).toEqual(saved.project.graph);
  expect(roundTrip.guides).toEqual(saved.project.guides);
  expect(graphIds(roundTrip)).toEqual(graphIds(saved.project));
  for (const [label, extension] of [
    ['Mesh OBJ', '.obj'],
    ['XY projection SVG', '.svg'],
    ['Diagnostics CSV', '.csv'],
  ] as const) {
    const pending = restored.waitForEvent('download');
    await restored.getByRole('button', { name: label, exact: true }).click();
    const download = await pending;
    expect(download.suggestedFilename()).toContain(extension);
    const text = new TextDecoder().decode(await bytes(download));
    if (extension === '.obj') {
      expect(text).toContain('Coordinates in meters');
      expect(text.split('\n').filter((line) => line.startsWith('v '))).toHaveLength(
        roundTrip.graph!.nodes.length
      );
      expect(text.split('\n').filter((line) => line.startsWith('f '))).toHaveLength(
        roundTrip.graph!.cells.length
      );
    } else if (extension === '.svg') {
      const parsed = await restored.evaluate((xml) => {
        const doc = new DOMParser().parseFromString(xml, 'image/svg+xml');
        return {
          errors: doc.querySelectorAll('parsererror').length,
          paths: doc.querySelectorAll('polyline').length,
        };
      }, text);
      expect(parsed.errors).toBe(0);
      expect(parsed.paths).toBe(roundTrip.graph!.edges.length);
    } else {
      expect(text).toContain('"severity"');
      expect(text.trim().split('\r\n')).toHaveLength(roundTrip.diagnostics.length + 1);
    }
  }
  const png = restored.waitForEvent('download');
  await restored.getByRole('button', { name: 'Download viewport PNG', exact: true }).click();
  expect(
    Array.from((await bytes(await png)).subarray(0, 8))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ).toBe('89504e470d0a1a0a');
  expect(errors).toEqual([]);
  await context.close();
});

test('supported N-sided patches and pattern transformations, unsupported counts preserve accepted graph', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await page.getByLabel('Construction', { exact: true }).selectOption('n-sided-patch');
  for (const n of [3, 4, 5, 6]) {
    await page.getByLabel('Patch sides', { exact: true }).selectOption(String(n));
    await regenerate(page);
    const p = (await projectJSON(page)).project;
    expect(p.parameters.strategy).toBe('n-sided-patch');
    expect(p.surface.kind).toBe('plane');
    expect(p.parameters.patchSides).toBe(n);
    expect(p.parameters.boundaryCounts).toEqual(Array(n).fill(6));
    expect(p.statistics!.components).toBe(1);
    expect(p.statistics!.euler).toBe(1);
    expect(p.graph!.cells.every((c) => c.nodes.length === 4)).toBe(true);
  }
  await page.getByLabel('Patch sides', { exact: true }).selectOption('4');
  await regenerate(page);
  for (const family of ['Dual', 'Ambo', 'Kis', 'Gyro', 'Diagonal']) {
    await page.getByRole('button', { name: family, exact: true }).click();
    await regenerate(page);
    const p = (await projectJSON(page)).project;
    expect(p.parameters.family).toBe(family.toLowerCase());
    expect(p.graph!.provenance.parameters.family).toBe(family.toLowerCase());
    expect(p.statistics!.components).toBe(1);
    expect(p.statistics!.euler).toBe(1);
    expect(p.graph!.cells.length).toBeGreaterThan(0);
  }
  await page.getByRole('button', { name: 'Quad', exact: true }).click();
  await regenerate(page);
  const accepted = (await projectJSON(page)).project.graph;
  await page.getByLabel('Side 1 subdivisions', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Regenerate network', exact: true }).click();
  await expect(page.locator('.error-panel')).toContainText('even total boundary count');
  expect((await projectJSON(page)).project.graph).toEqual(accepted);
  await page.getByLabel('Side 1 subdivisions', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Regenerate network', exact: true }).click();
  await expect(page.locator('.error-panel')).toContainText('Unsupported side-count combination');
  expect((await projectJSON(page)).project.graph).toEqual(accepted);
  await page.getByRole('button', { name: 'Equal counts', exact: true }).click();
  await regenerate(page);
});

test('cancel and stale-result handling preserve the previous actual worker graph', async ({
  page,
}) => {
  // The numerical worker remains real. Delay only delivery of its completed
  // result to make race checks deterministic on both slow and fast machines.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      set onmessage(handler: ((this: Worker, ev: MessageEvent) => unknown) | null) {
        super.onmessage = (event) => {
          if (event.data?.type === 'result') setTimeout(() => handler?.call(this, event), 1000);
          else handler?.call(this, event);
        };
      }
      get onmessage() {
        return super.onmessage;
      }
    };
  });
  await page.goto('./');
  await ready(page);
  await surface(page, 'Plane');
  const before = (await projectJSON(page)).project.graph;
  await slider(page, 'Field orientation', 25);
  await page.getByRole('button', { name: 'Regenerate network', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel generation', exact: true }).click();
  await expect(page.locator('.status-message')).toContainText('Generation cancelled');
  await page.waitForTimeout(1200);
  expect((await projectJSON(page)).project.graph).toEqual(before);
  await page.getByRole('button', { name: 'Regenerate network', exact: true }).click();
  await slider(page, 'Field orientation', 50);
  await expect(page.locator('.status-message')).toContainText('Outdated worker result discarded');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  expect((await projectJSON(page)).project.graph).toEqual(before);
  await regenerate(page);
  const after = (await projectJSON(page)).project;
  expect(after.graph!.provenance.parameters.orientation).toBe(50);
  expect(after.parameters.orientation).toBe(50);
  expect(after.graph!.provenance.inputSignature).toBeTruthy();
});

test('comparison captures accepted variants and restores their explicit graphs', async ({
  page,
}) => {
  await page.goto('./');
  await ready(page);
  await surface(page, 'Plane');
  const baseline = (await projectJSON(page)).project;
  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  await page.getByRole('button', { name: 'Capture current variant', exact: false }).click();
  await expect(page.locator('.variant-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ambo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Capture current variant', exact: false })
  ).toBeDisabled();
  await regenerate(page);
  await page.getByRole('button', { name: 'Capture current variant', exact: false }).click();
  await expect(page.locator('.variant-card')).toHaveCount(2);
  await expect(page.locator('.method-boundary')).toContainText('share support geometry');
  const firstCard = page.locator('.variant-card').first();
  const pending = page.waitForEvent('download');
  await firstCard.getByRole('button', { name: 'Save JSON', exact: true }).click();
  const captured = JSON.parse(new TextDecoder().decode(await bytes(await pending)))
    .project as ProjectState;
  expect(captured.graph).toEqual(baseline.graph);
  await firstCard.getByRole('button', { name: 'Restore', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('button', { name: 'Quad', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  const restored = await projectJSONAfterMeasures(page);
  expect(restored.graph).toEqual(baseline.graph);
  expect(restored.parameters).toEqual(baseline.parameters);
  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  await screenshot(page, 'desktop-compare');
});

test('375px viewport remains usable without horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await ready(page);
  expect(
    await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
  ).toEqual({ viewport: 375, document: 375, body: 375 });
  await expect(page.getByRole('button', { name: 'Draw mode', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Keyboard shortcuts and help', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace guide', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await screenshot(page, 'mobile-375-sphere');
  await page.getByRole('button', { name: /^Plane / }).click();
  await regenerate(page);
  await expect(page.getByLabel('Target spacing', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await screenshot(page, 'mobile-375-plane');
});
