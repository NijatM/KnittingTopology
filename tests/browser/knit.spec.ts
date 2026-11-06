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

test('knit program is offered only where it works', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Sphere / }).click();
  await expect(page.locator('.knit-controls')).toContainText(
    'Knit programs are available for the plane in this version.'
  );
  await expect(page.getByRole('button', { name: 'Show program beside the surface' })).toHaveCount(
    0
  );
});
