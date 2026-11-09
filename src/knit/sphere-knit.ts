// Sphere opened along a descending pole-to-pole cut, knitted with courses from pole to pole.
// Project construction (M4c), not taken from a cited method. Each needle knits one circle of
// latitude, starting at the cut, with its measured loop count. Shorter circles skip out-and-back
// short-row pairs spread evenly around the circle. A run changes only at the end where its pass
// finishes, so the yarn never floats across needles.
import type { PatternGraph, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import { projectToSurface } from '../core/surfaces';
import { sphereDomain, sphereDomainPoint, sphereDomainUV } from '../core/sphere-domain';
import { orientedEdgePath, type CutPlan } from './cut-types';
import type {
  ShapeCourse,
  ShapeGeometry,
  ShapeNeedles,
  ShapePlacement,
  ShapePoint,
} from './shape-types';
import type { Metric, NetworkChart } from './rasterize-surface';
import { MAX_SIDE } from './grid';

const TAU = 2 * Math.PI;
const countCeil = (x: number) => Math.ceil(x - 1e-10 * Math.max(1, x));
/** Angle to [-π, π]. */
const wrap = (a: number) => a - TAU * Math.round(a / TAU);
const latOf = (p: Vec3) => Math.asin(Math.max(-1, Math.min(1, p[2] / Math.hypot(...p))));
const lonOf = (p: Vec3) => Math.atan2(p[1], p[0]);
/** Chart latitude fraction: 0 at the bottom pole, 1 at the top pole. */
const vOf = (lat: number) => (lat + Math.PI / 2) / Math.PI;
/** Chart points per sample interval of a non-cut network edge. */
const ARC_STEPS = 4;

export type SphereStart = 'v0' | 'v1';
export interface SphereCut {
  /** Cut edges from the top endpoint down, with each edge's latitude range (radians). */
  edges: { id: string; top: number; bottom: number }[];
  /** Cut samples from top to bottom: strictly decreasing latitude, continuously unwrapped longitude. */
  samples: { lat: number; lon: number }[];
}

/** Validates a sphere cut: one path of network edges from a highest node to a lowest node,
 * strictly descending at every edge sample. Refusals explain what is not supported. */
export function sphereCutPath(
  surface: SurfaceSpec,
  graph: PatternGraph,
  edgeIds: readonly string[]
): SphereCut {
  if (surface.kind !== 'sphere') throw new Error('Sphere knitting needs a sphere.');
  if (!edgeIds.length) throw new Error('The cut is empty.');
  const edges = new Map(graph.edges.map((e) => [e.id, e])),
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    at = new Map<string, string[]>();
  for (const id of edgeIds) {
    const e = edges.get(id);
    if (!e) throw new Error(`Cut edge ${id} is not in the network.`);
    for (const n of [e.a, e.b]) at.set(n, [...(at.get(n) ?? []), id]);
  }
  const branch = [...at].find(([, es]) => es.length > 2);
  if (branch)
    throw new Error(
      `The cut branches at node ${branch[0]}. A sphere can only be knitted from one unbranched cut from pole to pole.`
    );
  const domain = sphereDomain(surface);
  if (domain.partial)
    throw new Error('A sphere sector uses its natural meridian boundaries without a manual cut.');
  let top = domain.opened ? domain.zMax : -Infinity,
    bottom = domain.opened ? -domain.zMax : Infinity;
  for (const n of domain.opened ? [] : graph.nodes) {
    top = Math.max(top, n.position[2]);
    bottom = Math.min(bottom, n.position[2]);
  }
  const tie = 1e-9 * surface.size,
    ends = [...at].filter(([, es]) => es.length === 1).map(([n]) => n),
    start = ends.find((n) => nodes.get(n)![2] >= top - tie),
    finish = ends.find((n) => n !== start && nodes.get(n)![2] <= bottom + tie);
  if (ends.length !== 2 || !start || !finish)
    throw new Error(
      domain.opened
        ? 'An opened sphere cut must connect the actual top rim to the actual bottom rim. Use the meridian preset or edit the cut.'
        : 'A sphere cut must be one path from a highest network node to a lowest one. Use the meridian preset or edit the cut.'
    );
  const step = 1e-12 * surface.size,
    used = new Set<string>(),
    points: Vec3[] = [],
    ordered: SphereCut['edges'] = [];
  let node = start;
  while (node !== finish) {
    const id = at.get(node)!.find((x) => !used.has(x));
    if (!id) break;
    used.add(id);
    const e = edges.get(id)!,
      next = e.a === node ? e.b : e.a,
      p = orientedEdgePath(e, nodes.get(node)!, nodes.get(next)!);
    for (let i = 1; i < p.length; i++)
      if (!(p[i - 1]![2] - p[i]![2] > step))
        throw new Error(
          `The cut climbs or runs level along edge ${id}. Every point of a sphere cut must descend from the top to the bottom.`
        );
    ordered.push({ id, top: latOf(p[0]!), bottom: latOf(p.at(-1)!) });
    points.push(...(points.length ? p.slice(1) : p));
    node = next;
  }
  if (node !== finish || used.size !== edgeIds.length)
    throw new Error('A sphere cut must be one unbroken path from pole to pole.');
  // Only the two end samples can sit on a pole, where the longitude is taken from the neighbour.
  const pole = 1e-9 * surface.size,
    lon: number[] = [];
  let previous: number | undefined;
  for (const p of points) {
    if (Math.hypot(p[0], p[1]) <= pole) {
      lon.push(NaN);
      continue;
    }
    const raw = lonOf(p);
    previous = previous === undefined ? raw : previous + wrap(raw - previous);
    lon.push(previous);
  }
  if (Number.isNaN(lon[0])) lon[0] = lon[1]!;
  if (Number.isNaN(lon.at(-1))) lon[lon.length - 1] = lon.at(-2)!;
  if (lon.some((x) => !Number.isFinite(x))) throw new Error('The cut has no defined longitude.');
  return { edges: ordered, samples: points.map((p, i) => ({ lat: latOf(p), lon: lon[i]! })) };
}

/** Longitude of the cut at a latitude: linear between samples, constant from each end to its pole. */
export function cutLongitude(cut: SphereCut, lat: number): number {
  const s = cut.samples;
  if (lat >= s[0]!.lat) return s[0]!.lon;
  if (lat <= s.at(-1)!.lat) return s.at(-1)!.lon;
  let lo = 0,
    hi = s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m]!.lat >= lat) lo = m;
    else hi = m;
  }
  const a = s[lo]!,
    b = s[hi]!;
  return a.lon + ((a.lat - lat) / (a.lat - b.lat)) * (b.lon - a.lon);
}

