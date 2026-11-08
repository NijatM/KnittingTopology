// Computational patches (Popescu 2019, §6.3.2, pp. 109–110). The thesis splits the geometry into patches
// by hand before pattern generation; each patch has its own knitting direction and loop dimensions. It
// develops no subdivision strategy. Project restriction: full-length split lines at constant chart u or v
// give a grid of rectangular patches. Each shared edge is knitted through or a seam: patches linked by
// knitted-through edges form one piece with one bitmap (joined in patch-join.ts, a project construction),
// and the seam map pairs the loops or course ends on both sides of every seam by position.
import type {
  GenerationContext,
  KnitGraphStages,
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
import { buildShapeProgram, openLayout, shapeInputs } from './shape-program';
import { rotatedShapeUV } from './shape-geometry';
import type { ChartWindow } from './shape-types';
import {
  checkKnitGraph,
  courseStageFingerprint,
  courseStageFromGeometry,
  freshStages,
} from './knit-graph';
import { joinPatches, loopPatch, type JoinPart } from './patch-join';

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
const edgeId = (axis: SplitAxis, split: number, cell: number) => `${axis}${split + 1}:${cell + 1}`;
/** Axis, split and cell (row of a u edge, column of a v edge), zero based, of a shared-edge ID. */
export function parseEdgeId(id: string): { axis: SplitAxis; split: number; cell: number } | null {
  const m = /^([uv])(\d+):(\d+)$/.exec(id);
  return m ? { axis: m[1] as SplitAxis, split: Number(m[2]) - 1, cell: Number(m[3]) - 1 } : null;
}
/** Knitted-through edges after adding or removing split `k` of `axis`. A new line's edges start knitted
 * through; an edge divided by a new line keeps its state in both parts; a merged edge keeps the state of
 * its part below or left. */
function throughAfter(
  layout: KnitPatchLayout,
  next: Pick<KnitPatchLayout, 'u' | 'v'>,
  axis: SplitAxis,
  change: { add: number } | { remove: number }
): string[] {
  const out = new Set<string>();
  for (const id of layout.through ?? []) {
    const e = parseEdgeId(id);
    if (!e) continue;
    if ('add' in change) {
      if (e.axis === axis)
        out.add(edgeId(axis, e.split >= change.add ? e.split + 1 : e.split, e.cell));
      else {
        if (e.cell <= change.add) out.add(edgeId(e.axis, e.split, e.cell));
        if (e.cell >= change.add) out.add(edgeId(e.axis, e.split, e.cell + 1));
      }
    } else if (e.axis === axis) {
      if (e.split !== change.remove)
        out.add(edgeId(axis, e.split > change.remove ? e.split - 1 : e.split, e.cell));
    } else if (e.cell <= change.remove) out.add(edgeId(e.axis, e.split, e.cell));
    else if (e.cell > change.remove + 1) out.add(edgeId(e.axis, e.split, e.cell - 1));
  }
  if ('add' in change)
    for (let c = 0; c <= (axis === 'u' ? next.v.length : next.u.length); c++)
      out.add(edgeId(axis, change.add, c));
  const order = sharedEdges(next).map((e) => e.id);
  return order.filter((id) => out.has(id));
}
/** Whether a shared edge is knitted through (otherwise it is a seam). */
export const knittedThrough = (layout: Pick<KnitPatchLayout, 'through'>, id: string) =>
  !!layout.through?.includes(id);
/** Toggle a shared edge between knitted through and seam. */
export function toggleEdge(settings: KnitSettings, id: string): KnitSettings {
  const layout = settings.patches;
  if (!layout || !sharedEdges(layout).some((e) => e.id === id))
    throw new Error('There is no such shared edge.');
  const on = new Set(layout.through ?? []);
  if (on.has(id)) on.delete(id);
  else on.add(id);
  return {
    ...settings,
    patches: {
      ...layout,
      through: sharedEdges(layout)
        .map((e) => e.id)
        .filter((x) => on.has(x)),
    },
  };
}
/** Pieces: patches linked by knitted-through edges, each named after its lowest-numbered patch. */
export function patchPieces(layout: Pick<KnitPatchLayout, 'u' | 'v' | 'through'>): number[][] {
  const parent = Array.from({ length: patchCount(layout) }, (_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i]!)));
  for (const e of sharedEdges(layout))
    if (knittedThrough(layout, e.id)) {
      const a = root(e.a),
        b = root(e.b);
      parent[Math.max(a, b)] = Math.min(a, b);
    }
  const groups = new Map<number, number[]>();
  parent.forEach((_, i) => {
    const r = root(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()].sort((a, b) => a[0]! - b[0]!);
}
/** "piece P1 (P1, P2, P4)", or "P3" for a single patch. */
export const pieceLabel = (patches: readonly number[]) =>
  patches.length === 1
    ? patchLabel(patches[0]!)
    : `piece ${patchLabel(patches[0]!)} (${patches.map(patchLabel).join(', ')})`;
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
  const next = regrid(layout, axis === 'u' ? splits : layout.u, axis === 'v' ? splits : layout.v);
  return {
    ...rest,
    patches: { ...next, through: throughAfter(layout, next, axis, { add: splits.indexOf(value) }) },
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
  if (u.length || v.length)
    return {
      ...settings,
      patches: { ...next, through: throughAfter(layout, next, axis, { remove: index }) },
    };
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
  /** The lowest-numbered patch, which names the piece. */
  index: number;
  label: string;
  /** The piece's patches, ascending. */
  patches: number[];
  /** Bounding rectangle of the patches. */
  window: ChartWindow;
  build: KnitBuild;
  /** Each patch's own stages, in `patches` order; they are saved per patch. */
  stages: (KnitGraphStages | undefined)[];
}
export interface SeamElement {
  kind: 'loop' | 'course end';
  /** Loop ID in the patch's knit graph. */
  loop: string;
  /** 1-based needle and pass in the bitmap of the patch's piece. */
  needle: number;
  pass: number;
  /** Fraction along the edge, from its lower chart end. */
  at: number;
  position: Vec3;
}
export type PatchSide = 'start' | 'end' | 'needle-1' | 'far';
export interface SeamSide {
  patch: number;
  /** The piece's lowest patch. */
  piece: number;
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
  /** The layout the pieces were built from, without saved stages. */
  layout: KnitPatchLayout;
  pieces: PatchPiece[];
  /** Seam edges only; knitted-through edges are inside a piece. */
  seams: PatchSeam[];
  /** Index in `pieces` of the piece shown in `program`. */
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
  patch: number,
  side: PatchSide,
  edge: { axis: SplitAxis; range: [number, number] }
): SeamElement[] | null {
  const shape = program?.shape;
  if (!shape) return null;
  // In a joined piece, loop IDs carry their patch; a single patch's do not.
  const mine = (id: string) => {
    const p = loopPatch(id);
    return p < 0 || p === patch;
  };
  const { w, h } = shape.needles,
    cell = new Map<number, [number, number]>();
  shape.placementAt.forEach((p, i) => {
    if (p >= 0 && !cell.has(p)) cell.set(p, [(i % w) + 1, h - Math.floor(i / w)]);
  });
  const index = new Map(shape.needles.placements.map((p, i) => [p.loop.id, i]));
  const courses = shape.geometry.courses.filter((c) => c.loops.some((l) => mine(l.id))),
    own = (c: (typeof courses)[number] | undefined) => (c?.loops ?? []).filter((l) => mine(l.id)),
    loops =
      side === 'start'
        ? own(courses[0])
        : side === 'end'
          ? own(courses.at(-1))
          : courses
              .filter((c) =>
                side === 'needle-1'
                  ? (c.leftBoundary || c.leftFree) && mine(c.loops[0]!.id)
                  : (c.rightBoundary || c.rightFree) && mine(c.loops.at(-1)!.id)
              )
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
/** The seams of the layout (shared edges that are not knitted through), with both sides' elements. */
export function patchSeams(
  surface: SurfaceSpec,
  layout: KnitPatchLayout,
  pieces: readonly PatchPiece[]
): PatchSeam[] {
  const pieceOf = (patch: number) => pieces.find((p) => p.patches.includes(patch));
  return sharedEdges(layout)
    .filter((edge) => !knittedThrough(layout, edge.id))
    .map((edge) => {
      const path = edgePath(edge).map((uv) => evaluateSurface(surface, 0, uv[0], uv[1]));
      let length = 0;
      for (let i = 1; i < path.length; i++) length += dist(path[i - 1]!, path[i]!);
      const sideOf = (patch: number, chartSide: 'u0' | 'u1' | 'v0' | 'v1'): SeamSide => {
        const piece = pieceOf(patch),
          side = patchSide(layout.patches[patch]!, patchWindow(layout, patch), chartSide);
        return {
          patch,
          piece: piece?.index ?? patch,
          side,
          elements: sideElements(piece?.build.ok ? piece.build.program : null, patch, side, edge),
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
/** Bounding rectangle of some patches. */
function boundsOf(
  layout: Pick<KnitPatchLayout, 'u' | 'v'>,
  patches: readonly number[]
): ChartWindow {
  const w = patches.map((i) => patchWindow(layout, i));
  return {
    u: [Math.min(...w.map((x) => x.u[0])), Math.max(...w.map((x) => x.u[1]))],
    v: [Math.min(...w.map((x) => x.v[0])), Math.max(...w.map((x) => x.v[1]))],
  };
}
/** Layout problems that block a piece's export: a seam between two of its patches. */
function pieceSeamBlockers(layout: KnitPatchLayout, patches: readonly number[]): string[] {
  return sharedEdges(layout)
    .filter((e) => !knittedThrough(layout, e.id) && patches.includes(e.a) && patches.includes(e.b))
    .map(
      (e) =>
        `Seam ${e.id} lies between ${patchLabel(e.a)} and ${patchLabel(e.b)} of the same piece: the bitmap cannot leave it open. Knit the edge through, or make more edges seams to separate the patches.`
    );
}
/** One piece of several patches, joined into one geometry (project construction, patch-join.ts). */
function buildJoinedPiece(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  patches: readonly number[],
  context?: GenerationContext
): { build: KnitBuild; stages: (KnitGraphStages | undefined)[] } {
  const layout = settings.patches!,
    none = patches.map(() => undefined),
    lowest = patches[0]!,
    start = layout.patches[lowest]!.startEdge;
  for (const e of sharedEdges(layout))
    if (
      knittedThrough(layout, e.id) &&
      patches.includes(e.a) &&
      layout.patches[e.a]!.startEdge !== layout.patches[e.b]!.startEdge
    )
      return {
        build: {
          ok: false,
          reason: `${patchLabel(e.a)} and ${patchLabel(e.b)} are knitted through at ${e.id} but start at different edges (${layout.patches[e.a]!.startEdge}, ${layout.patches[e.b]!.startEdge}). Make the edge a seam or match the start edges.`,
        },
        stages: none,
      };
  const parts: JoinPart[] = [],
    stages: KnitGraphStages[] = [],
    checks: ReturnType<typeof checkKnitGraph> = [];
  const popescuPatches = new Set<number>();
  let savedCourses = true;
  for (const index of patches) {
    const view = patchSettings(settings, index),
      window = patchWindow(layout, index),
      label = patchLabel(index),
      inputs = shapeInputs(view, swatches);
    if (!inputs.ok)
      return { build: { ok: false, reason: `${label}: ${inputs.reason}` }, stages: none };
    const saved = freshStages(
        { surface: project.surface, knit: view, swatches: [...swatches] },
        window
      ),
      expected = courseStageFingerprint(project.surface, view, inputs.gauge, window);
    try {
      const own = openLayout(
        project.surface,
        view,
        inputs.gauge,
        saved,
        expected,
        context,
        window,
        true
      );
      savedCourses &&= !!saved;
      if (inputs.method === 'popescu-2019-rules') popescuPatches.add(index);
      const patchStages = own.stages ?? {
        courseMethod: inputs.method,
        courses: courseStageFromGeometry(expected, own.geometry),
      };
      stages.push(patchStages);
      if (patchStages.loops)
        checks.push(
          ...checkKnitGraph(patchStages).map((c) => ({
            ...c,
            id: `${label}:${c.id}`,
            label: `${label}: ${c.label}`,
          }))
        );
      parts.push({
        index,
        stitchWidth: inputs.gauge.stitchWidth,
        geometry: own.geometry,
        ...(own.fixedParents ? { fixedParents: own.fixedParents } : {}),
      });
    } catch (cause) {
      if ((cause as Error).name === 'AbortError') throw cause;
      return {
        build: { ok: false, reason: `${label}: shape generation: ${(cause as Error).message}` },
        stages: none,
      };
    }
  }
  const knitted = (a: number, b: number) =>
    sharedEdges(layout).some(
      (e) => knittedThrough(layout, e.id) && ((e.a === a && e.b === b) || (e.a === b && e.b === a))
    );
  let join: ReturnType<typeof joinPatches>;
  try {
    join = joinPatches(layout, start, parts, knitted);
  } catch (cause) {
    return { build: { ok: false, reason: `Joining patches: ${(cause as Error).message}` }, stages };
  }
  const fills = [...new Set(patches.map((i) => layout.patches[i]!.fill))],
    popescu = popescuPatches.size > 0;
  const build = buildShapeProgram(
    project,
    patchSettings(settings, lowest),
    swatches,
    context,
    boundsOf(layout, patches),
    {
      geometry: join.geometry,
      ...(join.fixedParents ? { fixedParents: join.fixedParents } : {}),
      ...(popescu ? { locked: (id: string) => popescuPatches.has(loopPatch(id)) } : {}),
      pairTurns: !join.splitArms,
      fillOf: (id) => layout.patches[loopPatch(id)]?.fill ?? layout.patches[lowest]!.fill,
      savedCourses,
      checks,
      issues: [
        `Patches ${patches.map(patchLabel).join(', ')} are joined into one piece. The thesis combines patch patterns but gives no algorithm (§6.3.2, p. 107; p. 153, fn. 9), so the join is a project construction: side by side, the courses reaching the shared edge are paired in order along it, and an unpaired course turns at the edge; stacked, the needle planner links the upper patch's first course to the loops below.`,
        ...(popescu
          ? [
              'A Popescu-method patch keeps its loop connections inside the patch; turn pairing never removes its loops, so a short-row turn that needs it blocks export.',
            ]
          : []),
        ...(fills.length > 1
          ? [
              `Fills differ within the piece (${fills.join(', ')}), as the thesis allows (p. 110). Each loop keeps its patch's structure and measured size; the join between loop sizes is not validated physically, and machine tension per pass is a lab setting, not in the bitmap. Where patches of different loop widths are stacked, the change in loop count must fit one-needle transfers; a pass that does not fit blocks export.`,
            ]
          : []),
      ],
      blockers: [
        ...pieceSeamBlockers(layout, patches),
        ...(join.splitArms
          ? [
              'The piece has separate arms in one band (a U, an arch or a ring): the yarn jumps between them. Make an edge a seam to knit the arms as separate pieces.',
            ]
          : []),
      ],
    }
  );
  return { build, stages };
}
/** Build every piece: patches linked by knitted-through edges, one bitmap each. */
export function buildPatchPieces(
  project: Pick<ProjectState, 'surface' | 'graph'>,
  settings: KnitSettings,
  swatches: readonly SwatchEntry[],
  context?: GenerationContext
): PatchPiece[] {
  const layout = settings.patches!,
    groups = patchPieces(layout);
  return groups.map((patches, k) => {
    const index = patches[0]!,
      label = pieceLabel(patches),
      window = boundsOf(layout, patches),
      ctx: GenerationContext = {
        ...context,
        progress: (fraction, stage) =>
          context?.progress?.((k + fraction) / groups.length, `${label}: ${stage}`),
      };
    if (patches.length > 1) {
      const { build, stages } = buildJoinedPiece(project, settings, swatches, patches, ctx);
      return { index, label, patches, window, build, stages };
    }
    const build = buildShapeProgram(project, patchSettings(settings, index), swatches, ctx, window);
    return {
      index,
      label,
      patches,
      window,
      build,
      stages: [build.ok ? build.program.shape?.knitGraph?.stages : undefined],
    };
  });
}
/** The build of the piece that holds `patch`, carrying the patch overview. */
export function pieceBuild(patches: Omit<PatchBuild, 'piece'>, patch: number): KnitBuild {
  const index = patches.pieces.findIndex((p) => p.patches.includes(patch)),
    piece = patches.pieces[index];
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
    first = pieces.find((p) => p.build.ok) ?? pieces[0]!;
  const build = pieceBuild(
    { layout: withoutStages(settings).patches!, pieces, seams },
    first.index
  );
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
      version: 2,
      units: 'm',
      method:
        'Computational patches (Popescu 2019, §6.3.2): chart-grid split lines (project restriction); each shared edge is knitted through or a seam, and patches linked by knitted-through edges form one piece (project construction). Only seams are listed.',
      pairing: PATCH_PAIRING_RULE,
      note: 'Sewing guidance from a geometric prediction, not a sewing sequence. Count and length differences are reported, not blocking.',
      surface: {
        kind: surface.kind,
        size: surface.size,
        curvature: surface.curvature,
        revision: surface.revision,
        mapping: surface.mapping ?? null,
      },
      layout: { kind: layout.kind, u: layout.u, v: layout.v, through: layout.through ?? [] },
      pieces: patchPieces(layout).map((patches) => ({
        piece: patchLabel(patches[0]!),
        patches: patches.map(patchLabel),
      })),
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
          piece: patchLabel(side.piece),
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
