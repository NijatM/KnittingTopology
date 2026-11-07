import { test as base, expect, type Download, type Page } from '@playwright/test';

// Fresh Playwright context per test; any page or console error fails the test.
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
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
async function downloadOf(page: Page, button: string): Promise<Uint8Array> {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: button, exact: true }).click();
  return bytes(await pending);
}
async function planeNetwork(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /^Plane / }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Surface ready');
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
}

test('knit program: size, split view, linked provenance, exports, swatches and undo', async ({
  page,
}) => {
  await planeNetwork(page);
  const sidebar = page.locator('.knit-controls');
  await expect(sidebar).toContainText('No jersey measurement');

  // typed size, then the program beside the surface
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('typed');
  await page.getByRole('spinbutton', { name: 'Needles' }).fill('80');
  await page.getByRole('spinbutton', { name: 'Passes' }).fill('90');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap, 80 needles by 90 passes/ });
  await expect(bitmap).toBeVisible();
  await expect(
    page.getByRole('separator', { name: 'Resize the surface and program views' })
  ).toBeVisible();

  // pointing at a loop traces it to the surface; clicking selects its network element
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  const box = (await bitmap.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator('.knit-loop')).toContainText(/Needle \d+, pass \d+: /);
  await page.mouse.click(box.x + box.width * 0.37, box.y + box.height * 0.41);
  await page.screenshot({ path: 'tmp/qa/knit-split.png' });

  // exports: BMP header and Knit Grammar JSON
  const bmp = await downloadOf(page, 'Bitmap BMP');
  const view = new DataView(bmp.buffer);
  expect([bmp[0], bmp[1]]).toEqual([0x42, 0x4d]);
  expect([view.getInt32(18, true), view.getInt32(22, true), view.getUint16(28, true)]).toEqual([
    80, 90, 24,
  ]);
  const grammar = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Knit Grammar JSON')));
  expect(grammar).toMatchObject({
    format: 'knit-grammar-pattern',
    version: 1,
    needles: 80,
    passes: 90,
  });
  expect(grammar.key.credit).toContain('Mariana Popescu');
  const report = new TextDecoder().decode(await downloadOf(page, 'Report TXT'));
  expect(report).toContain('Lab rules to confirm');

  // a jersey measurement sizes the program from the plane
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('gauge');
  await expect(sidebar).toContainText('No jersey measurement');
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('2');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('1.5');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel knit program generation', exact: true })
  ).toHaveCount(0);
  const size = await page.evaluate(() => {
    const label = document.querySelector('.knit-bitmap canvas')?.getAttribute('aria-label') ?? '';
    return label;
  });
  expect(size).toMatch(/needles by \d+ passes/);
  const table = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Save table')));
  expect(table.units).toEqual({ stitchWidth: 'm', courseHeight: 'm' });
  expect(table.swatches[0]).toMatchObject({ structure: 'jersey', stitchWidth: 0.002 });

  // undo removes the measurement again
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(sidebar).toContainText('No jersey measurement');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(sidebar).not.toContainText('No jersey measurement');
  await page.screenshot({ path: 'tmp/qa/knit-gauge.png', fullPage: true });
});

