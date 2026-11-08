// Computational patches (Popescu 2019, §6.3.2, pp. 109–110). The thesis splits the geometry into patches
// by hand before pattern generation; each patch has its own knitting direction and loop dimensions. It
// develops no subdivision strategy. Project restriction: full-length split lines at constant chart u or v
// give a grid of rectangular patches. In this version every shared edge is a seam: each patch is knitted
// as its own piece, and the seam map pairs the loops or course ends on both sides by position.
import type {
  GenerationContext,
  KnitPatch,
  KnitPatchLayout,
  KnitSettings,
  ProjectState,
  SurfaceSpec,
  SwatchEntry,
  Vec2,
  Vec3,
} from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import type { KnitBuild, KnitProgram } from './program';
import { buildShapeProgram } from './shape-program';
import { rotatedShapeUV } from './shape-geometry';
import type { ChartWindow } from './shape-types';

/** Project limits. */
export const MAX_SPLITS = 8;
export const MIN_SPLIT_GAP = 0.02;
export const SEAM_MAP_FORMAT = 'knit-patch-seam-map';
export const PATCH_PAIRING_RULE =
  'Each element on the side with more elements is paired with the nearest element on the other side, by position along the edge (project rule).';
export type SplitAxis = 'u' | 'v';

export const patchCount = (layout: Pick<KnitPatchLayout, 'u' | 'v'>) =>
  (layout.u.length + 1) * (layout.v.length + 1);
export const patchLabel = (index: number) => `P${index + 1}`;
const bounds = (splits: number[]) => [0, ...splits, 1];
export function patchWindow(layout: Pick<KnitPatchLayout, 'u' | 'v'>, index: number): ChartWindow {
  const cols = layout.u.length + 1,
    col = index % cols,
    row = Math.floor(index / cols),
    us = bounds(layout.u),
    vs = bounds(layout.v);
  return { u: [us[col]!, us[col + 1]!], v: [vs[row]!, vs[row + 1]!] };
}
/** The patch containing chart point `uv` (a point on a split line belongs to the patch above or right). */
export function patchAt(layout: Pick<KnitPatchLayout, 'u' | 'v'>, uv: Vec2): number {
  const col = layout.u.filter((x) => uv[0] >= x).length,
    row = layout.v.filter((x) => uv[1] >= x).length;
  return row * (layout.u.length + 1) + col;
}

/** A patch's settings in whole-chart form: its start edge, fill, course method, settings and stages. */
export function patchSettings(settings: KnitSettings, index: number): KnitSettings {
  const patch = settings.patches!.patches[index]!;
  const { patches: _p, graph: _g, courseMethod: _c, popescu: _s, ...rest } = settings;
  return {
    ...rest,
    startEdge: patch.startEdge,
    cells: { ...settings.cells, fill: patch.fill },
    ...(patch.courseMethod ? { courseMethod: patch.courseMethod } : {}),
    ...(patch.popescu ? { popescu: { ...patch.popescu } } : {}),
    ...(patch.graph ? { graph: patch.graph } : {}),
  };
}
/** The patch fields of whole-chart settings (the inverse of `patchSettings`). */
export function patchOf(settings: KnitSettings, withGraph = true): KnitPatch {
  return {
    startEdge: settings.startEdge ?? 'v0',
    fill: settings.cells.fill,
    ...(settings.courseMethod ? { courseMethod: settings.courseMethod } : {}),
    ...(settings.popescu ? { popescu: { ...settings.popescu } } : {}),
    ...(withGraph && settings.graph ? { graph: settings.graph } : {}),
  };
}
/** Replace patch `index` with the patch fields of `view` (from `patchSettings`, then changed). */
export function withPatchSettings(
  settings: KnitSettings,
  index: number,
  view: KnitSettings
): KnitSettings {
  const layout = settings.patches!;
  return {
    ...settings,
    patches: {
      ...layout,
      patches: layout.patches.map((p, i) => (i === index ? patchOf(view) : p)),
    },
  };
}
/** Whole-chart settings after a change made in a patch's view: the patch fields (start edge, fill,
 * course method, settings, stages) go to the patch; everything else is shared by all patches. */
