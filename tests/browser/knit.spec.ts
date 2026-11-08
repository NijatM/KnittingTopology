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
  await expect(
    sidebar.getByRole('button', { name: 'Add jersey measurement', exact: true })
  ).toBeVisible();

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
  await expect(
    sidebar.getByRole('button', { name: 'Add jersey measurement', exact: true })
  ).toBeVisible();
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
  await expect(
    sidebar.getByRole('button', { name: 'Add jersey measurement', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(
    sidebar.getByRole('button', { name: 'Add jersey measurement', exact: true })
  ).toHaveCount(0);
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
  expect(citation).toContain('@article{sethian2000eikonal');
  expect(citation).toContain('10.1073/pnas.090060097');
  expect(citation).toContain('not the paper’s fast-marching algorithm');
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

test('strong saddle exports one-guide shaping and blocks unsupported two-guide shaping', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  const side = page.getByRole('slider', { name: 'Side length', exact: true });
  await side.focus();
  await side.press('Home');
  for (let i = 0; i < 28; i++) await side.press('ArrowRight');
  await expect(side).toHaveValue('180');
  const rise = page.getByRole('slider', { name: 'Saddle rise', exact: true });
  await rise.focus();
  await rise.press('End');
  await expect(rise).toHaveValue('1.5');
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('combobox', { name: 'Start edge', exact: true }).selectOption('v1');
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not measured gauges.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('5');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('5');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  // Left to right, the cast-on leaves the yarn 15 needles from the first short row.
  await expect(page.locator('.knit-export-blockers')).toContainText(
    'Pass 2: the yarn ends at needle 49 but this pass starts at needle 34'
  );
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  await page.getByRole('combobox', { name: 'First pass direction' }).selectOption('right-to-left');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Knit interpretation' })).toContainText(
    'Shaping operations encoded'
  );
  await expect(page.getByRole('region', { name: 'Knit interpretation' })).toContainText(
    'Physical shape unverified'
  );
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Knit Grammar JSON', exact: true })).toBeEnabled();
  const bmp = await downloadOf(page, 'Bitmap BMP'),
    grammar = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Knit Grammar JSON'))),
    cells = Uint8Array.from(atob(grammar.cells), (c) => c.charCodeAt(0)),
    header = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength),
    offset = header.getUint32(10, true),
    stride = Math.ceil((grammar.needles * 3) / 4) * 4;
  expect([grammar.needles, grammar.passes]).toEqual([50, 48]);
  for (let y = 0; y < grammar.passes; y++)
    for (let x = 0; x < grammar.needles; x++) {
      const pixel = offset + (grammar.passes - 1 - y) * stride + x * 3;
      expect([bmp[pixel + 2], bmp[pixel + 1], bmp[pixel]]).toEqual(
        grammar.key.ops[cells[y * grammar.needles + x]].rgb
      );
    }
  const report = new TextDecoder().decode(await downloadOf(page, 'Report TXT'));
  expect(report).toContain('No operation-file export blockers detected');
  expect(report).toContain('iterative triangle-edge');
  await page.screenshot({ path: 'tmp/qa/strong-saddle-one-guide.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Knit key' }).selectOption('4s52-two');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Knit interpretation' })).toContainText(
    'unresolved'
  );
  await expect(page.locator('.knit-export-blockers')).toContainText(
    /two-layer structure|key has no/
  );
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Knit Grammar JSON', exact: true })).toBeDisabled();
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

test('colour keys: two-guide key, custom copy, recolour, guarded removal, Knit Grammar key and undo', async ({
  page,
}) => {
  await planeNetwork(page);
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('typed');
  await page.getByRole('spinbutton', { name: 'Needles' }).fill('30');
  await page.getByRole('spinbutton', { name: 'Passes' }).fill('20');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();

  // the two-guide class key offers its own structures; the fill moves to double knit
  const key = page.getByRole('combobox', { name: 'Knit key' });
  await key.selectOption({ label: '4.S52 two yarn guides' });
  const fill = page.getByRole('combobox', { name: 'Cell fill' });
  await expect(fill.locator('option:checked')).toHaveText('double knit, YG1 face');
  await expect(page.locator('.knit-controls')).toContainText('moved to the fill');

  // a custom copy becomes the selected key; recolouring changes the exported RGB
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  const editor = page.locator('.knit-key-editor');
  await editor.locator('summary').click();
  await page.getByRole('button', { name: 'Make a custom copy', exact: true }).click();
  await expect(key.locator('option:checked')).toHaveText(
    'my key (from 4.S52 two yarn guides) (custom)'
  );
  const k2f = 'YG1 knit front · YG2 knit back';
  await page.getByLabel(`Colour of ${k2f}`).fill('#123456');
  await expect(
    page.getByRole('img', { name: /Knit program bitmap, 30 needles by 20 passes/ })
  ).toBeVisible();
  const bmp = await downloadOf(page, 'Bitmap BMP');
  expect([bmp[54], bmp[55], bmp[56]]).toEqual([0x56, 0x34, 0x12]);

  // an operation in use cannot be removed; an unused one can
  await page.getByRole('button', { name: `Remove operation ${k2f}`, exact: true }).click();
  await expect(editor).toContainText('is used by assigned structure double knit, YG1 face');
  await page
    .getByRole('button', { name: 'Remove operation YG1 tuck back · YG2 tuck front', exact: true })
    .click();
  await expect(editor).toContainText('Removed YG1 tuck back · YG2 tuck front.');

  // the exported Knit Grammar JSON carries the custom key; reading it back does not duplicate it
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Knit Grammar JSON', exact: true }).click();
  const download = await pending;
  expect(JSON.parse(new TextDecoder().decode(await bytes(download))).key.name).toBe(
    'my key (from 4.S52 two yarn guides)'
  );
  await page.getByLabel('Read key from Knit Grammar JSON').setInputFiles(await download.path());
  await expect(editor).toContainText('The project already has this key');
  await expect(key.locator('option')).toHaveCount(3);

  // undo restores the removed operation
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove operation YG1 tuck back · YG2 tuck front' })
  ).toBeVisible();
  await page.screenshot({ path: 'tmp/qa/knit-keys.png', fullPage: true });
});

