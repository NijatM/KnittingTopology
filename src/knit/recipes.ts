// Bounded guide-swap constructions after Popescu (2019), §5.5, pp. 90–91, Figs. 5.26–5.27.
// The finite band schedules and symbolic checks below are project constructions, not native symbols,
// physical seam/knittability checks, or a simulation of yarn geometry.
import type { GenerationContext, KnitRecipe, KnitZone, SurfaceSpec } from '../core/types';
import type { KnitProgram } from './program';
import type { Bed } from './keys';
import { imageIndex } from './grid';
import { markZones } from './zones';
import { rotatedShapeUV } from './shape-geometry';
import { validateShapeOperations } from './shape-validate';
import { runChecks } from './checks';
import {
  executeSequence,
  fillCluster,
  lowerSequence,
  passDir,
  programSequence,
  type KnitSequence,
  type SeqSymbol,
} from './sequence';

export const MAX_RECIPES = 32;
/** Normalized chart tolerance for rectangle comparisons and physical panel-boundary access. */
export const RECIPE_UV_TOLERANCE = 1e-10;
export type RecipeSide = 'left' | 'right' | 'first-pass' | 'last-pass';
export interface RecipePatch {
  zone: string;
  kind: 'channel' | 'pocket';
  /** Inclusive, zero-based [left needle, first pass, right needle, last pass]. */
  bounds: [number, number, number, number];
  /** Image indices; clear body includes its access edge cells. */
  body: number[];
  joins: number[];
  access: { side: RecipeSide; cells: number[] }[];
  cells: number[];
  checks: {
    parents: boolean;
    separateBody: boolean;
    joinedSides: boolean;
    openAccess: boolean;
    yarnLinks: number;
  };
  notes: string[];
}
export interface RecipeResult {
  applied: boolean;
  blockers: string[];
  /** Image order: 0 outside, 1 clear body, 2 join, 3 access (access is part of the clear body). */
  roles: Uint8Array;
  /** Image order, -1 outside; otherwise assignment index. */
  owner: Int16Array;
  patches: RecipePatch[];
  lowering: { ok: boolean; problems: string[] };
}