/**
 * Pass runs for loop targets per needle (needle order is pole to pole). Each half of the bed
 * (needles up to the middle, and after it) splits the passes into groups that begin at a pass
 * ending on that half, so a group is one out-and-back short-row pair. The first and last groups
 * are knitted by every needle. Working outwards from the middle, each needle keeps the number of
 * its inner neighbour's groups that best matches its target, chosen by a min-max dynamic program
 * on the distance between a loop's pass fraction and its place around the circle. Nesting keeps
 * every run unbroken, and runs change only where a pass ends.
 */
export function sphereSchedule(
  targets: readonly number[],
  firstDir: 1 | -1
): { runs: [number, number][]; knits: Uint8Array[]; counts: number[] } {
  const N = targets.length,
    P = Math.max(...targets),
    mid = (N - 1) / 2,
    dir = (k: number) => firstDir * (k % 2 ? -1 : 1);
  const knits = Array.from({ length: P }, () => new Uint8Array(N)),
    counts = new Array<number>(N).fill(0);
  for (const side of [0, 1]) {
    const groups: number[][] = [];
    let current: number[] = [];
    for (let k = 0; k < P; k++) {
      if ((dir(k) === 1 ? 1 : 0) === side && current.length) {
        groups.push(current);
        current = [];
      }
      current.push(k);
    }
    groups.push(current);
    const last = groups.length - 1,
      forced = groups[0]!.length + (last > 0 ? groups[last]!.length : 0),
      f0 = groups[0]!.length,
      optional = groups.map((_, i) => i).slice(1, last);
    const order = Array.from({ length: N }, (_, j) => j)
      .filter((j) => (j <= mid ? 0 : 1) === side)
      .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    let previous = optional.map((_, i) => i);
    for (const j of order) {
      const g = Math.max(0, Math.min(previous.length, Math.round((targets[j]! - forced) / 2))),
        A = forced + 2 * g,
        L = previous.length;
      const cost = (m: number, i: number) => {
        let d = 0;
        groups[optional[previous[i]!]!]!.forEach(
          (p, t) => (d = Math.max(d, Math.abs(((p + 0.5) * A) / P - (f0 + 2 * m + t + 0.5))))
        );
        return d;
      };
      const pick: number[] = [];
      if (g > 0) {
        const dp: Float64Array[] = [],
          arg: Int32Array[] = [];
        for (let m = 0; m < g; m++) {
          const row = new Float64Array(L).fill(Infinity),
            from = new Int32Array(L).fill(-1);
          let best = Infinity,
            bestI = -1;
          for (let i = m; i <= L - (g - m); i++) {
            if (m > 0 && dp[m - 1]![i - 1]! < best) {
              best = dp[m - 1]![i - 1]!;
              bestI = i - 1;
            }
            const c = cost(m, i);
            row[i] = m === 0 ? c : Math.max(best, c);
            from[i] = bestI;
          }
          dp.push(row);
          arg.push(from);
        }
        let i = -1,
          best = Infinity;
        for (let x = 0; x < L; x++)
          if (dp[g - 1]![x]! < best) {
            best = dp[g - 1]![x]!;
            i = x;
          }
        for (let m = g - 1; m >= 0; m--) {
          pick.unshift(previous[i]!);
          i = arg[m]![i]!;
        }
      }
      previous = pick;
      const chosen = new Set(pick.map((i) => optional[i]!));
      groups.forEach((group, q) => {
        if (q === 0 || q === last || chosen.has(q))
          for (const k of group) {
            knits[k]![j] = 1;
            counts[j]!++;
          }
      });
    }
  }
  const runs = knits.map((row, k): [number, number] => {
    const l = row.indexOf(1),
      r = row.lastIndexOf(1);
    if (l < 0) throw new Error(`Pass ${k + 1} has no loops.`);
    for (let j = l; j <= r; j++) if (!row[j]) throw new Error(`Pass ${k + 1} is not one run.`);
    return [l, r];
  });
  return { runs, knits, counts };
}