test('compare tab keeps knit programs: metrics, thumbnail, cell difference and restore', async ({
  page,
}) => {
  await planeNetwork(page);
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('typed');
  await page.getByRole('spinbutton', { name: 'Needles' }).fill('30');
  await page.getByRole('spinbutton', { name: 'Passes' }).fill('20');
  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  const capture = page.getByRole('button', { name: /Capture current variant/ });
  const cards = page.locator('.variant-card');

  // variant 1: single jersey fill
  await capture.click();
  await expect(cards.nth(0)).toContainText('Network only · 4.S52 basic key');
  await expect(
    cards.nth(0).getByRole('img', { name: 'Variant 1 knit program, 30 needles by 20 passes' })
  ).toBeVisible();
  await expect(cards.nth(0)).toContainText(/single jersey: \d+ loops · not measured/);

  // variant 2: reverse jersey fill on the same network and size
  await page.getByRole('combobox', { name: 'Cell fill' }).selectOption({ label: 'reverse jersey' });
  await capture.click();
  await expect(cards.nth(1)).toContainText(
    /[1-9]\d* of 600 cells differ in operation meaning from variant 1/
  );
  await expect(page.locator('.method-boundary').last()).toContainText(
    'These knit programs share surface, network and measurements.'
  );

  // variant 3: another size is not compared cell by cell
  await page.getByRole('spinbutton', { name: 'Needles' }).fill('31');
  await capture.click();
  await expect(cards.nth(2)).toContainText(
    'Different needles × passes from variant 1, not compared cell by cell.'
  );
  await page.screenshot({ path: 'tmp/qa/knit-compare.png', fullPage: true });

  // restoring variant 1 brings back its knit settings
  await cards.nth(0).getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Cell fill' }).locator('option:checked')
  ).toHaveText('single jersey');
  await expect(page.getByRole('spinbutton', { name: 'Needles' })).toHaveValue('30');
});

test('compare tab captures a shape program without a network, and not an outdated one', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Plane / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Compare', exact: true }).click();
  const capture = page.getByRole('button', { name: /Capture current variant/ });
  await capture.click();
  const card = page.locator('.variant-card').nth(0);
  await expect(card).toContainText('No network');
  await expect(card).toContainText('Shape only · 4.S52 basic key');
  await expect(card).toContainText(/single jersey: \d+ loops · measured/);

  // a changed setting leaves the shape preview outdated until it is generated again
  await page.getByRole('combobox', { name: 'Start edge' }).selectOption('u0');
  await expect(capture).toBeDisabled();
});

