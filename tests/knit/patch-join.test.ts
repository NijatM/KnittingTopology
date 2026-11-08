import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { knitReport } from '../../src/knit/report';
import { pairInOrder, rotatedGrid, loopPatch } from '../../src/knit/patch-join';
import {
  addSplit,
  patchSettings,
  pieceBuild,
  seamMapJson,
  toggleEdge,
  withPatchSettings,
} from '../../src/knit/patches';
import { historyReducer } from '../../src/app/project';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height; reverse jersey 9 mm × 4 mm.
const swatches = [
  { structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 },
  { structure: 'reverse', stitchWidth: 0.009, courseHeight: 0.004 },
];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'pt' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'pt' };
const knit = (extra: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  mode: 'shape',
  ...extra,
});
const set = (s: KnitSettings, i: number, extra: Partial<KnitSettings>) =>
  withPatchSettings(s, i, { ...patchSettings(s, i), ...extra });
function build(surface: SurfaceSpec, settings: KnitSettings) {
  const r = buildKnitProgram({ surface, graph: null, swatches, knit: settings });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
/** The program of the piece that holds `patch`. */
function piece(surface: SurfaceSpec, settings: KnitSettings, patch = 0) {
  const b = pieceBuild(build(surface, settings).patches!, patch);
  if (!b.ok) throw new Error(b.reason);
  return b.program;
}

describe('knitted-through joins (project construction; Popescu 2019, §6.3.2)', () => {
  it('pairs edge courses one to one in order, and skips a course without a near partner', () => {
    expect(pairInOrder([0, 1, 2], [0, 1, 2])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    // Skipping costs half the larger mean spacing (1.45 / 2): course 1 on the left is left out.
    expect(pairInOrder([0, 1, 2, 3], [0.1, 2.1, 3])).toEqual([
      [0, 0],
      [2, 1],
      [3, 2],
    ]);
    expect(pairInOrder([0.5], [0.4])).toEqual([[0, 0]]);
    expect(pairInOrder([], [1])).toEqual([]);
  });

  it('places patches in the common knitting frame: bands along the wales, columns from needle 1', () => {
    const layout = { u: [0.5], v: [0.4] };
    const at = (start: 'v0' | 'v1' | 'u0' | 'u1') =>
      [0, 1, 2, 3].map((i) => rotatedGrid(layout, start).at(i));
    expect(at('v0')).toEqual([
      { band: 0, col: 0 },
      { band: 0, col: 1 },
      { band: 1, col: 0 },
      { band: 1, col: 1 },
    ]);
    expect(at('v1')[0]).toEqual({ band: 1, col: 1 });
    expect(at('u0')[1]).toEqual({ band: 1, col: 1 });
    expect(at('u1')[1]).toEqual({ band: 0, col: 0 });
    expect(loopPatch('P12/loop:3')).toBe(11);
    expect(loopPatch('loop:3')).toBe(-1);
  });

  it('joins two plane patches side by side into the whole chart: exact counts, no seams', () => {
    const settings = addSplit(knit(), 'u', 0.5);
    const program = build(plane, settings),
      { pieces, seams } = program.patches!;
    expect(pieces.map((p) => p.label)).toEqual(['piece P1 (P1, P2)']);
    expect(seams).toEqual([]);
    const p = piece(plane, settings);
    // 100 mm across at 6 mm loops: 9 + 9 needles; 100 mm along at 4 mm courses: 25 passes.
    expect([p.w, p.h]).toEqual([18, 25]);
    expect(p.shape!.needles.placements).toHaveLength(18 * 25);
    expect(p.exportBlockers).toEqual([]);
    expect(p.shape!.stops).toEqual([]);
    expect(new Set(p.shape!.needles.placements.map((x) => loopPatch(x.loop.id)))).toEqual(
      new Set([0, 1])
    );
    expect(p.shape!.geometry.method).toMatch(/^Joined patches \(project construction\)/);
    expect(p.shape!.knitGraph!.saved).toEqual({ courses: false, loops: false });
    // Each patch keeps its own courses stage; the joined loop graph is not saved.
    expect(pieces[0]!.stages.map((g) => [!!g?.courses, !!g?.loops])).toEqual([
      [true, false],
      [true, false],
    ]);
    let saved = settings;
    pieces[0]!.patches.forEach((patch, k) => {
      saved = set(saved, patch, { graph: pieces[0]!.stages[k] });
    });
    // The project saves a patch's courses-only stages, outside the undo history.
    const present = {
      surface: plane,
      knit: settings,
      swatches,
      revision: 1,
    } as unknown as Parameters<typeof historyReducer>[0]['present'];
    const history = { past: [present], present: { ...present, revision: 2 }, future: [] };
    const accepted = historyReducer(history, {
      type: 'accept-knit-graph',
      graph: pieces[0]!.stages[1]!,
      patch: 1,
    });
    expect(accepted.past).toBe(history.past);
    expect(accepted.present.knit!.patches!.patches[1]!.graph).toEqual(pieces[0]!.stages[1]);
    const again = piece(plane, saved);
    expect(again.shape!.knitGraph!.saved).toEqual({ courses: true, loops: false });
    expect(again.cells).toEqual(p.cells);
    const report = knitReport(p, 'test', plane.size);
    expect(report).toContain('This report and its bitmap are for piece P1 (P1, P2) (piece 1 of 1)');
    expect(report).toContain('Knitted-through edges: u1:1.');
    expect(report).toContain('none: every shared edge is knitted through.');
    expect(JSON.parse(seamMapJson(plane, settings.patches!, seams))).toMatchObject({
      version: 2,
      layout: { through: ['u1:1'] },
      pieces: [{ piece: 'P1', patches: ['P1', 'P2'] }],
      seams: [],
    });
  });

  it('joins a 2 × 2 saddle layout into one piece without export blockers', () => {
    const settings = addSplit(addSplit(knit(), 'u', 0.5), 'v', 0.5);
    const p = piece(saddle, settings);
    expect(p.exportBlockers).toEqual([]);
    expect(new Set(p.shape!.needles.placements.map((x) => loopPatch(x.loop.id)))).toEqual(
      new Set([0, 1, 2, 3])
    );
  });

  it('lets an L-shaped piece stop where a patch ends under a seam, and lists the seams', () => {
    const settings = toggleEdge(
      toggleEdge(addSplit(addSplit(knit(), 'u', 0.5), 'v', 0.5), 'v1:2'),
      'u1:2'
    );
    const program = build(saddle, settings),
      { pieces, seams } = program.patches!;
    expect(pieces.map((p) => p.label)).toEqual(['piece P1 (P1, P2, P3)', 'P4']);
    const l = piece(saddle, settings);
    expect(l.exportBlockers).toEqual([]);
    // P2 (lower right) ends under the seam to P4: its needles stop; the issue says how to finish them.
    const stops = l.shape!.stops!;
    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((t) => t.patch === 'P2/' && !t.reused)).toBe(true);
    expect(l.issues.some((x) => /stop inside the piece/.test(x) && /no cast-off/.test(x))).toBe(
      true
    );
    expect(knitReport(l, 'test', saddle.size)).toMatch(
      /P2 stops after pass \d+ on needles \d+-\d+: cast off in the lab software, or hold the loops to the end\./
    );
    expect(seams.map((s) => [s.id, s.sides.map((x) => x.piece)])).toEqual([
      ['u1:2', [0, 3]],
      ['v1:2', [0, 3]],
    ]);
    // P4 is selected through its own piece.
    const p4 = pieceBuild(program.patches!, 3);
    if (!p4.ok) throw new Error(p4.reason);
    expect(p4.program.patches!.piece).toBe(1);
  });

  it('blocks export for a seam inside one piece and for separate arms in one band', () => {
    const ring = toggleEdge(addSplit(addSplit(knit(), 'u', 0.5), 'v', 0.5), 'u1:2');
    expect(piece(saddle, ring).exportBlockers).toContain(
      'Seam u1:2 lies between P3 and P4 of the same piece: the bitmap cannot leave it open. Knit the edge through, or make more edges seams to separate the patches.'
    );
    // A U on the plane: P5 (top middle) is cut off, so the top band holds two arms, P4 and P6.
    let u = addSplit(addSplit(addSplit(knit(), 'u', 0.34), 'u', 0.67), 'v', 0.5);
    for (const id of ['v1:2', 'u1:2', 'u2:2']) u = toggleEdge(u, id);
    const program = build(plane, u);
    expect(program.patches!.pieces.map((p) => p.label)).toEqual([
      'piece P1 (P1, P2, P3, P4, P6)',
      'P5',
    ]);
    expect(piece(plane, u).exportBlockers).toContain(
      'The piece has separate arms in one band (a U, an arch or a ring): the yarn jumps between them. Make an edge a seam to knit the arms as separate pieces.'
    );
  });

  it('keeps each patch fill in a joined piece (jersey beside reverse jersey)', () => {
    const settings = set(addSplit(knit(), 'u', 0.5), 1, {
      cells: { ...knit().cells, fill: 'reverse' },
    });
    const p = piece(plane, settings);
    expect(p.exportBlockers).toEqual([]);
    expect(
      p.issues.some((x) => x.startsWith('Fills differ within the piece (jersey, reverse)'))
    ).toBe(true);
    // 50 mm at 6 mm loops (9 needles) beside 50 mm at 9 mm loops (6 needles).
    expect(p.w).toBe(15);
    const op = (needle: number, pass: number) =>
      p.key.ops[p.cells[(p.h - 1 - pass) * p.w + needle]!]!.steps[0]!.bed;
    expect(op(0, 0)).toBe('front');
    expect(op(14, 0)).toBe('back');
  });

  it('keeps a Popescu-method patch’s loop links and pairs the other patch’s turns', () => {
    const two = addSplit(knit(), 'u', 0.5);
    const popescu = { courseMethod: 'popescu-2019-rules' as const };
    const plain = piece(plane, set(two, 1, popescu));
    expect(plain.exportBlockers).toEqual([]);
    expect(plain.issues).toContain(
      'A Popescu-method patch keeps its loop connections inside the patch; turn pairing never removes its loops, so a short-row turn that needs it blocks export.'
    );
    // On the saddle, the project-method patch's short rows are paired around the Popescu patch.
    const curved = piece(saddle, set(two, 0, popescu));
    expect(curved.exportBlockers).toEqual([]);
    expect(curved.shape!.needles.placements.some((x) => loopPatch(x.loop.id) === 0)).toBe(true);
  });
});