export interface SphereSeamSide {
  kind: 'start' | 'end';
  /** Pass 1 or last-pass loops, in needle order. */
  loops: { id: string; needle: number; course: number }[];
  /** M4a seam side index per cut source edge on this side. */
  cutSides: Record<string, 0 | 1>;
}
export interface SphereSeam {
  sourceEdgeIds: string[];
  /** Zero-based inclusive needle range whose circles start at each cut edge, or null when none does. */
  edges: { id: string; needles: [number, number] | null }[];
  sides: [SphereSeamSide, SphereSeamSide];
  /** Natural meridian sides are independent boundaries, never a paired closing seam. */
  naturalBoundaries?: { paired: false; startEdgeIds: string[]; endEdgeIds: string[] };
}
export interface SphereKnitLayout {
  start: SphereStart;
  needles: number;
  passes: number;
  /** Loops per needle, and the circle of latitude over the measured course height. */
  counts: number[];
  exact: number[];
  maxCountError: number;
  /** Largest distance, in loops of one needle, between a loop's pass fraction and its even place around the circle. */
  maxCourseDeviation: number;
  /** Half meridian minus needle count times stitch width (m). */
  widthRounding: number;
  /** Passes that turn before the end of the bed. */
  turns: number;
  /** Most consecutive passes in which one needle holds its loop. */
  maxHeld: number;
  /** Largest distance of the cut from one meridian, along its circle of latitude (m). */
  cutWander: number;
  poles: { needle: number; pole: 'top' | 'bottom'; loops: number }[];
  seam: SphereSeam;
  /** Geometric targets and sampled ring diameters in meters, not calibrated fabric apertures. */
  domain?: {
    openingDiameter: number;
    fraction: number;
    longitudeSpan: number;
    retainedMeridianLength: number;
    /** Bottom and top outer knitting ring diameters; centers lie inside the retained band. */
    actualOuterRingDiameters: [number, number];
  };
}

