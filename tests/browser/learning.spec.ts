import { test as base, expect, type Page, type Download } from '@playwright/test';
import type { ProjectState } from '../../src/core/types';

const test = base.extend<{ learningErrors: string[] }>({
  learningErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error')
          errors.push(`${message.text()} (${message.location().url})`);
      });
      await use(errors);
      expect(errors, 'Learning interactions produce no browser errors').toEqual([]);
    },
    { auto: true },
  ],
});
async function text(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) throw new Error('Download stream unavailable.');
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of stream)
    result += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  return result + decoder.decode();
}
async function project(page: Page): Promise<ProjectState> {
  const pending = page.waitForEvent('download');
  await page.getByTitle('Save project JSON (⌘/Ctrl S)', { exact: true }).click();
  return JSON.parse(await text(await pending)).project;
}
async function learn(page: Page) {
  await page.goto('./');
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  await page.getByRole('tab', { name: 'Learn', exact: true }).click();
  const panel = page.getByTestId('learning-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('reading all topics and diagram steps leaves the scientific project untouched', async ({
  page,
}) => {
  const panel = await learn(page);
  const before = await project(page);
  const topics = panel.getByLabel('Learning topic', { exact: true });
  await expect(topics.locator('option')).toHaveCount(13);
  const ids = await topics
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  for (const id of ids) {
    await topics.selectOption(id);
    await expect(
      panel.getByRole('img', { name: 'Construction diagram', exact: true })
    ).toBeVisible();
    await expect(panel.locator('.learning-diagram-error')).toHaveCount(0);
    await expect(panel.locator('.learning-diagram-counts')).toContainText('Base');
    await expect(panel.locator('figcaption')).toContainText('independent of the current viewport');
  }
  await topics.selectOption('dual');
  await panel.getByRole('button', { name: 'Base', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Base', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(panel.locator('svg[aria-label="Construction diagram"] path')).toHaveCount(40);
  await panel.getByRole('button', { name: 'Result', exact: true }).click();
  await expect(panel.locator('svg[aria-label="Construction diagram"] path')).toHaveCount(72);
  await expect(panel.locator('.learning-diagram-counts')).toContainText('25 V · 40 E · 16 F');
  await expect(panel.locator('.learning-diagram-counts')).toContainText('48 V · 72 E · 25 F');
  await panel.getByRole('button', { name: 'Overlay', exact: true }).click();
  await expect(panel.locator('svg[aria-label="Construction diagram"] path')).toHaveCount(112);
  await panel.locator('.learning-diagram').screenshot({ path: 'tmp/qa/learn-desktop-diagram.png' });
  await panel.getByRole('button', { name: 'Follow current method', exact: true }).click();
  await expect(topics).toHaveValue('quad');
  expect(await project(page)).toEqual(before);
  await page.locator('.inspector-content').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: 'tmp/qa/learn-desktop.png', fullPage: true });
});