/** Schema validation only. Missing zones are an application failure, not a load-time data loss. */
export function validateRecipes(value: unknown): KnitRecipe[] {
  if (!Array.isArray(value) || value.length > MAX_RECIPES)
    throw new Error(`feature recipes must be a list of at most ${MAX_RECIPES}.`);
  const zones = new Set<string>();
  return value.map((raw, i) => {
    const at = `feature recipe ${i + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error(`${at} must be an object.`);
    const r = raw as Record<string, unknown>;
    if (typeof r.zone !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(r.zone) || zones.has(r.zone))
      throw new Error(`${at} must name a unique feature zone.`);
    zones.add(r.zone);
    if (
      typeof r.joinBand !== 'number' ||
      !Number.isInteger(r.joinBand) ||
      r.joinBand < 1 ||
      r.joinBand > 16
    )
      throw new Error(`${at} join band must be 1 to 16 grid positions.`);
    const common = { zone: r.zone, joinBand: r.joinBand };
    if (r.kind === 'channel' && (r.axis === 'needles' || r.axis === 'passes'))
      return { ...common, kind: 'channel', axis: r.axis };
    if (r.kind === 'pocket' && SIDES.includes(r.opening as RecipeSide))
      return { ...common, kind: 'pocket', opening: r.opening as RecipeSide };
    throw new Error(`${at} needs a channel axis or a pocket opening side.`);
  });
}

const SIDES: RecipeSide[] = ['left', 'right', 'first-pass', 'last-pass'];
const checkCancelled = (context?: GenerationContext) => {
  if (context?.cancelled?.()) {
    const error = new Error('Feature recipes cancelled.');
    error.name = 'AbortError';
    throw error;
  }
};
const emptyChecks = (): RecipePatch['checks'] => ({
  parents: false,
  separateBody: false,
  joinedSides: false,
  openAccess: false,
  yarnLinks: 0,
});
const freshResult = (w: number, h: number): RecipeResult => ({
  applied: false,
  blockers: [],
  roles: new Uint8Array(w * h),
  owner: new Int16Array(w * h).fill(-1),
  patches: [],
  lowering: { ok: true, problems: [] },
});
const sidesFor = (r: KnitRecipe): RecipeSide[] =>
  r.kind === 'pocket'
    ? SIDES.filter((s) => s !== r.opening)
    : r.axis === 'needles'
      ? ['first-pass', 'last-pass']
      : ['left', 'right'];

/** Exactly two distinct guides knitting once each on distinct beds, with no yarn-free action. */
function twoKnits(symbol: SeqSymbol | undefined): [Bed, Bed] | null {
  if (!symbol || symbol.steps.length !== 2) return null;
  const a = symbol.steps.find((s) => s.kind === 'knit' && s.guide === 1),
    b = symbol.steps.find((s) => s.kind === 'knit' && s.guide === 2);
  return a && b && a.bed !== b.bed ? [a.bed, b.bed] : null;
}

function constantShape(base: KnitProgram): boolean {
  const shape = base.shape;
  if (!shape) return true;
  const n = shape.needles;
  if (n.moves.length || n.unresolved.length || n.placements.length !== base.w * base.h)
    return false;
  for (let k = 0; k < base.h; k++)
    for (let j = 0; j < base.w; j++) {
      const p = n.placements[shape.placementAt[imageIndex(base.w, base.h, j, k)]!];
      if (!p || p.course !== k || p.needle !== j) return false;
      if (!k) {
        if (p.parents.length) return false;
      } else {
        const previous = n.placements[shape.placementAt[imageIndex(base.w, base.h, j, k - 1)]!]!;
        if (p.parents.length !== 1 || p.parents[0] !== previous.loop.id) return false;
      }
    }
  return true;
}

function rectangle(zone: KnitZone, base: KnitProgram): [number, number, number, number] {
  if (zone.shape.kind !== 'region' || zone.shape.points.length !== 4)
    throw new Error('the zone must be a four-corner axis-aligned region.');
  const points = zone.shape.points.map((p) => rotatedShapeUV(p, base.settings.startEdge ?? 'v0'));
  if (points.some((p) => p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)))
    throw new Error('the zone must lie inside the plane chart.');
  const x0 = Math.min(...points.map((p) => p[0])),
    x1 = Math.max(...points.map((p) => p[0])),
    y0 = Math.min(...points.map((p) => p[1])),
    y1 = Math.max(...points.map((p) => p[1]));
  const near = (a: number, b: number) => Math.abs(a - b) <= RECIPE_UV_TOLERANCE;
  if (x1 - x0 <= RECIPE_UV_TOLERANCE || y1 - y0 <= RECIPE_UV_TOLERANCE)
    throw new Error('the rectangle must have positive width and height.');
  const corners = new Set<string>();
  for (let i = 0; i < 4; i++) {
    const p = points[i]!,
      q = points[(i + 1) % 4]!;
    if ((!near(p[0], x0) && !near(p[0], x1)) || (!near(p[1], y0) && !near(p[1], y1)))
      throw new Error('the zone must have four axis-aligned rectangle corners.');
    corners.add(`${near(p[0], x0) ? 0 : 1}:${near(p[1], y0) ? 0 : 1}`);
    if (near(p[0], q[0]) === near(p[1], q[1]))
      throw new Error('rectangle corners must be distinct and in simple polygon order.');
  }
  if (corners.size !== 4) throw new Error('the rectangle must have four distinct corners.');
  return [x0, y0, x1, y1];
}

function makePatch(
  base: KnitProgram,
  surface: SurfaceSpec,
  zone: KnitZone,
  r: KnitRecipe
): RecipePatch {
  if (zone.kind !== r.kind) throw new Error('the zone kind must match its assigned recipe.');
  const uv = rectangle(zone, base),
    cells = markZones(base, surface, [zone]).cells[0]!;
  if (!cells.length) throw new Error('the zone contains no loop centres.');
  let left = base.w,
    right = -1,
    first = base.h,
    last = -1;
  for (const i of cells) {
    const j = i % base.w,
      k = base.h - 1 - Math.floor(i / base.w);
    left = Math.min(left, j);
    right = Math.max(right, j);
    first = Math.min(first, k);
    last = Math.max(last, k);
  }
  if (cells.length !== (right - left + 1) * (last - first + 1))
    throw new Error('loop-centre membership must be a complete rectangle.');
  const openings: RecipeSide[] =
    r.kind === 'pocket'
      ? [r.opening]
      : r.axis === 'needles'
        ? ['left', 'right']
        : ['first-pass', 'last-pass'];
  for (const side of openings) {
    const atBoundary =
      side === 'left'
        ? uv[0] <= RECIPE_UV_TOLERANCE && left === 0
        : side === 'right'
          ? 1 - uv[2] <= RECIPE_UV_TOLERANCE && right === base.w - 1
          : side === 'first-pass'
            ? uv[1] <= RECIPE_UV_TOLERANCE && first === 0
            : 1 - uv[3] <= RECIPE_UV_TOLERANCE && last === base.h - 1;
    if (!atBoundary)
      throw new Error(
        `the ${side} access must reach the actual panel boundary (chart tolerance ${RECIPE_UV_TOLERANCE}).`
      );
  }
  const joined = sidesFor(r),
    b = r.joinBand,
    l = left + (joined.includes('left') ? b : 0),
    rr = right - (joined.includes('right') ? b : 0),
    f = first + (joined.includes('first-pass') ? b : 0),
    ll = last - (joined.includes('last-pass') ? b : 0);
  if (rr - l + 1 < 2 || ll - f + 1 < 2)
    throw new Error('join bands must leave a clear body of at least two needles by two passes.');
  const body: number[] = [],
    joins: number[] = [];
  const access = openings.map((side) => ({ side, cells: [] as number[] }));
  for (const i of cells) {
    const j = i % base.w,
      k = base.h - 1 - Math.floor(i / base.w);
    if (j < l || j > rr || k < f || k > ll) joins.push(i);
    else {
      body.push(i);
      for (const a of access)
        if (
          a.side === 'left'
            ? j === left
            : a.side === 'right'
              ? j === right
              : a.side === 'first-pass'
                ? k === first
                : k === last
        )
          a.cells.push(i);
    }
  }
  return {
    zone: zone.id,
    kind: r.kind,
    bounds: [left, first, right, last],
    body,
    joins,
    access,
    cells,
    checks: emptyChecks(),
    notes: [
      'guide-swap-bands-v1: body guide 1 front / guide 2 back; vertical bands swapped; horizontal bands alternate guide beds by needle. Vertical bands take precedence at corners.',
      `Join band: ${b} grid position${b === 1 ? '' : 's'}; clear body ${rr - l + 1} needles × ${ll - f + 1} passes.`,
      'Finite schedule and symbolic checks are project constructions after Popescu (2019), §5.5, pp. 90–91, Figs. 5.26–5.27. No physical seam, channel capacity, finishing or knittability is certified.',
    ],
  };
}

/** Independently inspect the expanded sequence, not key colours or recorded recipe claims.
 * Two live bed rows plus per-guide endpoints suffice: every accepted action is a knit, without transfers.
 * Cross-bed yarn links connect successive stitches of the same guide, including pass turns.
 */
export function validateRecipeSequence(
  seq: KnitSequence,
  patches: readonly RecipePatch[],
  context?: GenerationContext
): {
  checks: RecipePatch['checks'][];
  blockers: string[];
} {
  const { w, h } = seq,
    checks = patches.map(() => ({
      parents: true,
      separateBody: true,
      joinedSides: true,
      openAccess: true,
      yarnLinks: 0,
    })),
    owners = new Int16Array(w * h).fill(-1),
    body = new Uint8Array(w * h),
    access = new Int16Array(w * h).fill(-1),
    crossRight = new Uint8Array(w * h),
    live = new Int32Array(2 * w).fill(-1);
  patches.forEach((p, z) => {
    for (const i of p.cells) owners[i] = z;
    for (const i of p.body) body[i] = 1;
    p.access.forEach((a, n) => {
      for (const i of a.cells) access[i] = n;
    });
  });
  const previous: ({ i: number; bed: Bed } | undefined)[] = [];
  let made = 0;
  for (let k = 0; k < h; k++) {
    checkCancelled(context);
    const dir = passDir(seq.firstDir, k);
    for (let n = 0; n < w; n++) {
      const j = dir === 1 ? n : w - 1 - n,
        i = imageIndex(w, h, j, k),
        z = owners[i]!,
        pair = twoKnits(seq.symbols[seq.rows[k * w + j]!]);
      if (!pair) {
        if (z >= 0) {
          checks[z]!.parents = false;
          if (body[i]) checks[z]!.separateBody = false;
          if (access[i]! >= 0) checks[z]!.openAccess = false;
        }
        // An invalid operation may change held loops; do not infer valid parent continuity after it.
        live[j] = live[w + j] = -1;
        previous[0] = previous[1] = undefined;
        continue;
      }
      if (z >= 0 && body[i] && pair[0] !== 'front') checks[z]!.separateBody = false;
      if (z >= 0 && access[i]! >= 0 && pair[0] !== 'front') checks[z]!.openAccess = false;
      for (let g = 0; g < 2; g++) {
        const bed = pair[g]!,
          slot = (bed === 'front' ? 0 : w) + j;
        if (z >= 0 && k > 0 && live[slot]! < 0) checks[z]!.parents = false;
        live[slot] = made++;
        const prev = previous[g];
        if (prev && prev.bed !== bed) {
          const pz = owners[prev.i]!;
          if (z >= 0) checks[z]!.yarnLinks++;
          if (pz >= 0 && pz !== z) checks[pz]!.yarnLinks++;
          if (Math.floor(i / w) === Math.floor(prev.i / w) && Math.abs(i - prev.i) === 1)
            crossRight[Math.min(i, prev.i)] = 1;
          if (z >= 0 && pz === z && body[i] && body[prev.i]) checks[z]!.separateBody = false;
          if (z >= 0 && pz === z && access[i]! >= 0 && access[i] === access[prev.i])
            checks[z]!.openAccess = false;
        }
        previous[g] = { i, bed };
      }
    }
  }
  const linked = (a: number, b: number) => crossRight[Math.min(a, b)] === 1;
  patches.forEach((p, z) => {
    const c = checks[z]!,
      [left, first, right, last] = p.bounds,
      openings = p.access.map((a) => a.side);
    // A body can be large; avoid argument spreading into Math.min/max.
    let l = w,
      r = -1,
      f = h,
      t = -1;
    for (const i of p.body) {
      const j = i % w,
        k = h - 1 - Math.floor(i / w);
      l = Math.min(l, j);
      r = Math.max(r, j);
      f = Math.min(f, k);
      t = Math.max(t, k);
    }
    if (r - l < 1 || t - f < 1) c.separateBody = false;
    for (const side of SIDES.filter((s) => !openings.includes(s))) {
      if (side === 'left' || side === 'right') {
        const a = side === 'left' ? l - 1 : r,
          b = a + 1;
        for (let k = f; k <= t; k++)
          if (!linked(imageIndex(w, h, a, k), imageIndex(w, h, b, k))) c.joinedSides = false;
      } else {
        const begin = side === 'first-pass' ? first : t + 1,
          end = side === 'first-pass' ? f - 1 : last;
        // Each horizontal band course links layers throughout the clear needle span.
        for (let k = begin; k <= end; k++)
          for (let j = l; j < r; j++)
            if (!linked(imageIndex(w, h, j, k), imageIndex(w, h, j + 1, k))) c.joinedSides = false;
      }
    }
    for (const a of p.access) {
      if (!a.cells.length) c.openAccess = false;
      for (const i of a.cells) {
        const j = i % w,
          k = h - 1 - Math.floor(i / w);
        if (
          (a.side === 'left'
            ? j !== 0
            : a.side === 'right'
              ? j !== w - 1
              : a.side === 'first-pass'
                ? k !== 0
                : k !== h - 1) ||
          !body[i] ||
          owners[i] !== z
        )
          c.openAccess = false;
      }
    }
    if (left > l || right < r || first > f || last < t) c.parents = false;
  });
  const blockers: string[] = [];
  patches.forEach((p, z) => {
    const c = checks[z]!;
    if (!c.parents)
      blockers.push(
        `Recipe ${p.zone}: actual sequence does not preserve one live parent chain per needle and bed.`
      );
    if (!c.separateBody)
      blockers.push(
        `Recipe ${p.zone}: actual sequence does not keep the declared clear body as two separate guide layers.`
      );
    if (!c.joinedSides)
      blockers.push(
        `Recipe ${p.zone}: actual cross-bed yarn links do not cover every declared join band/interface.`
      );
    if (!c.openAccess)
      blockers.push(
        `Recipe ${p.zone}: declared access is not an open two-layer edge at the panel boundary.`
      );
  });
  return { checks, blockers };
}

/** Apply all assignments atomically; unresolved assignments retain the baseline for inspection and block exports. */
export function applyRecipes(
  base: KnitProgram,
  surface: SurfaceSpec,
  context?: GenerationContext
): KnitProgram {
  if (!base.settings.recipes?.length) return base;
  const result = freshResult(base.w, base.h),
    seq = base.operations ?? programSequence(base);
  const fail = (text: string) => result.blockers.push(text);
  let assignments: KnitRecipe[] = [];
  try {
    assignments = validateRecipes(base.settings.recipes);
  } catch (error) {
    fail((error as Error).message);
  }
  if (surface.kind !== 'plane' || base.settings.patches || base.patches || !constantShape(base))
    fail('Feature recipes require an unpatched, unshaped, constant-width plane program.');
  if (
    seq.w !== base.w ||
    seq.h !== base.h ||
    seq.rows.length !== base.w * base.h ||
    base.cells.length !== base.w * base.h ||
    seq.firstDir !== base.firstDir
  )
    fail(
      'Feature recipes require canonical operations matching the base grid dimensions and first-pass direction.'
    );
  if (
    base.key.mode !== 2 ||
    seq.guides !== 2 ||
    seq.rows.some((i) => !twoKnits(seq.symbols[i])) ||
    base.cells.some((i) => {
      const op = base.key.ops[i];
      return (
        !op ||
        op.move !== 'none' ||
        op.steps.length !== 2 ||
        op.steps.some((s) => s.action !== 'knit') ||
        op.steps[0]!.bed === op.steps[1]!.bed
      );
    })
  )
    fail(
      'Feature recipes require two separate guides knitting once on different beds at every base position, without tuck, float or transfer.'
    );
  if (!result.blockers.length) {
    const source = lowerSequence(seq, base.key);
    if (!source.ok || source.cells.some((v, i) => v !== base.cells[i]))
      fail(
        'Feature recipes require canonical operations that lower to the exact base-program cells.'
      );
  }
  if (!result.blockers.length) {
    const zones = base.settings.zones ?? [];
    for (const r of assignments) {
      checkCancelled(context);
      const zone = zones.find((z) => z.id === r.zone);
      if (!zone) {
        fail(`Recipe ${r.zone}: the assigned feature zone is missing.`);
        continue;
      }
      try {
        const patch = makePatch(base, surface, zone, r);
        result.patches.push(patch);
        const z = result.patches.length - 1;
        let overlap = false;
        for (const i of patch.cells) {
          if (result.owner[i]! >= 0) overlap = true;
          result.owner[i] = z;
        }
        if (overlap) fail(`Recipe ${r.zone}: applied recipe footprints cannot overlap.`);
      } catch (error) {
        fail(`Recipe ${r.zone}: ${(error as Error).message}`);
      }
    }
  }
  if (result.blockers.length) {
    result.owner.fill(-1);
    result.patches = [];
    result.blockers = [...new Set(result.blockers)];
    return {
      ...base,
      recipeResult: result,
      exportBlockers: [...base.exportBlockers, ...result.blockers],
    };
  }
  let operations = seq;
  const occupied = new Set([...seq.symbols.map((s) => s.id), ...seq.clusters.map((c) => c.id)]);
  const unique = (s: string) => {
    let n = s;
    while (occupied.has(n)) n += '_';
    occupied.add(n);
    return n;
  };
  for (let z = 0; z < result.patches.length; z++) {
    checkCancelled(context);
    const p = result.patches[z]!,
      r = assignments[z]!,
      [left, first, right] = p.bounds,
      joined = sidesFor(r),
      band = r.joinBand,
      a = {
        id: unique(`recipe-${p.zone}-A`),
        steps: [
          { kind: 'knit', guide: 1, bed: 'front' },
          { kind: 'knit', guide: 2, bed: 'back' },
        ],
      } as SeqSymbol,
      b = {
        id: unique(`recipe-${p.zone}-B`),
        steps: [
          { kind: 'knit', guide: 1, bed: 'back' },
          { kind: 'knit', guide: 2, bed: 'front' },
        ],
      } as SeqSymbol,
      groups: [number, number][][] = [[], []],
      body = new Set(p.body);
    for (const i of p.cells) {
      const j = i % base.w,
        k = base.h - 1 - Math.floor(i / base.w),
        vertical =
          (joined.includes('left') && j < left + band) ||
          (joined.includes('right') && j > right - band),
        swapped = !body.has(i) && (vertical || (j - left) % 2 === 1);
      groups[swapped ? 1 : 0]!.push([j, k]);
      result.roles[i] = body.has(i) ? 1 : 2;
    }
    for (const access of p.access) for (const i of access.cells) result.roles[i] = 3;
    for (const n of [0, 1])
      if (groups[n]!.length)
        operations = fillCluster(
          operations,
          {
            id: unique(`recipe-${p.zone}-${n ? 'join' : 'body'}-cluster`),
            w: 1,
            h: 1,
            symbols: [n ? b : a],
          },
          groups[n]!,
          [left, first]
        );
  }
  const checked = validateRecipeSequence(operations, result.patches, context);
  result.patches.forEach((p, z) => {
    p.checks = checked.checks[z]!;
  });
  const lowering = lowerSequence(operations, base.key),
    cells = lowering.ok ? lowering.cells : base.cells,
    sequence = executeSequence(operations);
  result.lowering = { ok: lowering.ok, problems: lowering.ok ? [] : lowering.problems };
  result.applied = true;
  result.blockers = [
    ...checked.blockers,
    ...sequence.blockers,
    ...result.lowering.problems,
    ...(lowering.ok && base.shape ? validateShapeOperations(base.shape, cells, base.key) : []),
  ];
  return {
    ...base,
    cells,
    operations,
    sequence,
    recipeResult: result,
    findings: runChecks({ w: base.w, h: base.h, cells, key: base.key }, base.settings.limits),
    exportBlockers: [...new Set([...base.exportBlockers, ...result.blockers])],
  };
}

/** JSON-safe derived provenance. Cells and rectangle bounds become one-based needle/pass coordinates. */
export function recipeJsonData(result: RecipeResult, w: number, h: number) {
  const coords = (list: readonly number[]) => list.map((i) => [(i % w) + 1, h - Math.floor(i / w)]);
  return {
    format: 'knit-feature-recipes',
    version: 1,
    method: 'guide-swap-bands-v1',
    note: 'Project constructions after Popescu (2019), §5.5, pp. 90–91. Symbolic layer/yarn-path checks, not physical validation or machine instructions.',
    chartTolerance: RECIPE_UV_TOLERANCE,
    needles: w,
    passCount: h,
    applied: result.applied,
    blockers: result.blockers,
    lowering: result.lowering,
    patches: result.patches.map((p) => ({
      ...p,
      bounds: p.bounds.map((v) => v + 1),
      body: coords(p.body),
      joins: coords(p.joins),
      cells: coords(p.cells),
      access: p.access.map((a) => ({ side: a.side, cells: coords(a.cells) })),
    })),
  };
}
export function recipeLines(result: RecipeResult): string[] {
  return [
    'Feature recipes (guide-swap-bands-v1; project constructions after Popescu 2019, §5.5, pp. 90–91):',
    result.applied
      ? `  ${result.patches.length} recipe${result.patches.length === 1 ? '' : 's'} expanded; ${result.lowering.ok ? 'colour-key conversion succeeded' : 'colour-key conversion refused; actual sequence retained'}.`
      : '  Assignments unresolved; baseline retained for inspection.',
    ...result.patches.flatMap((p) => [
      `  ${p.zone}: ${p.kind}; ${p.body.length} clear-body cells, ${p.joins.length} join cells; access ${p.access.map((a) => a.side).join(', ')}.`,
      `    Symbolic checks: parents ${p.checks.parents}, separate body ${p.checks.separateBody}, joined sides ${p.checks.joinedSides}, open access ${p.checks.openAccess}; ${p.checks.yarnLinks} cross-bed yarn links.`,
      ...p.notes.map((n) => `    ${n}`),
    ]),
    ...result.blockers.map((b) => `  BLOCKS EXPORT: ${b}`),
    '  Checks do not establish a physical seam, usable dimensions, knittability or achieved shape. Cast-on, finishing and native scheduling remain lab work.',
  ];
}