test('sphere knit program from a pole-to-pole cut: short rows, poles, seam and both modes', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Sphere / Closed / curved', exact: true }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /05\s*Knit program/ })).toBeVisible();
  await expect(page.locator('.cut-controls')).toContainText('knitted from pole to pole');
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  const start = page.getByRole('combobox', { name: 'Start edge' });
  await expect(start.locator('option')).toHaveText([
    'Needle 1 at the bottom pole (default)',
    'Needle 1 at the top pole',
  ]);
  await expect(page.getByRole('button', { name: 'Pick start edge on surface' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  // Without a validated cut the sphere has no layout.
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.locator('.knit-shape-job')).toContainText(/validated cut/i);
  await page.getByRole('button', { name: 'Sphere meridian cut', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cut topology result' })).toContainText(
    'Validated disk'
  );
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  const report = page.getByRole('region', { name: 'Shape report' });
  await expect(report).toContainText('Sphere opened from pole to pole');
  await expect(report).toContainText('Gather the pole edges closed');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  const text = new TextDecoder().decode(await downloadOf(page, 'Report TXT'));
  expect(text).toContain('Sphere opened from pole to pole');
  expect(text).toMatch(/Loops per needle \(needle 1 first\): \d+/);
  expect(text).toMatch(/^ {2}start side: pass 1, \d+ loops/m);
  expect(text).toContain('Yarn jumps: 0.');
  await page.screenshot({ path: 'tmp/qa/m4c-sphere-shape.png', fullPage: true });
  await start.selectOption('v1');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(report).toContainText('at the top pole');
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('both');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(page.locator('.knit-shape-job')).not.toContainText(/Shape generation:/);
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await expect(page.locator('.knit-controls').last()).not.toContainText('Typed needles');
  await page.screenshot({ path: 'tmp/qa/m4c-sphere-both.png', fullPage: true });
});

test('shape program: saddle measurement, explicit generation, start-edge undo and stale exports', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (window as unknown as { shapeWorkerTerminations: number }).shapeWorkerTerminations = 0;
    window.Worker = class extends NativeWorker {
      override terminate() {
        (window as unknown as { shapeWorkerTerminations: number }).shapeWorkerTerminations++;
        super.terminate();
      }
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await expect(page.getByRole('combobox', { name: 'Program size' })).toBeDisabled();
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.locator('.knit-shape-job')).toContainText(/measured jersey swatch/i);
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shape report' })).toBeVisible();
  await page.screenshot({ path: 'tmp/qa/m2-saddle-shape.png', fullPage: true });
  const citation = new TextDecoder().decode(await downloadOf(page, 'Citation BibTeX'));
  expect(citation).toContain('@phdthesis{popescu2019knitcrete');
  expect(citation).toContain('10.3929/ethz-b-000408640');
  const box = (await bitmap.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator('.knit-loop')).toContainText(/course|held/);
  await page.getByRole('combobox', { name: 'Start edge', exact: true }).selectOption('u1');
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Knit Grammar JSON', exact: true })).toBeDisabled();
  await expect(page.locator('.knit-export-blockers')).toContainText('Program preview is stale');
  await expect(page.getByRole('button', { name: 'Report TXT', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Start edge', exact: true })).toHaveValue('v0');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Start edge', exact: true })).toHaveValue('u1');
  await page.getByRole('combobox', { name: 'New loop operation' }).selectOption('tuck');
  await expect(page.getByRole('combobox', { name: 'New loop operation' })).toHaveValue('tuck');
  // Cancel a replacement before a result can arrive: the actual numerical worker is terminated,
  // and the previously accepted preview stays visible and explicitly stale.
  const oldLabel = await bitmap.getAttribute('aria-label');
  const terminated = await page.evaluate(
    () => (window as unknown as { shapeWorkerTerminations: number }).shapeWorkerTerminations
  );
  await page.evaluate(async () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === 'Generate shape'
    )!;
    button.click();
    await Promise.resolve();
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Cancel shape generation')!
      .click();
  });
  await expect(
    page.getByRole('button', { name: 'Cancel shape generation', exact: true })
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { shapeWorkerTerminations: number }).shapeWorkerTerminations
      )
    )
    .toBe(terminated + 1);
  await expect(bitmap).toHaveAttribute('aria-label', oldLabel!);
  await expect(page.locator('.knit-export-blockers')).toContainText('Program preview is stale');
  // Supersede a running request with a different start edge; the input change terminates it.
  await page.evaluate(async () => {
    [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Generate shape')!
      .click();
    await Promise.resolve();
    const select = document.querySelector<HTMLSelectElement>('select[aria-label="Start edge"]')!;
    select.value = 'u0';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByRole('combobox', { name: 'Start edge', exact: true })).toHaveValue('u0');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { shapeWorkerTerminations: number }).shapeWorkerTerminations
      )
    )
    .toBe(terminated + 2);
  await expect(
    page.getByRole('button', { name: 'Cancel shape generation', exact: true })
  ).toHaveCount(0);
  await expect(bitmap).toHaveAttribute('aria-label', oldLabel!);
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
});