export function fromPatchView(
  settings: KnitSettings,
  index: number,
  view: KnitSettings
): KnitSettings {
  const layout = settings.patches!;
  const { startEdge: _e, courseMethod: _m, popescu: _s, graph: _g, patches: _l, ...shared } = view;
  return {
    ...shared,
    ...(settings.startEdge ? { startEdge: settings.startEdge } : {}),
    ...(settings.courseMethod ? { courseMethod: settings.courseMethod } : {}),
    ...(settings.popescu ? { popescu: settings.popescu } : {}),
    cells: { ...view.cells, fill: settings.cells.fill },
    patches: {
      ...layout,
      patches: layout.patches.map((p, i) => (i === index ? patchOf(view) : p)),
    },
  };
}
/** Each patch in whole-chart form, with its rectangle and label; one whole-chart entry without patches. */
export function chartParts(
  settings: KnitSettings
): { index: number; label: string; window?: ChartWindow; settings: KnitSettings }[] {
  const layout = settings.patches;
  if (!layout) return [{ index: 0, label: '', settings }];
  return layout.patches.map((_, index) => ({
    index,
    label: patchLabel(index),
    window: patchWindow(layout, index),
    settings: patchSettings(settings, index),
  }));
}
/** Settings without saved stages (top level and patches): stages enter signatures separately. */
export function withoutStages(settings: KnitSettings): KnitSettings {
  const { graph: _g, ...rest } = settings;
  return rest.patches
    ? { ...rest, patches: { ...rest.patches, patches: rest.patches.patches.map(withoutGraph) } }
    : rest;
}
const withoutGraph = ({ graph: _g, ...patch }: KnitPatch): KnitPatch => patch;

/** Why a split value cannot be used, or null. */
export function splitProblem(splits: number[], value: number, ignore = -1): string | null {
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 'A split must lie strictly between 0 and 1.';
  const others = splits.filter((_, i) => i !== ignore);
  if (ignore < 0 && others.length >= MAX_SPLITS)
    return `At most ${MAX_SPLITS} splits in each direction (project limit).`;
  if ([0, 1, ...others].some((x) => Math.abs(x - value) < MIN_SPLIT_GAP - 1e-12))
    return `Splits must be at least ${MIN_SPLIT_GAP} apart and from the chart sides (project limit).`;
  return null;
}
/** Rebuild the grid for new split lists. Each new patch copies the old patch at its centre; a patch whose
 * rectangle changed loses its stages (its region changed). */
function regrid(layout: KnitPatchLayout, u: number[], v: number[]): KnitPatchLayout {
  const next: KnitPatchLayout = { kind: 'chart-grid', u, v, patches: [] };
  for (let i = 0; i < patchCount(next); i++) {
    const w = patchWindow(next, i),
      centre: Vec2 = [(w.u[0] + w.u[1]) / 2, (w.v[0] + w.v[1]) / 2],
      from = patchAt(layout, centre),
      old = patchWindow(layout, from),
      same = [0, 1].every((k) => old.u[k] === w.u[k] && old.v[k] === w.v[k]),
      patch = layout.patches[from]!;
    next.patches.push(same ? patch : withoutGraph(patch));
  }
  return next;
}
/** Add a split; the first split turns the whole-chart settings into two patches. */
export function addSplit(settings: KnitSettings, axis: SplitAxis, value: number): KnitSettings {
  const layout: KnitPatchLayout = settings.patches ?? {
    kind: 'chart-grid',
    u: [],
    v: [],
    patches: [patchOf(settings, false)],
  };
  const problem = splitProblem(layout[axis], value);
  if (problem) throw new Error(problem);
  const splits = [...layout[axis], value].sort((a, b) => a - b);
  const { graph: _g, ...rest } = settings;
  return {
    ...rest,
    patches: regrid(layout, axis === 'u' ? splits : layout.u, axis === 'v' ? splits : layout.v),
  };
}
export function moveSplit(
  settings: KnitSettings,
  axis: SplitAxis,
  index: number,
  value: number
): KnitSettings {
  const layout = settings.patches;
  if (!layout || index < 0 || index >= layout[axis].length)
    throw new Error('There is no such split.');
  const problem = splitProblem(layout[axis], value, index);
  if (problem) throw new Error(problem);
  if (layout[axis][index] === value) return settings;
  // Moving keeps the order: the value stays between its neighbours.
  const lo = index ? layout[axis][index - 1]! : 0,
    hi = index < layout[axis].length - 1 ? layout[axis][index + 1]! : 1;
  if (value <= lo || value >= hi)
    throw new Error('A split cannot move past its neighbouring split; remove and add it instead.');
  const splits = layout[axis].map((x, i) => (i === index ? value : x));
  // Patches keep their numbers; those beside the moved line lose their stages.
  const next = { ...layout, [axis]: splits } as KnitPatchLayout;
  return {
    ...settings,
    patches: {
      ...next,
      patches: layout.patches.map((p, i) => {
        const a = patchWindow(layout, i),
          b = patchWindow(next, i);
        return [0, 1].every((k) => a.u[k] === b.u[k] && a.v[k] === b.v[k]) ? p : withoutGraph(p);
      }),
    },
  };
}
/** Remove a split: each merged patch keeps the settings of the patch below or left of the line. Removing
 * the last split returns them to the whole-chart settings. */