/** Pole-to-pole needle/pass layout. Loop positions are latitude and the longitude from the cut. */
export function layoutSphere(
  surface: SurfaceSpec,
  cut: SphereCut,
  stitchWidth: number,
  courseHeight: number,
  firstDir: 1 | -1,
  start: SphereStart
): {
  geometry: ShapeGeometry;
  needles: ShapeNeedles;
  layout: Omit<SphereKnitLayout, 'seam'>;
} {
  if (![stitchWidth, courseHeight].every((x) => Number.isFinite(x) && x > 0))
    throw new Error('Measured stitch width and course height must be finite and positive.');
  const domain = sphereDomain(surface),
    R = surface.size / 2,
    meridian = domain.modified ? domain.meridianLength : Math.PI * R,
    N = Math.max(2, countCeil(meridian / stitchWidth));
  if (N > MAX_SIDE)
    throw new Error(`The sphere needs ${N} needles from pole to pole, above the 600 needle limit.`);
  const exact = Array.from({ length: N }, (_, j) =>
      domain.modified
        ? (domain.longitudeSpan *
            R *
            Math.sin(domain.thetaMin + ((j + 0.5) * domain.thetaSpan) / N)) /
          courseHeight
        : (TAU * R * Math.sin(((j + 0.5) * Math.PI) / N)) / courseHeight
    ),
    targets = exact.map((c) => Math.max(2, Math.round(c))),
    P = Math.max(...targets);
  if (P > MAX_SIDE)
    throw new Error(`The sphere needs ${P} passes around the equator, above the 600 pass limit.`);
  const { runs, knits, counts } = sphereSchedule(targets, firstDir);
  const v = (j: number) => (start === 'v0' ? (j + 0.5) / N : 1 - (j + 0.5) / N),
    u = (j: number, m: number) =>
      start === 'v0' ? 1 - (m + 0.5) / counts[j]! : (m + 0.5) / counts[j]!;
  const toSurface = sphereToSurface(surface, cut);
  const pointAt = (j: number, m: number): ShapePoint => {
    const net: Vec2 = [u(j, m), v(j)],
      position = toSurface(net),
      { attachment } = projectToSurface(surface, position);
    return {
      uv: attachment.uv,
      position,
      across: (j + 0.5) * stitchWidth,
      patch: attachment.patch,
      net,
    };
  };
  const made = new Array<number>(N).fill(0),
    lastLoop: (ShapePlacement | undefined)[] = new Array(N),
    placements: ShapePlacement[] = [],
    courses: ShapeCourse[] = [],
    steps: ShapeNeedles['steps'] = [],
    courseRounding: number[] = [];
  runs.forEach(([l, r], k) => {
    const loops: ShapeCourse['loops'] = [];
    for (let j = l; j <= r; j++) {
      const loop = { ...pointAt(j, made[j]!++), id: `shape:${k}:${j - l}` },
        parent = lastLoop[j];
      loops.push(loop);
      const placement: ShapePlacement = {
        loop,
        course: k,
        needle: j,
        role: 'loop',
        parents: parent ? [parent.loop.id] : [],
      };
      placements.push(placement);
      lastLoop[j] = placement;
    }
    const left = l === 0,
      right = r === N - 1;
    if (!left) steps.push({ pass: k + 1, needle: l, role: 'turn' });
    if (!right) steps.push({ pass: k + 1, needle: r, role: 'turn' });
    const length = domain.modified ? ((r - l + 1) * meridian) / N : ((r - l + 1) * Math.PI * R) / N;
    courseRounding.push(length - loops.length * stitchWidth);
    courses.push({
      id: `course:${k}`,
      index: k,
      points: loops.map(({ uv, position, across, patch, net }) => ({
        uv,
        position,
        across,
        patch,
        net,
      })),
      loops,
      extent: [l * stitchWidth, (r + 1) * stitchWidth],
      leftBoundary: left,
      rightBoundary: right,
      turnStart: !left,
      turnEnd: !right,
      length,
    });
  });
  let yarnJumps = 0,
    turns = 0,
    previousEnd: number | undefined;
  runs.forEach(([l, r], k) => {
    const dir = firstDir * (k % 2 ? -1 : 1),
      end = dir === 1 ? r : l;
    if (previousEnd !== undefined && Math.abs((dir === 1 ? l : r) - previousEnd) > 1) yarnJumps++;
    if (end !== (dir === 1 ? N - 1 : 0)) turns++;
    previousEnd = end;
  });
  let maxCourseDeviation = 0,
    maxHeld = 0;
  for (let j = 0; j < N; j++) {
    let m = 0,
      before = -1;
    for (let k = 0; k < P; k++) {
      if (!knits[k]![j]) continue;
      maxCourseDeviation = Math.max(
        maxCourseDeviation,
        Math.abs(((k + 0.5) / P) * counts[j]! - (m + 0.5))
      );
      if (before >= 0) maxHeld = Math.max(maxHeld, k - before - 1);
      before = k;
      m++;
    }
  }
  const maxCountError = Math.max(...counts.map((c, j) => Math.abs(c - exact[j]!))),
    widthRounding = meridian - N * stitchWidth;
  let lo = Infinity,
    hi = -Infinity;
  for (const s of cut.samples) {
    lo = Math.min(lo, s.lon);
    hi = Math.max(hi, s.lon);
  }
  const cutWander = Math.max(
    ...cut.samples.map((s) => R * Math.cos(s.lat) * Math.abs(s.lon - (lo + hi) / 2))
  );
  const bottomFirst = start === 'v0',
    poles: SphereKnitLayout['poles'] = [
      { needle: 0, pole: bottomFirst ? 'bottom' : 'top', loops: counts[0]! },
      { needle: N - 1, pole: bottomFirst ? 'top' : 'bottom', loops: counts[N - 1]! },
    ];
  const sampledDiameter = 2 * R * Math.sin(domain.thetaMin + domain.thetaSpan / (2 * N));
  const mm = (x: number) => (x * 1000).toFixed(2);
  const geometry: ShapeGeometry = {
    courses,
    contours: [],
    courseHeight,
    stitchWidth,
    contourRounding: counts.map((c, j) => exact[j]! * courseHeight - c * courseHeight),
    courseRounding,
    maxLinkOffset: 0,
    resolution: 1,
    method:
      'sphere-pole-courses-v1: courses from pole to pole along a descending cut; each needle knits one circle of latitude with its measured loop count; short rows spread evenly (project construction)',
    issues: [
      `${N} needles run from pole to pole; the half meridian differs from the knitted width by ${mm(widthRounding)} mm.`,
      `Each needle knits its circle of latitude in ${Math.min(...counts)}–${Math.max(...counts)} loops, within ${maxCountError.toFixed(2)} loops of the measured course height. No loop is more than ${maxCourseDeviation.toFixed(1)} loops from its even place around its circle.`,
      `${turns} passes turn early to knit the shorter circles. A needle holds its loop for up to ${maxHeld} passes; Knit Grammar's held-loop check can flag this.`,
      'Short-row turns add no wrap or tuck; confirm this convention with the lab.',
      `The pole edges (needles 1 and ${N}) keep ${counts[0]} and ${counts[N - 1]} loops, to be gathered closed. The colour key has no gather operation, so none is drawn.`,
      `Each circle starts at the cut, which strays up to ${mm(cutWander)} mm from a single meridian.`,
    ],
  };
  if (domain.modified) {
    geometry.method =
      'sphere-domain-courses-v1: courses along the retained meridian; each needle knits a retained latitude arc with measured loop counts and nested short rows (project construction)';
    geometry.issues[0] = `${N} needles span the retained meridian; its length differs from the knitted width by ${mm(widthRounding)} mm.`;
    geometry.issues[1] = `Each needle knits its latitude arc in ${Math.min(...counts)}–${Math.max(...counts)} loops, within ${maxCountError.toFixed(2)} loops of the target. Maximum even-position deviation is ${maxCourseDeviation.toFixed(1)} loops.`;
    geometry.issues[4] = domain.opened
      ? `Target polar opening diameter ${mm(domain.openingDiameter)} mm; outer knitting ring diameters ${mm(sampledDiameter)} mm at both ends. These sampled ring centers lie inside the retained band; targets are not calibrated fabric holes. No finishing operation is added.`
      : `The pole-side edges keep ${counts[0]} and ${counts[N - 1]} loops; no native finishing operation is added.`;
    geometry.issues[5] = domain.partial
      ? `The sector retains ${(100 * domain.fraction).toFixed(2)}% angular coverage. Its meridian sides are independent natural boundaries, not paired as a closing seam.`
      : `Each latitude arc starts at the validated rim-to-rim cut, which strays up to ${mm(cutWander)} mm from one meridian.`;
  }
  return {
    geometry,
    needles: { w: N, h: P, placements, moves: [], steps, unresolved: [], yarnJumps },
    layout: {
      start,
      needles: N,
      passes: P,
      counts,
      exact,
      maxCountError,
      maxCourseDeviation,
      widthRounding,
      turns,
      maxHeld,
      cutWander,
      poles,
      ...(domain.modified
        ? {
            domain: {
              openingDiameter: domain.openingDiameter,
              fraction: domain.fraction,
              longitudeSpan: domain.longitudeSpan,
              retainedMeridianLength: domain.meridianLength,
              actualOuterRingDiameters: [sampledDiameter, sampledDiameter] as [number, number],
            },
          }
        : {}),
    },
  };
}