test('shape start-edge overlay does not survive into an unmapped inspection surface', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Plane / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Pick start edge on surface', exact: true }).click();
  await page
    .getByLabel('Import surface file', { exact: true })
    .setInputFiles('tests/fixtures/import/offset-plane.obj');
  await page.locator('.surface-import > summary').click();
  await page.getByLabel('Source units', { exact: true }).selectOption('mm');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Inspection only', exact: true })).toBeDisabled();
  await expect(page.locator('[data-testid="surface-viewer"] canvas')).toBeVisible();
  await expect(page.locator('.error-panel')).toHaveCount(0);
});

test('curved combined program, immutable tile painting, undo and rectangular network mode', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('both');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('combobox', { name: 'Edge lines', exact: true }).selectOption('');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  const label = await bitmap.getAttribute('aria-label');
  const box = (await bitmap.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('.knit-loop')).toContainText(/course.*cell/);
  await page.getByText('Structure tile editor', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Copy tile from' }).selectOption('jersey');
  await page.getByRole('textbox', { name: 'Tile name' }).fill('Diagonal test');
  await page.getByRole('spinbutton', { name: 'Tile needles' }).fill('2');
  await page.getByRole('spinbutton', { name: 'Tile passes' }).fill('2');
  await page.getByRole('combobox', { name: 'Tile paint operation' }).selectOption('kb');
  await page
    .getByRole('button', { name: 'Tile needle 1, pass 1: knit front', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Tile needle 2, pass 2: knit front', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save new tile', exact: true }).click();
  const fill = page.getByRole('combobox', { name: 'Cell fill', exact: true });
  await fill.selectOption({ label: 'Diagonal test' });
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(fill).toHaveValue('jersey');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(fill.locator('option', { hasText: 'Diagonal test' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(fill).toHaveValue(/^custom:/);
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel knit program generation', exact: true })
  ).toHaveCount(0);
  await expect(bitmap).toHaveAttribute('aria-label', label!);
  await expect(page.locator('.knit-table')).toContainText('assumed = jersey');
  const saved = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Save')));
  expect(saved.project.knit.tiles[0]).toMatchObject({
    name: 'Diagonal test',
    w: 2,
    h: 2,
    rows: [
      ['kf', 'kb'],
      ['kb', 'kf'],
    ],
  });
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('network');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Cancel knit program generation', exact: true })
  ).toHaveCount(0);
  await expect(bitmap).toHaveAttribute('aria-label', label!);
  await expect(page.getByRole('region', { name: 'Shape report' })).toContainText(
    'Shaping transfers are not applied'
  );
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'tmp/qa/m3-curved-pattern-tile.png', fullPage: true });
});

test('typed curved network uses declared pixel dimensions without measured gauge', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('typed');
  await page.getByRole('spinbutton', { name: 'Needles', exact: true }).fill('30');
  await page.getByRole('spinbutton', { name: 'Passes', exact: true }).fill('25');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(
    page.getByRole('img', { name: /Knit program bitmap, 30 needles by 25 passes/ })
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Shape report' })).toHaveCount(0);
  await expect(page.locator('.knit-panel')).toContainText('no measured physical size');
});

test('cube knit program from a validated crease cut: flat net, stops, seams and both modes', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Cube / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  const sidebar = page.locator('.sidebar, aside').first();
  await expect(page.getByRole('heading', { name: /04\s*Cuts and seams/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /05\s*Knit program/ })).toBeVisible();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await expect(page.getByRole('button', { name: 'Pick start edge on surface' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  // Without a validated cut the cube has no flat net.
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.locator('.knit-shape-job')).toContainText(/validated cut/i);
  await page.getByRole('button', { name: 'Cube cross-net cut', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cut topology result' })).toContainText(
    'Validated disk'
  );
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  const report = page.getByRole('region', { name: 'Shape report' });
  await expect(report).toContainText('Flat cube net');
  await expect(report.getByRole('list', { name: 'Needle stops' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  const text = new TextDecoder().decode(await downloadOf(page, 'Report TXT'));
  expect(text).toContain('Flat cube net');
  expect(text).toContain('cast off here in the lab software');
  expect(text.match(/^ {2}[+−][XYZ]\|[+−][XYZ] \(/gm)).toHaveLength(7);
  await page.screenshot({ path: 'tmp/qa/m4b-cube-shape.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('both');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(page.locator('.knit-shape-job')).not.toContainText(/Shape generation:/);
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await expect(sidebar).not.toContainText('Typed needles');
});