export function removeSplit(settings: KnitSettings, axis: SplitAxis, index: number): KnitSettings {
  const layout = settings.patches;
  if (!layout || index < 0 || index >= layout[axis].length)
    throw new Error('There is no such split.');
  const value = layout[axis][index]!,
    splits = layout[axis].filter((_, i) => i !== index);
  const u = axis === 'u' ? splits : layout.u,
    v = axis === 'v' ? splits : layout.v;
  const next: KnitPatchLayout = { kind: 'chart-grid', u, v, patches: [] };
  for (let i = 0; i < patchCount(next); i++) {
    const w = patchWindow(next, i),
      k = axis === 'u' ? 0 : 1,
      // A point just below/left of the removed line inside the merged patch.
      probe: Vec2 = [(w.u[0] + w.u[1]) / 2, (w.v[0] + w.v[1]) / 2];
    if ((k ? w.v : w.u)[0] < value && value < (k ? w.v : w.u)[1]) probe[k] = value - 1e-9;
    const from = patchAt(layout, probe),
      old = patchWindow(layout, from),
      same = [0, 1].every((j) => old.u[j] === w.u[j] && old.v[j] === w.v[j]);
    next.patches.push(same ? layout.patches[from]! : withoutGraph(layout.patches[from]!));
  }
  if (u.length || v.length) return { ...settings, patches: next };
  const only = next.patches[0]!,
    { patches: _p, graph: _g, courseMethod: _c, popescu: _s, ...rest } = settings;
  return {
    ...rest,
    startEdge: only.startEdge,
    cells: { ...settings.cells, fill: only.fill },
    ...(only.courseMethod ? { courseMethod: only.courseMethod } : {}),
    ...(only.popescu ? { popescu: only.popescu } : {}),
  };
}

// ---- pieces --------------------------------------------------------------------------------------
export interface PatchPiece {
  index: number;
  label: string;
  window: ChartWindow;
  build: KnitBuild;
}
export interface SeamElement {
  kind: 'loop' | 'course end';
  /** Loop ID in the patch's knit graph. */
  loop: string;
  /** 1-based needle and pass in the patch's bitmap. */
  needle: number;
  pass: number;
  /** Fraction along the edge, from its lower chart end. */
  at: number;
  position: Vec3;
}
export type PatchSide = 'start' | 'end' | 'needle-1' | 'far';
export interface SeamSide {
  patch: number;
  side: PatchSide;
  /** Null when the patch has no bitmap. */
  elements: SeamElement[] | null;
}
export interface PatchSeam {
  id: string;
  /** The split line: constant chart `axis` = `value`, from `range[0]` to `range[1]` along the other axis. */
  axis: SplitAxis;
  value: number;
  range: [number, number];
  /** Sampled 3D length in meters. */
  length: number;
  sides: [SeamSide, SeamSide];
  /** Indices into the two sides' elements. */
  pairs: [number, number][];
  /** Elements of each side without a partner. */
  unpaired: [number[], number[]];
}
export interface PatchBuild {
  pieces: PatchPiece[];
  seams: PatchSeam[];
  /** The piece shown in `program`. */
  piece: number;
}

