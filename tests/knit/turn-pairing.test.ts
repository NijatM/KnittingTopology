import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { bmpBytes } from '../../src/knit/files';
import { knitGraphFreshness, stageContentHash, validateKnitGraph } from '../../src/knit/knit-graph';
import { yarnJumpList } from '../../src/knit/turn-pairing';
import type { ShapePlacement } from '../../src/knit/shape-types';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';

// The user's measured jersey loop for the 200 mm saddle test (2 mm × 2 mm).
const swatches = [{ structure: 'jersey', stitchWidth: 0.002, courseHeight: 0.002 }];
const saddle = (curvature: number): SurfaceSpec => ({
  kind: 'saddle',
  size: 0.2,
  curvature,
  revision: 'turn-pairing',
});
const settings = (firstPass: KnitSettings['lab']['firstPass'], graph?: KnitSettings['graph']) => ({
  ...defaultKnitSettings(),
  mode: 'shape' as const,
  lab: { ...defaultKnitSettings().lab, firstPass },
  ...(graph ? { graph } : {}),
});
function build(surface: SurfaceSpec, knit: KnitSettings) {
  const r = buildKnitProgram({ surface, graph: null, swatches, knit });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
/** Active needle range of each pass, read back from the exported BMP (row 0 = pass 1). */
function bmpRanges(bmp: Uint8Array, w: number, h: number) {
  const stride = Math.ceil((w * 3) / 4) * 4;
  return Array.from({ length: h }, (_, y) => {
    const active: number[] = [];
    for (let x = 0; x < w; x++) {
      const i = 54 + y * stride + x * 3;
      if (bmp[i] !== 255 || bmp[i + 1] !== 255 || bmp[i + 2] !== 255) active.push(x);
    }
    return active;
  });
}

describe('short-row turn pairing (project rule)', () => {
  it('lists yarn jumps from a needle layout', () => {
    const at = (course: number, needle: number) => ({ course, needle }) as ShapePlacement;
    const placements = [at(0, 0), at(0, 9), at(1, 2), at(1, 8), at(2, 2), at(2, 5), at(3, 9)];
    // Pass 2 starts at 8 after pass 1 ended at 9; pass 3 starts at 2 where pass 2 ended; pass 4
    // starts at 9 after pass 3 ended at 5.
    expect(yarnJumpList({ h: 4, placements }, 1)).toEqual([{ pass: 4, from: 5, to: 9 }]);
    expect(yarnJumpList({ h: 4, placements }, -1)).toEqual([
      { pass: 2, from: 0, to: 2 },
      { pass: 3, from: 8, to: 5 },
      { pass: 4, from: 2, to: 9 },
    ]);
  });
  it.each([
    [0.8, 'left-to-right'],
    [1, 'left-to-right'],
    [1, 'right-to-left'],
    [1.1, 'right-to-left'],
  ] as const)(
    'pairs every turn of the 200 mm saddle at rise %s, %s',
    (curvature, firstPass) => {
      const p = build(saddle(curvature), settings(firstPass)),
        n = p.shape!.needles;
      expect(p.exportBlockers).toEqual([]);
      expect([n.yarnJumps, yarnJumpList(n, p.firstDir)]).toEqual([0, []]);
      expect(n.steps.some((s) => s.role === 'turn')).toBe(true);
      expect(p.issues.some((i) => i.startsWith('Short-row turns are paired'))).toBe(true);
      // The exported bitmap itself: each pass is one run that starts where the previous pass ended.
      let end: number | undefined;
      bmpRanges(bmpBytes(p), p.w, p.h).forEach((active, y) => {
        expect(active.length).toBe(active.at(-1)! - active[0]! + 1);
        const forward = p.firstDir * (y % 2 ? -1 : 1) === 1,
          start = forward ? active[0]! : active.at(-1)!;
        if (end !== undefined) expect(Math.abs(start - end)).toBeLessThanOrEqual(1);
        end = forward ? active.at(-1)! : active[0]!;
      });
    },
    30000
  );
  it('records the paired courses so saved stages rebuild the same bitmap', () => {
    const surface = saddle(1),
      p = build(surface, settings('left-to-right')),
      stages = validateKnitGraph(JSON.parse(JSON.stringify(p.shape!.knitGraph!.stages)));
    expect(stages.loops!.rows).toHaveLength(p.h);
    expect(p.issues.find((i) => i.startsWith('Short-row turns are paired'))).toMatch(
      /This layout: \d+ loops removed, at most \d+ from one wale \(\d+\.\d mm\)\./
    );
    const knit = settings('left-to-right', stages);
    expect(knitGraphFreshness({ surface, knit, swatches })).toMatchObject({
      courses: 'fresh',
      loops: 'fresh',
    });
    const saved = build(surface, knit);
    expect(saved.shape!.knitGraph!.saved).toEqual({ courses: true, loops: true });
    expect(bmpBytes(saved)).toEqual(bmpBytes(p));
    const coursesOnly = build(
      surface,
      settings('left-to-right', { courseMethod: stages.courseMethod, courses: stages.courses })
    );
    expect(bmpBytes(coursesOnly)).toEqual(bmpBytes(p));
  }, 30000);
  it('leaves a layout without turns unchanged', () => {
    const p = build(
      { kind: 'plane', size: 0.05, curvature: 0, revision: 'p' },
      settings('left-to-right')
    );
    expect(p.exportBlockers).toEqual([]);
    expect(p.shape!.knitGraph!.stages.loops!.rows).toBeUndefined();
    expect(p.issues.some((i) => i.startsWith('Short-row turns are paired'))).toBe(false);
  });
  it('hashes a stage independently of its key order', () => {
    const p = build(
      { kind: 'plane', size: 0.05, curvature: 0, revision: 'p' },
      settings('left-to-right')
    );
    const courses = p.shape!.knitGraph!.stages.courses,
      reordered = Object.fromEntries(Object.entries(courses).reverse()) as typeof courses;
    expect(stageContentHash(reordered)).toBe(stageContentHash(courses));
  });
});