test('supplied OBJ topology exports every bitmap pixel faithfully and regenerates after project load', async ({
  page,
}) => {
  await page.goto('./');
  await page.locator('.surface-import > summary').click();
  await page
    .getByLabel('Import surface file', { exact: true })
    .setInputFiles('tests/fixtures/import/bent-rectangle-uv.obj');
  await page.getByRole('button', { name: 'Import as mm', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('SUPPLIED OBJ UV CHART');
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Program size' }).selectOption('typed');
  // An odd width exercises BMP row padding; these are pixel counts, not physical dimensions.
  await page.getByRole('spinbutton', { name: 'Needles', exact: true }).fill('31');
  await page.getByRole('spinbutton', { name: 'Passes', exact: true }).fill('23');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not measured gauges; retained to check project measurement persistence.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('6');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('4');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.locator('.knit-key-editor > summary').click();
  await page.getByRole('button', { name: 'Make a custom copy', exact: true }).click();
  await page.getByLabel('Colour of knit front', { exact: true }).fill('#123456');
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap, 31 needles by 23 passes/ });
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();

  const bmp = await downloadOf(page, 'Bitmap BMP');
  const grammar = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Knit Grammar JSON')));
  const cells = Uint8Array.from(atob(grammar.cells), (c) => c.charCodeAt(0));
  expect([grammar.needles, grammar.passes, cells.length]).toEqual([31, 23, 31 * 23]);
  expect(new Set(cells).size).toBeGreaterThan(1);
  const header = new DataView(bmp.buffer, bmp.byteOffset, bmp.byteLength);
  expect([header.getInt32(18, true), header.getInt32(22, true)]).toEqual([31, 23]);
  expect(header.getUint16(28, true)).toBe(24);
  const offset = header.getUint32(10, true);
  const stride = Math.ceil((31 * 3) / 4) * 4;
  expect(bmp.length).toBe(offset + stride * 23);
  // Decode the downloaded BMP independently: BGR, bottom-up; JSON row 0 is the last pass.
  for (let y = 0; y < 23; y++) {
    for (let x = 0; x < 31; x++) {
      const pixel = offset + (22 - y) * stride + x * 3;
      const rgb = grammar.key.ops[cells[y * 31 + x]!].rgb;
      expect([bmp[pixel + 2], bmp[pixel + 1], bmp[pixel]]).toEqual(rgb);
    }
  }

  const pending = page.waitForEvent('download');
  await page.getByTitle('Save project JSON (⌘/Ctrl S)', { exact: true }).click();
  const saved = await pending;
  const project = JSON.parse(new TextDecoder().decode(await bytes(saved))).project;
  expect(project.surface.mapping).toBe('rectangular-obj-uv-v1');
  expect(project.graph.cells.length).toBeGreaterThan(0);
  expect(project.knit.keys[0].id).toBe(grammar.key.id);
  expect(project.swatches[0]).toMatchObject({ stitchWidth: 0.006, courseHeight: 0.004 });
  await page.getByRole('button', { name: /^Plane / }).click();
  await page.getByLabel('Load project file').setInputFiles(await saved.path());
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(page.getByRole('combobox', { name: 'Knit key' })).toHaveValue(grammar.key.id);
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(bitmap).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  expect(await downloadOf(page, 'Bitmap BMP')).toEqual(bmp);
  const restored = JSON.parse(
    new TextDecoder().decode(await downloadOf(page, 'Knit Grammar JSON'))
  );
  expect(restored.cells).toBe(grammar.cells);
  expect(restored.key).toEqual(grammar.key);
});

async function countKnitWorkers(page: Page) {
  await page.addInitScript(() => {
    const state = window as unknown as {
      knitWorkerStarts: number;
      failKnit: boolean;
      layoutErrors: string[];
    };
    state.knitWorkerStarts = 0;
    state.failKnit = false;
    state.layoutErrors = [];
    window.addEventListener(
      'error',
      (event) => {
        if (event.message.includes('ResizeObserver')) state.layoutErrors.push(event.message);
      },
      true
    );
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (String(url).includes('knit.worker')) {
          state.knitWorkerStarts++;
          if (state.failKnit)
            this.postMessage = () => {
              throw new DOMException('Simulated worker input failure', 'DataCloneError');
            };
        }
      }
    };
  });
}