/** Which side of its patch a chart side is, in the patch's knitting frame. */
export function patchSide(
  patch: Pick<KnitPatch, 'startEdge'>,
  window: ChartWindow,
  chartSide: 'u0' | 'u1' | 'v0' | 'v1'
): PatchSide {
  const mid: Vec2 =
    chartSide[0] === 'u'
      ? [window.u[chartSide === 'u0' ? 0 : 1], (window.v[0] + window.v[1]) / 2]
      : [(window.u[0] + window.u[1]) / 2, window.v[chartSide === 'v0' ? 0 : 1]];
  const [x, y] = rotatedShapeUV(mid, patch.startEdge, window);
  return y < 0.25 ? 'start' : y > 0.75 ? 'end' : x < 0.25 ? 'needle-1' : 'far';
}
/** Shared edges of the grid: each split line between two neighbouring crossings. */
export function sharedEdges(layout: Pick<KnitPatchLayout, 'u' | 'v'>) {
  const cols = layout.u.length + 1,
    us = bounds(layout.u),
    vs = bounds(layout.v),
    edges: {
      id: string;
      axis: SplitAxis;
      value: number;
      range: [number, number];
      a: number;
      b: number;
    }[] = [];
  layout.u.forEach((value, s) => {
    for (let row = 0; row < layout.v.length + 1; row++)
      edges.push({
        id: `u${s + 1}:${row + 1}`,
        axis: 'u',
        value,
        range: [vs[row]!, vs[row + 1]!],
        a: row * cols + s,
        b: row * cols + s + 1,
      });
  });
  layout.v.forEach((value, s) => {
    for (let col = 0; col < cols; col++)
      edges.push({
        id: `v${s + 1}:${col + 1}`,
        axis: 'v',
        value,
        range: [us[col]!, us[col + 1]!],
        a: s * cols + col,
        b: (s + 1) * cols + col,
      });
  });
  return edges;
}
/** Chart polyline of a shared edge, `count` segments. */
export function edgePath(
  edge: { axis: SplitAxis; value: number; range: [number, number] },
  count = 32
): Vec2[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const t = edge.range[0] + ((edge.range[1] - edge.range[0]) * i) / count;
    return edge.axis === 'u' ? [edge.value, t] : [t, edge.value];
  });
}
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function sideElements(
  program: KnitProgram | null,
  side: PatchSide,
  edge: { axis: SplitAxis; range: [number, number] }
): SeamElement[] | null {
  const shape = program?.shape;
  if (!shape) return null;
  const { w, h } = shape.needles,
    cell = new Map<number, [number, number]>();
  shape.placementAt.forEach((p, i) => {
    if (p >= 0 && !cell.has(p)) cell.set(p, [(i % w) + 1, h - Math.floor(i / w)]);
  });
  const index = new Map(shape.needles.placements.map((p, i) => [p.loop.id, i]));
  const courses = shape.geometry.courses,
    loops =
      side === 'start'
        ? (courses[0]?.loops ?? [])
        : side === 'end'
          ? (courses.at(-1)?.loops ?? [])
          : courses
              .filter((c) => (side === 'needle-1' ? c.leftBoundary : c.rightBoundary))
              .map((c) => (side === 'needle-1' ? c.loops[0]! : c.loops.at(-1)!));
  const k = edge.axis === 'u' ? 1 : 0,
    span = edge.range[1] - edge.range[0];
  return loops
    .map((l) => {
      const [needle, pass] = cell.get(index.get(l.id) ?? -1) ?? [0, 0];
      return {
        kind: side === 'start' || side === 'end' ? ('loop' as const) : ('course end' as const),
        loop: l.id,
        needle,
        pass,
        at: Math.min(1, Math.max(0, (l.uv[k]! - edge.range[0]) / span)),
        position: l.position,
      };
    })
    .sort((a, b) => a.at - b.at);
}
/** Pairing by position along the edge (project rule): each element on the longer side gets the nearest
 * element on the other side. */