test('citations, selectable clipboard fallback, downloads and undoable explicit examples', async ({
  page,
}) => {
  const panel = await learn(page);
  const before = await project(page);
  await panel.getByLabel('Learning topic', { exact: true }).selectOption('dual');
  const hart = panel.locator('.learning-reference').filter({
    has: page.getByRole('heading', { name: 'Conway Notation for Polyhedra', exact: true }),
  });
  await expect(hart.locator('.learning-full-reference')).toContainText('(n.d.)');
  await expect(hart.getByRole('link', { name: 'Primary source', exact: false })).toHaveAttribute(
    'href',
    'https://www.georgehart.com/virtual-polyhedra/conway_notation.html'
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  });
  await hart.getByRole('button', { name: 'Copy reference', exact: true }).click();
  const fallback = panel.getByRole('textbox', { name: 'Reference text to copy', exact: true });
  await expect(fallback).toBeVisible();
  await expect(fallback).toHaveValue(/Conway Notation for Polyhedra/);
  await expect(panel.locator('.learning-notice')).toContainText('copy it manually');
  await expect(panel.locator('.learning-notice')).not.toContainText('copied');
  await panel.getByRole('button', { name: 'Select text', exact: true }).click();
  expect(
    await fallback.evaluate((element) => {
      const area = element as HTMLTextAreaElement;
      return area.selectionEnd - area.selectionStart;
    })
  ).toBeGreaterThan(20);
  const bib = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download references.bib', exact: true }).click();
  const bibliography = await text(await bib);
  expect(bibliography).toContain('@misc{hart');
  expect(bibliography).toContain('@inproceedings{oval2018');
  expect(bibliography).not.toContain('year = {1998}');
  const csl = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download CSL JSON', exact: true }).click();
  const items = JSON.parse(await text(await csl));
  expect(items.find((item: { id: string }) => item.id === 'hart').issued).toBeUndefined();
  expect(items.find((item: { id: string }) => item.id === 'oval2018').page).toBe('342-363');
  await panel.getByLabel('Learning topic', { exact: true }).selectOption('patch-quadrangulation');
  await expect(
    panel.getByRole('link', { name: 'DOI: 10.1111/cgf.12443', exact: false })
  ).toHaveAttribute('href', 'https://doi.org/10.1111/cgf.12443');
  await expect(
    panel.getByRole('link', { name: 'Public PDF', exact: false }).first()
  ).toHaveAttribute('href', /pattern-based-quadrangulation\.pdf$/);
  await panel.getByLabel('Learning topic', { exact: true }).selectOption('guides');
  await panel.getByRole('button', { name: 'Load example (undoable)', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Surface ready');
  await expect(page.getByRole('button', { name: 'Generate network', exact: true })).toBeEnabled();
  await expect(page.locator('.progress-panel')).toHaveCount(0);
  await expect(page.locator('.status-message')).toContainText(
    'Undo restores your previous project'
  );
  const loaded = await project(page);
  expect(loaded.graph).toBeNull();
  expect(loaded.guides).toHaveLength(1);
  await panel.getByText('Requested method (not generated)', { exact: true }).click();
  await expect(panel.locator('.learning-context')).toContainText(
    'Requested inputs (no generated result)'
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.canvas-heading')).toContainText('Connected geometric network');
  const restored = await project(page);
  expect(restored.graph).toEqual(before.graph);
  expect(restored.parameters).toEqual(before.parameters);
  expect(restored.surface).toEqual(before.surface);
});

test('learning panel and long references fit the 375px layout', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const panel = await learn(page);
  await panel.getByLabel('Learning topic', { exact: true }).selectOption('patch-quadrangulation');
  await panel.getByText('Assumptions and limits', { exact: true }).click();
  await expect(panel.getByRole('img', { name: 'Construction diagram', exact: true })).toBeVisible();
  await expect(
    panel.getByRole('link', { name: 'DOI: 10.1111/cgf.12443', exact: false })
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }))
  ).toEqual({ document: 375, body: 375 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/qa/learn-mobile-375.png', fullPage: true });
});

test('accepted method and spacing survive pending edits, cache restore and file import', async ({
  page,
}) => {
  const panel = await learn(page);
  const accepted = await project(page);
  await page.getByRole('button', { name: 'Gyro', exact: true }).click();
  await page.getByRole('slider', { name: 'Target spacing', exact: true }).fill('28');
  await expect(panel.locator('.learning-stale')).toBeVisible();
  await expect(panel.getByLabel('Learning topic', { exact: true })).toHaveValue('quad');
  await panel.getByText('Current viewport method', { exact: true }).click();
  await expect(panel.locator('.learning-context')).toContainText('Accepted graph');
  await expect(panel.locator('.learning-context')).not.toContainText('Hart (n.d.)');
  const pending = page.waitForEvent('download');
  await page.getByTitle('Save project JSON (⌘/Ctrl S)', { exact: true }).click();
  const downloaded = await pending;
  const record = JSON.parse(await text(downloaded));
  expect(record.methodRecord.resultIsStale).toBe(true);
  expect(record.methodRecord.implementation.parameters.family).toBe('quad');
  expect(record.methodRecord.implementation.requestedParameters.family).toBe('gyro');
  expect(record.methodRecord.implementation.requestedParameters.spacing).toBe(0.028);
  const path = await downloaded.path();
  if (!path) throw new Error('Saved stale project path unavailable.');
  await expect(page.getByTitle('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.canvas-heading')).toContainText('Result needs regeneration');
  const cached = await project(page);
  expect(cached.statistics!.spacingRmsRelative).toBeCloseTo(
    accepted.statistics!.spacingRmsRelative,
    12
  );
  expect(cached.graph).toEqual(accepted.graph);
  expect(cached.parameters.spacing).toBe(0.028);
  await page.getByLabel('Load project file').setInputFiles(path);
  await expect(page.locator('.status-message')).toContainText('Loaded ');
  const imported = await project(page);
  expect(imported.statistics!.spacingRmsRelative).toBeCloseTo(
    accepted.statistics!.spacingRmsRelative,
    12
  );
  expect(imported.graph).toEqual(accepted.graph);
  expect(imported.parameters.family).toBe('gyro');
});