/** Chart [longitude from the cut in turns, latitude fraction] to the sphere. */
export function sphereToSurface(surface: SurfaceSpec, cut: SphereCut) {
  const R = surface.size / 2,
    domain = sphereDomain(surface);
  return ([u, v]: Vec2): Vec3 => {
    if (domain.partial) return sphereDomainPoint(surface, u, v);
    const lat = domain.modified
        ? Math.PI / 2 - domain.thetaMax + domain.thetaSpan * v
        : Math.PI * v - Math.PI / 2,
      lon = cutLongitude(cut, lat) + domain.longitudeSpan * u;
    return [
      R * Math.cos(lat) * Math.cos(lon),
      R * Math.cos(lat) * Math.sin(lon),
      R * Math.sin(lat),
    ];
  };
}

/**
 * Chart positions of every source cell, edge and node. Longitudes are unwrapped along each
 * outline, then the point farthest from the cut is put in [0, 1). A cell around a pole becomes a
 * band closed along the pole line; a pole on an outline becomes a segment of the pole line. A
 * node on a pole is repeated along the pole line, because every loop of the pole needle meets it.
 */
export function spherePlacement(
  surface: SurfaceSpec,
  graph: PatternGraph,
  cut: SphereCut,
  poleCopies: number
) {
  const domain = sphereDomain(surface),
    latitudeV = (lat: number) =>
      domain.modified ? (lat - (Math.PI / 2 - domain.thetaMax)) / domain.thetaSpan : vOf(lat),
    tol = 1e-9 * surface.size,
    atPole = (p: Vec3) => !domain.opened && Math.hypot(p[0], p[1]) <= tol,
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
  const unwrap = (points: Vec3[]): Vec2[] => {
    let previous: number | undefined;
    return points.map((p) => {
      const raw = lonOf(p),
        lat = latOf(p);
      previous = previous === undefined ? raw : previous + wrap(raw - previous);
      const u = domain.partial
        ? sphereDomainUV(surface, p)[0]
        : (previous - cutLongitude(cut, lat)) / TAU;
      return [Math.abs(u - Math.round(u)) < 1e-9 ? Math.round(u) : u, latitudeV(lat)];
    });
  };
  const anchor = (line: Vec2[]): Vec2[] => {
    if (domain.partial) return line;
    let best = -1,
      shift = 0;
    for (const [u] of line) {
      const f = u - Math.floor(u),
        d = Math.min(f, 1 - f);
      if (d > best) {
        best = d;
        shift = Math.floor(u);
      }
    }
    return line.map(([u, v]) => [u - shift, v]);
  };
  // Network edges are great-circle arcs between samples, which the latitude/longitude chart bends,
  // most near a pole. Non-cut edges get ARC_STEPS chart points per sample interval; cut edges keep
  // their samples, which lie exactly on the seam line.
  const cutIds = new Set(cut.edges.map((e) => e.id));
  const sampled = (e: PatternGraph['edges'][0], a: Vec3, b: Vec3): Vec3[] => {
    const p = orientedEdgePath(e, a, b);
    if (cutIds.has(e.id)) return p;
    return p.flatMap((q, i) => {
      const next = p[i + 1];
      if (!next) return [q];
      const r = Math.hypot(...q);
      return Array.from({ length: ARC_STEPS }, (_, k) => {
        if (!k) return q;
        const t = k / ARC_STEPS;
        if (domain.modified) {
          const a = sphereDomainUV(surface, q),
            b = sphereDomainUV(surface, next);
          if (atPole(q)) a[0] = b[0];
          if (atPole(next)) b[0] = a[0];
          if (!domain.partial) b[0] = a[0] + wrap((b[0] - a[0]) * TAU) / TAU;
          return sphereDomainPoint(surface, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        }
        const x = q.map((c, d) => c * (1 - t) + next[d]! * t) as Vec3,
          n = Math.hypot(...x);
        return x.map((c) => (c * r) / n) as Vec3;
      });
    });
  };
  const edges = graph.edges.map((e) => {
    const p = sampled(e, nodes.get(e.a)!, nodes.get(e.b)!),
      lines: Vec2[][] = [];
    let run: Vec3[] = [],
      lead: number | null = null;
    const flush = (pole: number | null) => {
      if (!run.length) return;
      const line = anchor(unwrap(run));
      lines.push([
        ...(lead === null ? [] : [[line[0]![0], lead] as Vec2]),
        ...line,
        ...(pole === null ? [] : [[line.at(-1)![0], pole] as Vec2]),
      ]);
    };
    for (const q of p) {
      if (!atPole(q)) {
        run.push(q);
        continue;
      }
      const pole = latitudeV(latOf(q));
      flush(pole);
      run = [];
      lead = pole;
    }
    flush(null);
    return lines;
  });
  const nodeCopies = graph.nodes.map((n): Vec2[] =>
    atPole(n.position)
      ? Array.from({ length: poleCopies }, (_, i) => [i / poleCopies, latitudeV(latOf(n.position))])
      : anchor(unwrap([n.position]))
  );
  const edgeIndex = new Map(
    graph.edges.map((e, i) => [e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`, i])
  );
  const outlines: Vec3[][] = graph.cells.map((c) =>
    c.nodes.flatMap((a, i) => {
      const b = c.nodes[(i + 1) % c.nodes.length]!,
        ei = edgeIndex.get(a < b ? `${a}|${b}` : `${b}|${a}`);
      if (ei === undefined) return [nodes.get(a)!];
      return sampled(graph.edges[ei]!, nodes.get(a)!, nodes.get(b)!).slice(0, -1);
    })
  );
  // Chart vertex per outline point; inserted pole-line points are appended after them.
  const vertexOf: Map<Vec3, Vec2>[] = [];
  const cells = outlines.map((poly, ci) => {
    const n = poly.length,
      on = poly.map(atPole),
      map = new Map<Vec3, Vec2>();
    vertexOf.push(map);
    const visits = on.filter((x, i) => x && !on[(i + n - 1) % n]).length;
    if (visits > 1) throw new Error(`Cell ${graph.cells[ci]!.id} touches a pole more than once.`);
    if (!visits) {
      const line = unwrap([...poly, poly[0]!]),
        turns = Math.round(line.at(-1)![0] - line[0]![0]);
      if (!turns) {
        const out = anchor(line.slice(0, -1));
        poly.forEach((q, i) => map.set(q, out[i]!));
        return out;
      }
      // A pole lies inside the cell: close the band along the pole line.
      const out = anchor(line),
        pole = poly.reduce((s, q) => s + q[2], 0) > 0 ? 1 : 0;
      poly.forEach((q, i) => map.set(q, out[i]!));
      return [...out, [out.at(-1)![0], pole], [out[0]![0], pole]] as Vec2[];
    }
    // One pole visit: start after it, so the pole-line segment closes the outline.
    const first = on.findIndex((x, i) => !x && on[(i + n - 1) % n]),
      order = Array.from({ length: n }, (_, i) => poly[(first + i) % n]!),
      rest = order.filter((q) => !atPole(q));
    if (order.slice(0, rest.length).some(atPole))
      throw new Error(`Cell ${graph.cells[ci]!.id} touches a pole more than once.`);
    const out = anchor(unwrap(rest)),
      pole = latitudeV(latOf(order.find(atPole)!));
    rest.forEach((q, i) => map.set(q, out[i]!));
    return [...out, [out.at(-1)![0], pole], [out[0]![0], pole]] as Vec2[];
  });
  return { cells, edges, nodes: nodeCopies, outlines, vertexOf };
}

/** Network chart on the sphere: periodic in longitude, with each needle's own loop metric. */
export function sphereChart(
  surface: SurfaceSpec,
  graph: PatternGraph,
  cut: SphereCut,
  layout: Pick<SphereKnitLayout, 'start' | 'needles' | 'passes' | 'counts'>
): NetworkChart {
  const { start, needles: N, counts } = layout,
    placed = spherePlacement(surface, graph, cut, 2 * layout.passes),
    toSurface = sphereToSurface(surface, cut),
    R = surface.size / 2,
    domain = sphereDomain(surface);
  return {
    method: domain.modified
      ? 'sphere domain-course chart: retained latitude across needles, retained azimuth along each needle'
      : 'sphere pole-course chart: latitude across the needles, longitude from the cut around each circle',
    periodic: !domain.partial,
    marks: domain.partial
      ? 'Network marks use the retained latitude and angular sector. Natural meridian boundaries do not wrap or form a paired closing seam.'
      : domain.opened
        ? 'Network marks use retained latitude and longitude from the validated cut. Only selected meridian cut edges wrap to both seam sides; circular rim boundaries remain unpaired.'
        : 'Network marks use latitude and the longitude from the cut, measured in loops of each needle. The chart wraps around the cut, so cut edges and nodes are drawn on both seam sides, and a node on a pole marks the whole pole edge.',
    cells: placed.cells,
    edges: placed.edges,
    nodes: placed.nodes,
    loop: (p) => {
      const q = p.loop.net,
        A = counts[p.needle];
      if (!q || !A) throw new Error('Sphere loops need chart coordinates.');
      const metric: Metric = start === 'v0' ? [0, N, -A, 0] : [0, -N, A, 0];
      return { uv: q, metric };
    },
    toSurface,
    toGrid: (p) => {
      const lat = latOf(p),
        u = Math.hypot(p[0], p[1]) <= 1e-9 * R ? 0 : (lonOf(p) - cutLongitude(cut, lat)) / TAU;
      if (domain.partial) return sphereDomainUV(surface, p);
      return [
        u - Math.floor(u),
        domain.modified ? (lat - (Math.PI / 2 - domain.thetaMax)) / domain.thetaSpan : vOf(lat),
      ];
    },
  };
}

/** Pass 1 and last-pass loops, the needles each cut edge spans, and the M4a side on each seam side. */
export function sphereSeam(
  surface: SurfaceSpec,
  graph: PatternGraph,
  plan: CutPlan,
  cut: SphereCut,
  layout: Omit<SphereKnitLayout, 'seam'>,
  needles: ShapeNeedles
): SphereSeam {
  const { start, needles: N, passes: P } = layout,
    side = (course: number): SphereSeamSide['loops'] =>
      needles.placements
        .filter((p) => p.course === course)
        .sort((a, b) => a.needle - b.needle)
        .map((p) => ({ id: p.loop.id, needle: p.needle, course }));
  const domain = sphereDomain(surface),
    latOfNeedle = (j: number) => {
      const v = start === 'v0' ? (j + 0.5) / N : 1 - (j + 0.5) / N;
      return domain.modified
        ? Math.PI / 2 - domain.thetaMax + domain.thetaSpan * v
        : Math.PI * v - Math.PI / 2;
    };
  const edges = cut.edges.map(({ id, top, bottom }) => {
    const inside = Array.from({ length: N }, (_, j) => j).filter((j) => {
      const lat = latOfNeedle(j);
      return lat <= top && lat > bottom;
    });
    return {
      id,
      needles: inside.length ? ([inside[0]!, inside.at(-1)!] as [number, number]) : null,
    };
  });
  // The start side holds pass 1, which sits just after the cut (u near 0) when v1 and just
  // before it (u near 1) when v0.
  const placed = spherePlacement(surface, graph, cut, 1),
    cellIndex = new Map(graph.cells.map((c, i) => [c.id, i])),
    sourceCell = new Map(plan.complex.faces.map((f) => [f.id, f.sourceId])),
    edgeById = new Map(graph.edges.map((e) => [e.id, e])),
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    startHigh = start === 'v0',
    cutSides: [Record<string, 0 | 1>, Record<string, 0 | 1>] = [{}, {}];
  for (const seam of plan.seams) {
    const e = edgeById.get(seam.sourceEdgeId);
    if (!e || !cut.edges.some((c) => c.id === e.id)) continue;
    const samples = e.path && e.path.length >= 2 ? e.path : [nodes.get(e.a)!, nodes.get(e.b)!];
    const high = seam.sides.map((s) => {
      const ci = cellIndex.get(sourceCell.get(s.faceId) ?? '');
      const q = ci === undefined ? undefined : samples.find((x) => placed.vertexOf[ci]!.has(x));
      if (ci === undefined || !q)
        throw new Error(`The seam sides of cut edge ${e.id} could not be placed.`);
      return placed.vertexOf[ci]!.get(q)![0] > 0.5;
    });
    if (high[0] === high[1])
      throw new Error(`Both seam sides of cut edge ${e.id} fall on one side of the cut.`);
    seam.sides.forEach((_, i) => {
      cutSides[high[i] === startHigh ? 0 : 1][e.id] = i as 0 | 1;
    });
  }
  return {
    sourceEdgeIds: cut.edges.map((e) => e.id),
    edges,
    sides: [
      { kind: 'start', loops: side(0), cutSides: cutSides[0] },
      { kind: 'end', loops: side(P - 1), cutSides: cutSides[1] },
    ],
  };
}

/** Fixed +X chart origin for a naturally open sector. The graph is validated independently as
 * one disk; these samples describe a chart boundary, not a requested or paired cut. */
export function sphereSectorCut(surface: SurfaceSpec, graph: PatternGraph): SphereCut {
  const domain = sphereDomain(surface);
  if (!domain.partial)
    throw new Error('Natural sphere-sector boundaries require fractional angular coverage.');
  if (!graph.edges.some((e) => e.cells.length === 1))
    throw new Error('A sphere sector needs its natural boundary network.');
  return {
    edges: [],
    samples: [
      { lat: Math.PI / 2 - domain.thetaMin, lon: 0 },
      { lat: Math.PI / 2 - domain.thetaMax, lon: 0 },
    ],
  };
}

/** Metadata for the two independent meridian sides of a sector. No source edges are paired,
 * and circular polar rims are never interpreted as a closing seam. */
export function sphereSectorSeam(
  surface: SurfaceSpec,
  graph: PatternGraph,
  cut: SphereCut,
  layout: Omit<SphereKnitLayout, 'seam'>,
  needles: ShapeNeedles
): SphereSeam {
  const domain = sphereDomain(surface);
  if (!domain.partial || cut.edges.length || cut.samples.some((p) => p.lon !== 0))
    throw new Error('A sphere sector requires the fixed +X natural-boundary chart.');
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    sides: [string[], string[]] = [[], []];
  for (const e of graph.edges) {
    if (e.cells.length !== 1) continue;
    const points = orientedEdgePath(e, nodes.get(e.a)!, nodes.get(e.b)!).filter(
      (p) => Math.hypot(p[0], p[1]) > 1e-9 * surface.size
    );
    if (!points.length) continue;
    const us = points.map((p) => sphereDomainUV(surface, p)[0]);
    if (us.every((u) => Math.abs(u) < 1e-8)) sides[0].push(e.id);
    if (us.every((u) => Math.abs(1 - u) < 1e-8)) sides[1].push(e.id);
  }
  if (!sides[0].length || !sides[1].length)
    throw new Error('The sector network must retain both natural meridian boundaries.');
  const loops = (course: number): SphereSeamSide['loops'] =>
    needles.placements
      .filter((p) => p.course === course)
      .sort((a, b) => a.needle - b.needle)
      .map((p) => ({ id: p.loop.id, needle: p.needle, course }));
  const startSide = layout.start === 'v0' ? 1 : 0;
  return {
    sourceEdgeIds: [],
    edges: [],
    sides: [
      { kind: 'start', loops: loops(0), cutSides: {} },
      { kind: 'end', loops: loops(layout.passes - 1), cutSides: {} },
    ],
    naturalBoundaries: {
      paired: false,
      startEdgeIds: sides[startSide]!,
      endEdgeIds: sides[1 - startSide]!,
    },
  };
}