export function pairByPosition(
  a: readonly { at: number }[],
  b: readonly { at: number }[]
): { pairs: [number, number][]; unpaired: [number[], number[]] } {
  const swap = a.length < b.length,
    [many, few] = swap ? [b, a] : [a, b],
    pairs: [number, number][] = [],
    used = new Set<number>();
  if (few.length)
    many.forEach((e, i) => {
      let best = 0;
      few.forEach((f, j) => {
        if (Math.abs(f.at - e.at) < Math.abs(few[best]!.at - e.at)) best = j;
      });
      used.add(best);
      pairs.push(swap ? [best, i] : [i, best]);
    });
  const lonely = few.map((_, j) => j).filter((j) => !used.has(j)),
    all = many.length && !few.length ? many.map((_, i) => i) : [];
  return {
    pairs,
    unpaired: swap ? [lonely, all] : [all, lonely],
  };
}
export function patchSeams(
  surface: SurfaceSpec,
  layout: KnitPatchLayout,
  pieces: readonly PatchPiece[]
): PatchSeam[] {
  return sharedEdges(layout).map((edge) => {
    const path = edgePath(edge).map((uv) => evaluateSurface(surface, 0, uv[0], uv[1]));
    let length = 0;
    for (let i = 1; i < path.length; i++) length += dist(path[i - 1]!, path[i]!);
    const sideOf = (patch: number, chartSide: 'u0' | 'u1' | 'v0' | 'v1'): SeamSide => {
      const piece = pieces[patch],
        side = patchSide(layout.patches[patch]!, patchWindow(layout, patch), chartSide);
      return {
        patch,
        side,
        elements: sideElements(piece?.build.ok ? piece.build.program : null, side, edge),
      };
    };
    // The lower/left patch meets the line on its u1/v1 side, the other on its u0/v0 side.
    const sides: [SeamSide, SeamSide] =
      edge.axis === 'u'
        ? [sideOf(edge.a, 'u1'), sideOf(edge.b, 'u0')]
        : [sideOf(edge.a, 'v1'), sideOf(edge.b, 'v0')];
    const paired =
      sides[0].elements && sides[1].elements
        ? pairByPosition(sides[0].elements, sides[1].elements)
        : { pairs: [], unpaired: [[], []] as [number[], number[]] };
    return {
      id: edge.id,
      axis: edge.axis,
      value: edge.value,
      range: edge.range,
      length,
      sides,
      ...paired,
    };
  });
}
/** Build every patch as its own piece (all shared edges are seams in this version). */
export function buildPatchPieces(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  context?: GenerationContext
): PatchPiece[] {
  const layout = settings.patches!,
    count = patchCount(layout);
  return layout.patches.map((_, index) => {
    const label = patchLabel(index),
      window = patchWindow(layout, index);
    const build = buildShapeProgram(
      project,
      patchSettings(settings, index),
      swatches,
      {
        ...context,
        progress: (fraction, stage) =>
          context?.progress?.((index + fraction) / count, `${label}: ${stage}`),
      },
      window
    );
    return { index, label, window, build };
  });
}
/** The build of piece `index`, carrying the patch overview. */
export function pieceBuild(patches: Omit<PatchBuild, 'piece'>, index: number): KnitBuild {
  const piece = patches.pieces[index];
  if (!piece)
    return { ok: false, reason: 'This patch is not generated yet. Generate the knit program.' };
  if (!piece.build.ok) return { ok: false, reason: `${piece.label}: ${piece.build.reason}` };
  return { ok: true, program: { ...piece.build.program, patches: { ...patches, piece: index } } };
}
export function buildPatchedProgram(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  context?: GenerationContext
): KnitBuild {
  const pieces = buildPatchPieces(project, settings, swatches, context),
    seams = patchSeams(project.surface, settings.patches!, pieces),
    first = Math.max(
      0,
      pieces.findIndex((p) => p.build.ok)
    );
  const build = pieceBuild({ pieces, seams }, first);
  if (build.ok) return build;
  return {
    ok: false,
    reason: pieces.map((p) => `${p.label}: ${p.build.ok ? 'ok' : p.build.reason}`).join(' '),
  };
}

export function seamMapJson(
  surface: SurfaceSpec,
  layout: KnitPatchLayout,
  seams: readonly PatchSeam[]
): string {
  const round = (x: number) => Math.round(x * 1e9) / 1e9;
  return JSON.stringify(
    {
      format: SEAM_MAP_FORMAT,
      version: 1,
      units: 'm',
      method:
        'Computational patches (Popescu 2019, §6.3.2): chart-grid split lines (project restriction); every shared edge is a seam.',
      pairing: PATCH_PAIRING_RULE,
      note: 'Sewing guidance from a geometric prediction, not a sewing sequence. Count and length differences are reported, not blocking.',
      surface: {
        kind: surface.kind,
        size: surface.size,
        curvature: surface.curvature,
        revision: surface.revision,
        mapping: surface.mapping ?? null,
      },
      layout: { kind: layout.kind, u: layout.u, v: layout.v },
      patches: layout.patches.map((p, i) => ({
        patch: patchLabel(i),
        chart: patchWindow(layout, i),
        startEdge: p.startEdge,
        fill: p.fill,
        courseMethod: p.courseMethod ?? 'project-alignment',
      })),
      seams: seams.map((s) => ({
        id: s.id,
        chart: { axis: s.axis, value: s.value, range: s.range },
        length: round(s.length),
        sides: s.sides.map((side) => ({
          patch: patchLabel(side.patch),
          side: side.side,
          count: side.elements?.length ?? null,
          elements:
            side.elements?.map((e) => ({
              kind: e.kind,
              loop: e.loop,
              needle: e.needle,
              pass: e.pass,
              at: round(e.at),
            })) ?? null,
        })),
        pairs: s.pairs,
        unpaired: s.unpaired,
      })),
    },
    null,
    2
  );
}