test('knit requirements persist, focus the repair fields, and prevent work until inputs are complete', async ({
  page,
}) => {
  await countKnitWorkers(page);
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('both');
  const generate = page.getByRole('button', { name: 'Generate knit program', exact: true });
  const missing = page.getByRole('region', { name: 'Knit generation requirements' });
  await expect(missing.locator('li')).toHaveCount(2);
  await generate.click();
  await expect(missing).toBeFocused();
  await expect(missing).toContainText('Cannot generate yet');
  await expect(
    page.getByRole('button', { name: 'Cancel knit program generation', exact: true })
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { knitWorkerStarts: number }).knitWorkerStarts)
  ).toBe(0);
  await expect(page.getByRole('button', { name: 'Use typed needles × passes' })).toHaveCount(0);
  await page.screenshot({ path: 'tmp/qa/knit-missing-requirements.png', fullPage: true });
  await missing.getByRole('button', { name: /Add jersey measurement/ }).click();
  await expect(page.getByRole('tab', { name: 'Knit', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  const width = page.getByRole('textbox', { name: 'Stitch width (mm)' });
  const height = page.getByRole('textbox', { name: 'Course height (mm)' });
  await expect(width).toBeFocused();
  await expect(width).toHaveAttribute('aria-invalid', 'true');
  await expect(height).toHaveAttribute('aria-invalid', 'true');
  await page.screenshot({ path: 'tmp/qa/knit-repair-measurement.png', fullPage: true });
  // Test values, not measured gauges.
  await width.fill('10');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await expect(height).toBeFocused();
  await expect(width).not.toHaveAttribute('aria-invalid', 'true');
  await expect(missing).toBeVisible();
  await height.fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await expect(missing.locator('li')).toHaveCount(1);
  await expect(page.locator('.knit-required-badge')).toHaveCount(0);
  await missing.getByRole('button', { name: /Go to network generation/ }).click();
  const network = page.getByRole('button', { name: 'Generate network', exact: true });
  await expect(network).toBeFocused();
  await network.click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await expect(missing).toHaveCount(0);
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await generate.click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  expect(
    await page.evaluate(() => (window as unknown as { knitWorkerStarts: number }).knitWorkerStarts)
  ).toBe(1);
});

test('knit failure remains visible with the accepted preview and clears after a successful retry', async ({
  page,
}) => {
  await countKnitWorkers(page);
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  const missing = page.getByRole('region', { name: 'Knit generation requirements' });
  await missing.getByRole('button', { name: 'Use typed needles × passes', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Program size' })).toBeFocused();
  await expect(missing).toHaveCount(0);
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  const generate = page.getByRole('button', { name: 'Generate knit program', exact: true });
  await generate.click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  const label = await bitmap.getAttribute('aria-label');
  await page.evaluate(() => {
    (window as unknown as { failKnit: boolean }).failKnit = true;
  });
  await generate.click();
  const failure = page.getByRole('region', { name: 'Knit generation failure' });
  await expect(failure).toBeFocused();
  await expect(failure).toHaveClass(/failure/);
  await expect(failure).toContainText('Simulated worker input failure');
  await expect(bitmap).toHaveAttribute('aria-label', label!);
  await failure.getByRole('button', { name: /Review knit settings/ }).click();
  await expect(page.getByRole('tab', { name: 'Knit', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(failure).toBeVisible();
  await page.screenshot({ path: 'tmp/qa/knit-generation-failure.png', fullPage: true });
  await page.evaluate(() => {
    (window as unknown as { failKnit: boolean }).failKnit = false;
  });
  await generate.click();
  await expect(
    page.getByRole('button', { name: 'Cancel knit program generation', exact: true })
  ).toHaveCount(0);
  await expect(failure).toHaveCount(0);
  await expect(bitmap).toHaveAttribute('aria-label', label!);
});

test('knit repair links reach cuts and measurements at 375px without page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('./');
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  const missing = page.getByRole('region', { name: 'Knit generation requirements' });
  await missing.getByRole('button', { name: 'Review cuts and seams', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Cuts and seams', exact: true })).toBeFocused();
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await missing.getByRole('button', { name: 'Add jersey measurement', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Stitch width (mm)' })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Course height (mm)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Knit', exact: true })).toHaveClass('active');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: 'tmp/qa/knit-repair-mobile.png', fullPage: true });
});

test('knit inspection layers change rendering independently without changing the bitmap', async ({
  page,
}) => {
  await countKnitWorkers(page);
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('both');
  await page.getByRole('combobox', { name: 'Edge lines', exact: true }).selectOption('');
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not measured gauges.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  const assessment = page.getByRole('region', { name: 'Knit interpretation' });
  await expect(assessment).toContainText('Physical shape unverified');
  const controls = page.getByRole('region', { name: 'Knit inspection layers' });
  const courses = controls.getByRole('button', { name: 'Show knitting courses', exact: true });
  const topology = controls.getByRole('button', { name: 'Show topology layer', exact: true });
  const mesh = controls.getByRole('button', { name: 'Show surface mesh layer', exact: true });
  await expect(courses).toHaveAttribute('aria-pressed', 'true');
  await expect(topology).toHaveAttribute('aria-pressed', 'true');
  await expect(mesh).toHaveAttribute('aria-pressed', 'false');
  await expect(controls.getByRole('combobox', { name: 'Shaping marks' })).toHaveValue('selected');
  const bmp = await downloadOf(page, 'Bitmap BMP');
  const workers = await page.evaluate(
    () => (window as unknown as { knitWorkerStarts: number }).knitWorkerStarts
  );
  const canvas = page.locator('[data-testid="surface-viewer"] canvas');
  const rendered = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const initial = await rendered();
  await courses.click();
  await expect.poll(rendered).not.toBe(initial);
  await expect(topology).toHaveAttribute('aria-pressed', 'true');
  const withoutCourses = await rendered();
  await topology.click();
  await expect.poll(rendered).not.toBe(withoutCourses);
  await expect(courses).toHaveAttribute('aria-pressed', 'false');
  const withoutLines = await rendered();
  await mesh.click();
  await expect.poll(rendered).not.toBe(withoutLines);
  await courses.click();
  await topology.click();
  await mesh.click();
  expect(await downloadOf(page, 'Bitmap BMP')).toEqual(bmp);
  expect(
    await page.evaluate(() => (window as unknown as { knitWorkerStarts: number }).knitWorkerStarts)
  ).toBe(workers);
  await page.screenshot({ path: 'tmp/qa/knit-inspection-courses.png', fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await controls.scrollIntoViewIfNeeded();
  await expect(controls).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: 'tmp/qa/knit-inspection-mobile.png', fullPage: true });
  for (const width of [1440, 375, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        )
    );
  }
  expect(
    await page.evaluate(() => (window as unknown as { layoutErrors: string[] }).layoutErrors)
  ).toEqual([]);
});

test('measured network inspection labels reference courses and jersey assumptions explicitly', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('button', { name: /^(Generate|Regenerate) network$/ }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('combobox', { name: 'Knit key' }).selectOption('4s52-two');
  await page.getByRole('combobox', { name: 'Edge lines', exact: true }).selectOption('dk-b');
  await page.getByRole('spinbutton', { name: 'Line width (loops)', exact: true }).fill('1');
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not measured gauges.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('5');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('5');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('button', { name: 'Generate knit program', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  const assessment = page.getByRole('region', { name: 'Knit interpretation' });
  await expect(assessment).toContainText('Pattern only — shaping not applied');
  await expect(assessment).toContainText('Physical shape unverified');
  await expect(assessment).toContainText('assumed jersey dimensions');
  await expect(assessment).toContainText('double knit, YG1 face, double knit, YG2 face');
  await expect(assessment).toContainText(/Edge markings: \d+ of \d+ assigned loops/);
  await expect(assessment).toContainText('method notes / limits');
  const controls = page.getByRole('region', { name: 'Knit inspection layers' });
  await expect(controls).toContainText('reference courses; shaping not applied');
  await expect(controls.getByRole('combobox', { name: 'Shaping marks' })).toBeDisabled();
  await page.screenshot({ path: 'tmp/qa/knit-inspection-reference.png', fullPage: true });
});

test('swatch calibration context persists, survives undo, and the thesis guide cites at 375px', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Plane / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();

  // test values, not measured gauges or a lab machine
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByText('Calibration context (optional)', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Measurement state' }).selectOption('tensioned');
  await page.getByRole('textbox', { name: 'Machine', exact: true }).fill('test machine only');
  await page
    .getByRole('textbox', { name: 'Test protocol', exact: true })
    .fill('synthetic record\nnot a measurement');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  const saved = page.locator('details.swatch-entry').first();
  await expect(saved.locator('summary').first()).toContainText('10 × 8 mm · Tensioned');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  const bitmap = page.getByRole('img', { name: /Knit program bitmap/ });
  await expect(bitmap).toBeVisible();
  const size = await bitmap.getAttribute('aria-label');

  const report = new TextDecoder().decode(await downloadOf(page, 'Report TXT'));
  expect(report).toContain('Layout measurement: state Tensioned; measured on jersey.');
  expect(report).toContain('Machine: test machine only');
  expect(report).toContain('Test protocol: synthetic record\n      not a measurement');
  const table = JSON.parse(new TextDecoder().decode(await downloadOf(page, 'Save table')));
  expect(table.swatches[0].calibration).toEqual({
    state: 'tensioned',
    machine: 'test machine only',
    protocol: 'synthetic record\nnot a measurement',
  });

  // changing only the context keeps the program size; undo restores the earlier context
  await saved.locator('summary').first().click();
  await saved.getByText('Calibration context (optional)', { exact: true }).click();
  await saved.getByRole('combobox', { name: 'Measurement state' }).selectOption('relaxed');
  await saved.getByRole('button', { name: 'Save measurement', exact: true }).click();
  await expect(saved.locator('summary').first()).toContainText('· Relaxed');
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(bitmap).toHaveAttribute('aria-label', size!);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(saved.locator('summary').first()).toContainText('· Tensioned');
  // the restored form shows the restored state (its collapsed context section hides the select from roles)
  await expect(saved.locator('select[aria-label="Measurement state"]')).toHaveValue('tensioned');

  // the guide is read-only teaching content, in the Knit and Learn tabs, without page overflow
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const guide = page.locator('details.knit-workflow:visible');
  await expect(guide).toHaveCount(1);
  await guide.getByText('KnitCrete workflow · understand and cite', { exact: true }).click();
  const symbols = guide.getByRole('button', { name: /Expand operation symbols/ });
  await symbols.click();
  await expect(symbols).toHaveAttribute('aria-pressed', 'true');
  await expect(guide.locator('.knit-workflow-stage')).toContainText('Fig. 7.34g–k, p. 152');
  await guide.getByText('Citation and method wording', { exact: true }).click();
  const bib = new TextDecoder().decode(await downloadOf(page, 'Download thesis BibTeX'));
  expect(bib).toContain('10.3929/ethz-b-000408640');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.screenshot({ path: 'tmp/qa/knit-workflow-guide.png', fullPage: true });
});

test('knit graph stages: save, download, discard, load in order, colour by role and second method', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not lab measurements.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();
  const panel = page.getByRole('region', { name: 'Knit graph stages' }),
    status = panel.getByRole('list', { name: 'Stage status' });
  await expect(status).toContainText('Courses: saved, matches the current inputs');
  await expect(status).toContainText('Loops: saved, matches the current inputs');
  await expect(panel.getByRole('list', { name: 'Knit graph checks' })).toContainText(
    'Consistent parent links'
  );
  const bmp = await downloadOf(page, 'Bitmap BMP');
  // Saved stage files, loaded back from their download paths below.
  const saved = async (button: string) => {
    const pending = page.waitForEvent('download');
    await panel.getByRole('button', { name: button, exact: true }).click();
    const download = await pending;
    return {
      path: await download.path(),
      json: JSON.parse(new TextDecoder().decode(await bytes(download))),
    };
  };
  const courses = await saved('Courses JSON'),
    loops = await saved('Loops JSON');
  expect(courses.json).toMatchObject({ format: 'knit-graph-stage', version: 1, stage: 'courses' });
  expect(loops.json).toMatchObject({ format: 'knit-graph-stage', version: 1, stage: 'loops' });
  const load = (file: { path: string }) =>
    panel.getByLabel('Load knit graph stage file').setInputFiles(file.path);

  await panel.getByRole('button', { name: 'Discard stages', exact: true }).click();
  await expect(status).toContainText('Courses: not saved; Generate builds it');
  await load(loops);
  await expect(panel.getByRole('alert')).toContainText('courses stage first');
  await load(courses);
  await expect(status).toContainText('Courses: saved, matches the current inputs');
  await expect(status).toContainText('Loops: not saved');
  await load(loops);
  await expect(status).toContainText('Loops: saved, matches the current inputs');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  // The same stages are back, so the program is current and its bitmap is unchanged.
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  expect(await downloadOf(page, 'Bitmap BMP')).toEqual(bmp);

  // Colouring by loop role changes the display only.
  await page.getByRole('combobox', { name: 'Bitmap colour by' }).selectOption('role');
  await expect(page.locator('.knit-bitmap-legend')).toContainText('blue short-row end');
  expect(await downloadOf(page, 'Bitmap BMP')).toEqual(bmp);
  await page.getByRole('combobox', { name: 'Knit graph layer' }).selectOption('loops');
  await expect(page.getByRole('combobox', { name: 'Knit graph layer' })).toHaveValue('loops');

  // The second course method makes the saved stages stale until Generate rebuilds them.
  await page.getByRole('combobox', { name: 'Course method' }).selectOption('popescu-2019-rules');
  await expect(status).toContainText('Courses: saved, stale');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^(Generate|Regenerate) shape$/ }).click();
  await expect(panel).toContainText('Popescu connection rules');
  await expect(status).toContainText('Courses: saved, matches the current inputs');
  await expect(panel.getByRole('list', { name: 'Knit graph checks' })).toContainText(
    'Course connection rule'
  );
  await page.screenshot({ path: 'tmp/qa/2a-stage-panel.png', fullPage: true });
});

test('knit graph editing: edit the courses stage on the surface, undo, keep a stale edited stage', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not lab measurements.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  await page.getByRole('button', { name: 'Generate shape', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Knit graph stages' }),
    status = panel.getByRole('list', { name: 'Stage status' });
  await expect(status).toContainText('Loops: saved, matches the current inputs');
  const bmp = await downloadOf(page, 'Bitmap BMP');

  const toggle = panel.getByRole('button', { name: 'Edit on the surface', exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const tool = panel.getByRole('combobox', { name: 'Edit tool' });
  await expect(tool.locator('option')).toHaveText([
    'Move point',
    'Insert point',
    'Delete point',
    'Delete course',
    'Add course',
  ]);
  await tool.selectOption('delete-course');
  const canvas = page.getByTestId('surface-viewer').locator('canvas');
  await expect(canvas).toHaveAttribute('aria-label', /Knit graph editor/);
  // Courses lie a few millimetres apart: click down the middle of the view until one is hit.
  const box = (await canvas.boundingBox())!;
  for (let dy = -60; dy <= 60; dy += 2) {
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 + dy);
    if ((await status.textContent())?.includes('edited')) break;
  }
  await expect(status).toContainText('edited (1 edit: 1 delete course)');
  // The edit rebuilds the layout and its checks at once.
  await expect(status).toContainText('Loops: saved, matches the current inputs');
  await expect(page.getByRole('img', { name: /Knit program bitmap/ })).toBeVisible();

  // Undo restores the generated stage and its bitmap.
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(status).not.toContainText('edited');
  await expect(status).toContainText('Loops: saved, matches the current inputs');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeEnabled();
  expect(await downloadOf(page, 'Bitmap BMP')).toEqual(bmp);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(status).toContainText('edited (1 edit: 1 delete course)');

  // Changed inputs make the edited stage stale; Generate keeps it and export stays blocked.
  await page.getByRole('combobox', { name: 'Course method' }).selectOption('popescu-2019-rules');
  await expect(status).toContainText('saved, stale: its inputs changed; kept because it has edits');
  await expect(toggle).toHaveCount(0);
  await page.getByRole('button', { name: /^(Generate|Regenerate) shape$/ }).click();
  await expect(page.getByText(/the edited courses stage is stale/).first()).toBeVisible();
  await expect(status).toContainText('kept because it has edits');
  await expect(page.getByRole('button', { name: 'Bitmap BMP', exact: true })).toBeDisabled();
  const pending = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download edited stage', exact: true }).click();
  const file = JSON.parse(new TextDecoder().decode(await bytes(await pending)));
  expect(file).toMatchObject({ stage: 'courses', data: { edits: [{ op: 'delete-course' }] } });
  await panel.getByRole('button', { name: 'Discard edits and regenerate', exact: true }).click();
  await expect(status).toContainText('Courses: saved, matches the current inputs');
  await expect(status).not.toContainText('edited');
  await expect(panel).toContainText('Popescu connection rules');
  await page.screenshot({ path: 'tmp/qa/2b-stage-editing.png', fullPage: true });
});

test('computational patches: split lines, per-patch start edge, one bitmap per piece and a seam map', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Saddle / }).click();
  await page.getByRole('combobox', { name: 'Knit mode' }).selectOption('shape');
  await page.getByRole('button', { name: 'Show program beside the surface' }).click();
  await page.getByRole('tab', { name: 'Knit', exact: true }).click();
  // Test values, not lab measurements.
  await page.getByRole('textbox', { name: 'Stitch width (mm)' }).fill('10');
  await page.getByRole('textbox', { name: 'Course height (mm)' }).fill('8');
  await page.getByRole('button', { name: 'Add measurement', exact: true }).click();
  const patches = page.getByRole('region', { name: 'Computational patches' });

  // The patch tool adds a split line at constant u through the clicked point.
  const toggle = patches.getByRole('button', { name: 'Lay out patches on the surface' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(patches.getByRole('combobox', { name: 'Patch tool' })).toHaveValue('split-u');
  const canvas = page.getByTestId('surface-viewer').locator('canvas');
  await expect(canvas).toHaveAttribute('aria-label', /Patch layout/);
  const box = (await canvas.boundingBox())!;
  // Off centre: the saddle view is symmetric, so the centre lies near u = 0.5.
  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height / 2);
  const split = patches.getByRole('spinbutton', { name: 'u split 1' });
  await expect(split).toBeVisible();
  const clicked = Number(await split.inputValue());
  expect(clicked).toBeGreaterThan(0.02);
  expect(clicked).toBeLessThan(0.98);
  expect(clicked).not.toBe(0.5);
  // A typed value moves it exactly; Undo returns to the clicked value.
  await split.fill('0.5');
  await split.press('Enter');
  await expect(split).toHaveValue('0.5');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(split).toHaveValue(String(clicked));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(split).toHaveValue('0.5');
  await toggle.click();
  await expect(canvas).not.toHaveAttribute('aria-label', /Patch layout/);

  // Each patch has its own start edge.
  const choose = patches.getByRole('combobox', { name: 'Patch' });
  await expect(choose.locator('option')).toHaveCount(2);
  await choose.selectOption('1');
  await expect(page.getByTestId('knit-controls-patch')).toContainText('patch P2');
  await page.getByRole('combobox', { name: 'Start edge' }).selectOption('u1');
  await expect(choose.locator('option').nth(0)).toContainText('P1 · u 0–0.5 · v 0–1 · start v0');
  await expect(choose.locator('option').nth(1)).toContainText('P2 · u 0.5–1 · v 0–1 · start u1');

  // Generate builds every patch as its own piece; the shown piece is the selected patch.
  await page.getByRole('button', { name: /^(Generate|Regenerate) shape$/ }).click();
  const pieces = patches.getByRole('list', { name: 'Patch pieces' });
  await expect(pieces).toContainText(/P1: \d+ needles × \d+ passes/);
  await expect(pieces).toContainText(/P2: \d+ needles × \d+ passes/);
  const stages = page.getByRole('region', { name: 'Knit graph stages' });
  await expect(stages.getByRole('heading')).toHaveText('Knit graph stages · patch P2');
  await expect(stages.getByRole('list', { name: 'Stage status' })).toContainText(
    'Courses: saved, matches the current inputs'
  );
  const named = async (scope: typeof page | typeof patches, button: string) => {
    const pending = page.waitForEvent('download');
    await scope.getByRole('button', { name: button, exact: true }).click();
    const download = await pending;
    return { name: download.suggestedFilename(), download };
  };
  const bmp2 = await named(page, 'Bitmap BMP');
  expect(bmp2.name).toMatch(/-P2-knit\.bmp$/);
  const report = await named(page, 'Report TXT');
  expect(report.name).toMatch(/-P2-knit-report\.txt$/);
  expect(new TextDecoder().decode(await bytes(report.download))).toContain('piece P2 of 2');
  await choose.selectOption('0');
  expect((await named(page, 'Bitmap BMP')).name).toMatch(/-P1-knit\.bmp$/);

  // The seam map lists both sides of the one seam, paired by position (project rule).
  const seamMap = await named(patches, 'Seam map JSON');
  expect(seamMap.name).toMatch(/-seam-map\.json$/);
  const map = JSON.parse(new TextDecoder().decode(await bytes(seamMap.download)));
  expect(map).toMatchObject({ format: 'knit-patch-seam-map', version: 1 });
  expect(map.seams).toHaveLength(1);
  expect(map.patches.map((p: { startEdge: string }) => p.startEdge)).toEqual(['v0', 'u1']);
  await page.screenshot({ path: 'tmp/qa/2c1-patches.png', fullPage: true });

  // Removing the last split returns the whole chart to the settings of the patch on the left.
  await patches.getByRole('button', { name: 'Remove u split 1', exact: true }).click();
  await expect(choose).toHaveCount(0);
  await expect(page.getByTestId('knit-controls-patch')).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Start edge' })).toHaveValue('v0');
});
