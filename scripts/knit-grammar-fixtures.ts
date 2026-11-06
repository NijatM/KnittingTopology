// Writes the fixtures in tests/fixtures/knit with Knit Grammar's own code (a sibling checkout of
// KnittingPixelArtEditor, read only). Not part of the build or the test run; see tests/fixtures/knit/README.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import { BASIC, TWO } from '../../KnittingPixelArtEditor/src/grammar/ops';
import { createPattern, toJSON } from '../../KnittingPixelArtEditor/src/grammar/pattern';
import { bmpOf } from '../../KnittingPixelArtEditor/src/grammar/io';
import { runChecks } from '../../KnittingPixelArtEditor/src/grammar/checks';
import { STRUCTURES_1, STRUCTURES_2, generate, newSign } from '../../KnittingPixelArtEditor/src/grammar/structures';

const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
const lcg = (seed: number) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

async function pattern(file: string, o: { name: string; w: number; h: number; key: typeof BASIC; firstDir: 1 | -1; note: string; cell: (x: number, y: number) => number }) {
  const p = createPattern({ name: o.name, w: o.w, h: o.h, key: o.key });
  p.firstDir = o.firstDir;
  p.note = o.note;
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) p.cells[y * o.w + x] = o.cell(x, y);
  writeFileSync(`${out}/${file}.bmp`, Buffer.from(await bmpOf(p).arrayBuffer()));
  writeFileSync(`${out}/${file}.json`, toJSON(p));
  return p;
}

const r = lcg(7);
await pattern('basic-all-ops', { name: 'fixture basic', w: 7, h: 5, key: BASIC, firstDir: 1, note: 'all eleven operations', cell: (x, y) => (x + 3 * y) % 11 });
await pattern('basic-reversed', { name: 'fixture reversed', w: 13, h: 3, key: BASIC, firstDir: 1, note: '', cell: (x, y) => 10 - ((x + y) % 11) });
await pattern('two-guide', { name: 'fixture two guides', w: 6, h: 4, key: TWO, firstDir: -1, note: 'two guides, right to left', cell: (x, y) => (x + y) % 7 });

// checks: random basic and two-guide programs, tight limits
const lim = { float: 3, held: 4, tucks: 2 };
const checks: Record<string, unknown> = { limits: lim };
for (const [name, key, n] of [['basic', BASIC, 11], ['two', TWO, 7]] as const) {
  const p = await pattern(`checks-${name}`, { name: `checks ${name}`, w: 20, h: 20, key, firstDir: 1, note: '', cell: () => Math.floor(r() * r() * n) });
  checks[name] = runChecks(p, lim);
}
writeFileSync(`${out}/checks.json`, JSON.stringify(checks));

// structures: data and the tiling generate() produces from a design layer
const tiling: Record<string, unknown> = { structures1: STRUCTURES_1, structures2: STRUCTURES_2 };
const ids = ['jersey', 'rib22', 'garter', 'seed', 'tuckmoss', 'honeycomb', 'slip', 'eyelet'];
const p = createPattern({ name: 'tiling', w: 17, h: 15, key: BASIC });
p.design = { cells: new Uint8Array(17 * 15), signs: ids.map((id, i) => newSign(i, id)), custom: [], live: true };
for (let y = 0; y < 15; y++) for (let x = 0; x < 17; x++) p.design.cells[y * 17 + x] = (Math.floor(x / 3) + Math.floor(y / 4)) % 8;
tiling.design = { w: 17, h: 15, signs: ids, cells: [...p.design.cells], generated: [...generate(p)] };
writeFileSync(`${out}/structures.json`, JSON.stringify(tiling));
console.log('fixtures written to', out);
