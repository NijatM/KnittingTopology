// Exact flat development of a cube opened along whole crease lines, and its needle/pass layout.
// Project construction (M4b). The cube's curvature sits at its eight corners. Seven whole cut
// creases form a tree through all corners, so the six faces unfold isometrically, by rotations
// about the five remaining creases, into one of the eleven planar cube nets.
import type { PatternGraph, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import { cubeCoordinates, evaluateSurface } from '../core/surfaces';
import { cutEdgeLength, type CutPlan } from './cut-types';
import type {
  ShapeCourse,
  ShapeGeometry,
  ShapeNeedles,
  ShapePlacement,
  ShapePoint,
  StartEdge,
} from './shape-types';
import type { NetworkChart } from './rasterize-surface';
import { MAX_SIDE } from './grid';

const NORMALS: Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const FACE_NAMES = ['+X', '−X', '+Y', '−Y', '+Z', '−Z'];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Outward chart axes: cubeCoordinates(f, u, v) = n + (2u - 1) t1 + (2v - 1) t2. */
const AXES: [Vec3, Vec3][] = NORMALS.map((_, f) => {
  const d = (a: Vec3, b: Vec3) => a.map((x, k) => (x - b[k]!) / 2) as Vec3;
  return [
    d(cubeCoordinates(f, 1, 0.5), cubeCoordinates(f, 0, 0.5)),
    d(cubeCoordinates(f, 0.5, 1), cubeCoordinates(f, 0.5, 0)),
  ];
});
/** Counter-clockwise quarter turns. */
const rot = (turn: number, [x, y]: Vec2): Vec2 => {
  switch (((turn % 4) + 4) % 4) {
    case 0:
      return [x, y];
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    default:
      return [y, -x];
  }
};
const countCeil = (x: number) => Math.ceil(x - 1e-10 * Math.max(1, x));
export const creaseKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
export const creaseLabel = (key: string) =>
  key
    .split(',')
    .map((f) => FACE_NAMES[Number(f)])
    .join('|');
export const faceLabel = (f: number) => FACE_NAMES[f]!;

export interface CubeNet {
  /** Per cube patch: lower-left net cell and counter-clockwise quarter turns of its outward chart. Display orientation, face-edge units. */
  faces: { cell: Vec2; turn: number }[];
  cols: number;
  rows: number;
  root: number;
  cutCreases: string[];
  hinges: string[];
}

/** Faces whose plane contains p, within `tol` meters. */
export function facesAt(surface: SurfaceSpec, p: Vec3, tol = 1e-8 * surface.size): number[] {
  const h = surface.size / 2;
  return NORMALS.flatMap((n, f) => (Math.abs(dot(p, n) - h) <= tol ? [f] : []));
}
function creaseOf(surface: SurfaceSpec, path: Vec3[]): string | undefined {
  const on = [0, 1, 2, 3, 4, 5].filter((f) => path.every((p) => facesAt(surface, p).includes(f)));
  return on.length === 2 ? creaseKey(on[0]!, on[1]!) : undefined;
}
const edgePath = (graph: PatternGraph, nodes: Map<string, Vec3>, e: PatternGraph['edges'][0]) =>
  e.path && e.path.length >= 2 ? e.path : [nodes.get(e.a)!, nodes.get(e.b)!];

/** Unfold a validated cube cut. Throws a user-facing reason outside the supported subset. */
export function cubeNetFromCut(
  surface: SurfaceSpec,
  graph: PatternGraph,
  edgeIds: readonly string[],
  startEdge: StartEdge = 'v0'
): CubeNet {
  if (surface.kind !== 'cube') throw new Error('The flat net needs a cube.');
  const L = surface.size,
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    cut = new Set(edgeIds),
    along = new Map<string, { cut: number; total: number; length: number }>();
  for (const e of graph.edges) {
    const path = edgePath(graph, nodes, e),
      key = creaseOf(surface, path);
    if (!key) {
      if (cut.has(e.id))
        throw new Error(
          'This cut runs through the inside of a cube face. Closed-surface knitting currently needs a cut made only of whole crease lines, such as the cross-net preset.'
        );
      continue;
    }
    const s = along.get(key) ?? { cut: 0, total: 0, length: 0 };
    s.total++;
    if (cut.has(e.id)) {
      s.cut++;
      s.length += cutEdgeLength(e, nodes.get(e.a)!, nodes.get(e.b)!);
    }
    along.set(key, s);
  }
  const cutCreases = [...along]
    .filter(([, s]) => s.cut)
    .map(([key, s]) => {
      if (s.cut !== s.total || Math.abs(s.length - L) > 1e-6 * L)
        throw new Error(
          `Cube crease ${creaseLabel(key)} is only partly cut. Cut whole crease lines from corner to corner.`
        );
      return key;
    })
    .sort();
  const hinges: string[] = [];
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++)
      if (a >> 1 !== b >> 1 && !cutCreases.includes(creaseKey(a, b))) hinges.push(creaseKey(a, b));
  if (cutCreases.length !== 7)
    throw new Error(
      `A cube opens flat when exactly seven whole creases are cut; this cut has ${cutCreases.length}.`
    );
  const adj: number[][] = NORMALS.map(() => []);
  for (const k of hinges) {
    const [a, b] = k.split(',').map(Number) as [number, number];
    adj[a]!.push(b);
    adj[b]!.push(a);
  }
  let root = 0;
  for (let f = 1; f < 6; f++) if (adj[f]!.length > adj[root]!.length) root = f;
  const place: ({ cell: Vec2; turn: number } | undefined)[] = Array(6).fill(undefined);
  place[root] = { cell: [0, 0], turn: 0 };
  const queue = [root];
  for (let q = 0; q < queue.length; q++) {
    const f = queue[q]!,
      pf = place[f]!;
    for (const g of [...adj[f]!].sort((a, b) => a - b)) {
      if (place[g]) continue;
      // Across the hinge, g continues outwards from f; f lies in the opposite direction seen from g.
      const d = rot(pf.turn, [dot(NORMALS[g]!, AXES[f]![0]), dot(NORMALS[g]!, AXES[f]![1])]);
      const s: Vec2 = [dot(NORMALS[f]!, AXES[g]![0]), dot(NORMALS[f]!, AXES[g]![1])];
      const turn = [0, 1, 2, 3].find((r) => {
        const q = rot(r, s);
        return q[0] === -d[0] && q[1] === -d[1];
      });
      if (turn === undefined) throw new Error('Invalid cube hinge orientation.');
      place[g] = { cell: [pf.cell[0] + d[0], pf.cell[1] + d[1]], turn };
      queue.push(g);
    }
  }
  if (place.some((p) => !p)) throw new Error('The remaining creases do not connect all six faces.');
  const cells = new Set(place.map((p) => p!.cell.join()));
  if (cells.size !== 6) throw new Error('The unfolded faces overlap.');
  const minX = Math.min(...place.map((p) => p!.cell[0])),
    minY = Math.min(...place.map((p) => p!.cell[1]));
  const W = Math.max(...place.map((p) => p!.cell[0])) - minX + 1,
    H = Math.max(...place.map((p) => p!.cell[1])) - minY + 1;
  // Start edge: the chosen side of the unfolded net becomes pass 1; quarter turns without mirroring.
  const faces = place.map((p) => {
    const x = p!.cell[0] - minX,
      y = p!.cell[1] - minY;
    switch (startEdge) {
      case 'v0':
        return { cell: [x, y] as Vec2, turn: p!.turn };
      case 'u1':
        return { cell: [y, W - 1 - x] as Vec2, turn: (p!.turn + 3) % 4 };
      case 'v1':
        return { cell: [W - 1 - x, H - 1 - y] as Vec2, turn: (p!.turn + 2) % 4 };
      case 'u0':
        return { cell: [H - 1 - y, x] as Vec2, turn: (p!.turn + 1) % 4 };
      default:
        throw new Error('Invalid shaping start edge.');
    }
  });
  const swap = startEdge === 'u1' || startEdge === 'u0';
  return { faces, cols: swap ? H : W, rows: swap ? W : H, root, cutCreases, hinges };
}

/** Face chart UV of a point on face f. */
export function faceUV(surface: SurfaceSpec, f: number, p: Vec3): Vec2 {
  const h = surface.size / 2,
    clamp = (x: number) => Math.max(0, Math.min(1, x));
  return [clamp((dot(p, AXES[f]![0]) / h + 1) / 2), clamp((dot(p, AXES[f]![1]) / h + 1) / 2)];
}
/** Net position (face-edge units, display orientation) of face-chart UV on face f. */
export function netPoint(net: CubeNet, f: number, uv: Vec2): Vec2 {
  const { cell, turn } = net.faces[f]!,
    q = rot(turn, [uv[0] - 0.5, uv[1] - 0.5]);
  return [cell[0] + 0.5 + q[0], cell[1] + 0.5 + q[1]];
}
/** Face-chart UV of a net position, relative to face f's cell. */
export function netUV(net: CubeNet, f: number, q: Vec2): Vec2 {
  const { cell, turn } = net.faces[f]!,
    p = rot(4 - turn, [q[0] - cell[0] - 0.5, q[1] - cell[1] - 0.5]),
    clamp = (x: number) => Math.max(0, Math.min(1, x));
  return [clamp(p[0] + 0.5), clamp(p[1] + 0.5)];
}
export const netFaceAt = (net: CubeNet, x: number, y: number) =>
  net.faces.findIndex((p) => p.cell[0] === x && p.cell[1] === y);

export interface CubeStop {
  /** One-based pass of the last loops; zero-based inclusive needle range. */
  pass: number;
  from: number;
  to: number;
}
export interface CubeShift {
  /** One-based pass; zero-based inclusive needle range. */
  pass: number;
  from: number;
  to: number;
  kind: 'late start' | 'extra course';
}
export interface CubeSeamSide {
  face: number;
  kind: 'start' | 'end' | 'left side' | 'right side';
  /** Ordered along the crease from its lower-coordinate corner; zero-based needle and course. */
  loops: { id: string; needle: number; course: number }[];
  /** Loops displaced by one course, or missing from the side, after yarn-travel shifts. */
  shifted: number;
  /** M4a seam side index per cut source edge on this side. */
  cutSides: Record<string, 0 | 1>;
}
export interface CubeSeam {
  crease: string;
  sourceEdgeIds: string[];
  sides: [CubeSeamSide, CubeSeamSide];
}
export interface CubeNetLayout {
  net: CubeNet;
  needlesPerFace: number;
  passesPerFace: number;
  /** Face edge minus its needle count times stitch width, and pass count times course height (m). */
  widthRounding: number;
  heightRounding: number;
  shifts: CubeShift[];
  stops: CubeStop[];
  seams: CubeSeam[];
}

/** Uniform needle/pass grid on the net. A change of run end on the side where the pass starts
 * waits one pass, so the yarn never floats across new or stopping needles. */
export function layoutCubeNet(
  surface: SurfaceSpec,
  net: CubeNet,
  stitchWidth: number,
  courseHeight: number,
  firstDir: 1 | -1
): { geometry: ShapeGeometry; needles: ShapeNeedles; layout: Omit<CubeNetLayout, 'seams'> } {
  if (![stitchWidth, courseHeight].every((x) => Number.isFinite(x) && x > 0))
    throw new Error('Measured stitch width and course height must be finite and positive.');
  const L = surface.size,
    nw = Math.max(1, countCeil(L / stitchWidth)),
    nc = Math.max(1, Math.round(L / courseHeight)),
    W = net.cols * nw,
    H = net.rows * nc;
  if (W > MAX_SIDE) throw new Error(`The flat net needs ${W} needles, above the 600 needle limit.`);
  if (H > MAX_SIDE) throw new Error(`The flat net needs ${H} passes, above the 600 pass limit.`);
  const occupied = (x: number, y: number) => netFaceAt(net, x, y) >= 0;
  const nominal = Array.from({ length: H }, (_, k) => {
    const row = Math.floor(k / nc),
      cols = Array.from({ length: net.cols }, (_, x) => x).filter((x) => occupied(x, row));
    return [cols[0]! * nw, (cols.at(-1)! + 1) * nw - 1] as [number, number];
  });
  const run = nominal.map((r) => [...r] as [number, number]),
    shifts: CubeShift[] = [];
  for (let k = 1; k < H; k++) {
    const dir = (firstDir * (k % 2 ? -1 : 1)) as 1 | -1,
      side = dir === 1 ? 0 : 1,
      before = run[k - 1]![side],
      wanted = run[k]![side];
    if (wanted === before) continue;
    run[k]![side] = before;
    const widen = side === 0 ? wanted < before : wanted > before;
    const [from, to] = side === 0 ? [wanted, before - 1] : [before + 1, wanted];
    shifts.push(
      widen
        ? { pass: k + 1, from, to, kind: 'late start' }
        : {
            pass: k + 1,
            from: side === 0 ? before : wanted + 1,
            to: side === 0 ? wanted - 1 : before,
            kind: 'extra course',
          }
    );
  }
  const first = new Int32Array(W).fill(-1),
    last = new Int32Array(W).fill(-1);
  run.forEach(([l, r], k) => {
    for (let j = l; j <= r; j++) {
      if (first[j] === -1) first[j] = k;
      else if (last[j] !== k - 1) throw new Error('A needle would restart after stopping.');
      last[j] = k;
    }
  });
  for (let j = 0; j < W; j++)
    if (first[j] === -1)
      throw new Error('A face is too small for the measured course height; enlarge the cube.');
  const placementIndex = new Map<string, number>(),
    courses: ShapeCourse[] = [],
    placements: ShapePlacement[] = [],
    steps: ShapeNeedles['steps'] = [],
    courseRounding: number[] = [];
  const pointAt = (j: number, k: number): ShapePoint => {
    const col = Math.floor(j / nw),
      rows = Array.from({ length: net.rows }, (_, y) => y).filter((y) => occupied(col, y)),
      lo = rows[0]! * nc,
      hi = (rows.at(-1)! + 1) * nc - 1,
      kk = Math.max(lo, Math.min(hi, k)),
      f = netFaceAt(net, col, Math.floor(kk / nc));
    // Shifted loops outside the nominal net sit on the edge of their own face.
    const q: Vec2 = [(j + 0.5) / nw, Math.max(lo / nc, Math.min((hi + 1) / nc, (k + 0.5) / nc))],
      uv = netUV(net, f, q);
    return {
      uv,
      position: evaluateSurface(surface, f, uv[0], uv[1]),
      across: (j + 0.5) * stitchWidth,
      patch: f,
      net: q,
    };
  };
  for (let k = 0; k < H; k++) {
    const [l, r] = run[k]!,
      loops = [] as ShapeCourse['loops'];
    for (let j = l; j <= r; j++) {
      const loop = { ...pointAt(j, k), id: `shape:${k}:${j - l}` },
        parent = k > 0 && first[j]! < k ? placements[placementIndex.get(`${j},${k - 1}`)!]! : null;
      loops.push(loop);
      placementIndex.set(`${j},${k}`, placements.length);
      const fresh = !parent && k > 0;
      placements.push({
        loop,
        course: k,
        needle: j,
        role: fresh ? 'edge increase' : 'loop',
        parents: parent ? [parent.loop.id] : [],
      });
      if (fresh) steps.push({ pass: k + 1, needle: j, role: 'edge increase' });
    }
    const length = ((r - l + 1) / nw) * L;
    courseRounding.push(length - loops.length * stitchWidth);
    // Course polylines pass through the fold between loops on hinged faces, not through the cube.
    const points: ShapePoint[] = [];
    loops.forEach(({ uv, position, across, patch, net: q }, i) => {
      points.push({ uv, position, across, patch, net: q });
      const next = loops[i + 1];
      if (!next || next.patch === patch) return;
      const fold: Vec2 = [(l + i + 1) / nw, q![1]],
        foldUV = netUV(net, patch!, fold);
      points.push({
        uv: foldUV,
        position: evaluateSurface(surface, patch!, foldUV[0], foldUV[1]),
        across: (l + i + 1) * stitchWidth,
        patch,
        net: fold,
      });
    });
    courses.push({
      id: `course:${k}`,
      index: k,
      points,
      loops,
      extent: [l * stitchWidth, (r + 1) * stitchWidth],
      leftBoundary: true,
      rightBoundary: true,
      turnStart: false,
      turnEnd: false,
      length,
    });
  }
  let yarnJumps = 0,
    previousEnd: number | undefined;
  run.forEach(([l, r], k) => {
    const dir = firstDir * (k % 2 ? -1 : 1);
    if (previousEnd !== undefined && Math.abs((dir === 1 ? l : r) - previousEnd) > 1) yarnJumps++;
    previousEnd = dir === 1 ? r : l;
  });
  const stops: CubeStop[] = [];
  for (let j = 0; j < W; j++) {
    if (last[j] === H - 1) continue;
    const s = stops.at(-1);
    if (s && s.pass === last[j]! + 1 && s.to === j - 1) s.to = j;
    else stops.push({ pass: last[j]! + 1, from: j, to: j });
  }
  const widthRounding = L - nw * stitchWidth,
    heightRounding = L - nc * courseHeight;
  const geometry: ShapeGeometry = {
    courses,
    contours: [],
    courseHeight,
    stitchWidth,
    contourRounding: [heightRounding],
    courseRounding,
    maxLinkOffset: 0,
    resolution: 1,
    method:
      'cube-crease-net-v1: exact unfolding of a cube cut along seven whole creases; uniform needle/pass grid per face (project construction)',
    issues: [
      `Each face is ${nw} needles × ${nc} passes; the face edge differs from the knitted size by ${(widthRounding * 1000).toFixed(2)} mm across and ${(heightRounding * 1000).toFixed(2)} mm along the wales.`,
      'Folds between hinged faces are knitted straight through; the knit does not form the crease.',
      ...(stops.length
        ? [
            `${stops.length} needle ranges stop while other needles continue. The colour key has no cast-off; cast off there in the lab software or hold the loops to the end.`,
          ]
        : []),
      ...(shifts.length
        ? [
            `${shifts.length} run changes wait one pass so the yarn does not float across the needles; those loops are one course from the exact net.`,
          ]
        : []),
    ],
  };
  return {
    geometry,
    needles: { w: W, h: H, placements, moves: [], steps, unresolved: [], yarnJumps },
    layout: {
      net,
      needlesPerFace: nw,
      passesPerFace: nc,
      widthRounding,
      heightRounding,
      shifts,
      stops,
    },
  };
}

/** Faces that a cell occupies, from samples strictly inside one face and its projected centroid. */
function cellFaces(surface: SurfaceSpec, polygon: Vec3[]): Set<number> {
  const out = new Set<number>(),
    add = (p: Vec3) => {
      const f = facesAt(surface, p);
      if (f.length === 1) out.add(f[0]!);
    };
  polygon.forEach((p, i) => {
    const q = polygon[(i + 1) % polygon.length]!;
    add(p);
    add(p.map((x, k) => (x + q[k]!) / 2) as Vec3);
  });
  const c = [0, 1, 2].map((k) => polygon.reduce((s, p) => s + p[k]!, 0) / polygon.length) as Vec3,
    m = Math.max(...c.map(Math.abs));
  if (m > 0) add(c.map((x) => (x * surface.size) / 2 / m) as Vec3);
  return out;
}

/** Explicit flat-net positions of every source cell, edge and node. Cut edges and nodes have one copy per side. */
export function cubeNetPlacement(surface: SurfaceSpec, graph: PatternGraph, net: CubeNet) {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    edgeIndex = new Map(
      graph.edges.map((e, i) => [e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`, i])
    ),
    cutCreases = new Set(net.cutCreases);
  const toNet = (p: Vec3, faces: Set<number>, what: string): Vec2 => {
    const options = facesAt(surface, p).filter((f) => faces.has(f));
    if (!options.length) throw new Error(`${what} could not be placed on the flat net.`);
    for (let i = 1; i < options.length; i++)
      if (cutCreases.has(creaseKey(options[0]!, options[i]!)))
        throw new Error(`${what} crosses the cut.`);
    return netPoint(net, options[0]!, faceUV(surface, options[0]!, p));
  };
  const cellPolys: Vec3[][] = graph.cells.map((c) =>
    c.nodes.flatMap((a, i) => {
      const b = c.nodes[(i + 1) % c.nodes.length]!,
        ei = edgeIndex.get(a < b ? `${a}|${b}` : `${b}|${a}`);
      if (ei === undefined) return [nodes.get(a)!];
      const e = graph.edges[ei]!,
        line = edgePath(graph, nodes, e);
      return (e.a === a ? line : [...line].reverse()).slice(0, -1);
    })
  );
  const faces = cellPolys.map((p) => cellFaces(surface, p));
  const cells = cellPolys.map((p, ci) =>
    p.map((q) => toNet(q, faces[ci]!, `Cell ${graph.cells[ci]!.id}`))
  );
  const cellIndex = new Map(graph.cells.map((c, i) => [c.id, i]));
  const same = (a: Vec2[], b: Vec2[]) =>
    a.length === b.length && a.every((p, i) => Math.hypot(p[0] - b[i]![0], p[1] - b[i]![1]) < 1e-9);
  const edges = graph.edges.map((e) => {
    const copies: Vec2[][] = [];
    for (const c of e.cells) {
      const ci = cellIndex.get(c);
      if (ci === undefined) continue;
      const line = edgePath(graph, nodes, e).map((q) => toNet(q, faces[ci]!, `Edge ${e.id}`));
      if (!copies.some((x) => same(x, line))) copies.push(line);
    }
    return copies;
  });
  const nodeCells = new Map<string, number[]>();
  graph.cells.forEach((c, ci) =>
    c.nodes.forEach((n) => nodeCells.set(n, [...(nodeCells.get(n) ?? []), ci]))
  );
  const nodeCopies = graph.nodes.map((n) => {
    const copies: Vec2[] = [];
    for (const ci of nodeCells.get(n.id) ?? []) {
      const q = toNet(n.position, faces[ci]!, `Node ${n.id}`);
      if (!copies.some((x) => same([x], [q]))) copies.push(q);
    }
    return copies;
  });
  return { cells, edges, nodes: nodeCopies, cellFaces: faces };
}

/** Chart for network rasterization on the flat net: normalized net coordinates and the uniform loop grid. */
export function cubeNetChart(
  surface: SurfaceSpec,
  graph: PatternGraph,
  layout: Omit<CubeNetLayout, 'seams'>
): NetworkChart {
  const { net, needlesPerFace: nw, passesPerFace: nc } = layout,
    placed = cubeNetPlacement(surface, graph, net),
    n = (q: Vec2): Vec2 => [q[0] / net.cols, q[1] / net.rows],
    metric: [number, number, number, number] = [net.cols * nw, 0, 0, net.rows * nc];
  return {
    method: 'exact cube net: flat development of the cut cube, uniform needle/pass grid per face',
    cells: placed.cells.map((p) => p.map(n)),
    edges: placed.edges.map((c) => c.map((p) => p.map(n))),
    nodes: placed.nodes.map((c) => c.map(n)),
    loop: (p) => {
      const q = p.loop.net;
      if (!q) throw new Error('Flat-net loops need net coordinates.');
      return { uv: n(q), metric };
    },
    toSurface: ([u, v]) => {
      const x = Math.max(0, Math.min(net.cols - 1e-12, u * net.cols)),
        y = Math.max(0, Math.min(net.rows - 1e-12, v * net.rows)),
        f = netFaceAt(net, Math.floor(x), Math.floor(y));
      if (f < 0) return [NaN, NaN, NaN];
      const uv = netUV(net, f, [x, y]);
      return evaluateSurface(surface, f, uv[0], uv[1]);
    },
    toGrid: (p) => {
      const f = facesAt(surface, p, 1e-6 * surface.size)[0];
      return f === undefined ? [NaN, NaN] : n(netPoint(net, f, faceUV(surface, f, p)));
    },
  };
}

/** Loops on both sides of every cut crease, with M4a seam sides for each cut source edge. */
export function cubeNetSeams(
  surface: SurfaceSpec,
  graph: PatternGraph,
  plan: CutPlan,
  layout: Omit<CubeNetLayout, 'seams'>,
  needles: ShapeNeedles
): CubeSeam[] {
  const { net, needlesPerFace: nw, passesPerFace: nc } = layout,
    h = surface.size / 2,
    at = new Map(needles.placements.map((p) => [`${p.needle},${p.course}`, p]));
  const first = new Map<number, ShapePlacement>(),
    last = new Map<number, ShapePlacement>();
  for (const p of needles.placements) {
    if (!first.has(p.needle) || first.get(p.needle)!.course > p.course) first.set(p.needle, p);
    if (!last.has(p.needle) || last.get(p.needle)!.course < p.course) last.set(p.needle, p);
  }
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    cutFaces = new Map(plan.complex.faces.map((f) => [f.id, f.sourceId])),
    cellIndex = new Map(graph.cells.map((c, i) => [c.id, i])),
    placed = cubeNetPlacement(surface, graph, net);
  return net.cutCreases.map((crease) => {
    const [F, G] = crease.split(',').map(Number) as [number, number];
    // Crease corners: on both planes, ± along the remaining axis.
    const axis = [0, 1, 2].find((k) => !NORMALS[F]![k] && !NORMALS[G]![k])!,
      corner = (s: number) =>
        [0, 1, 2].map((k) =>
          k === axis ? s * h : (NORMALS[F]![k]! + NORMALS[G]![k]!) * h
        ) as Vec3;
    const ends = [corner(-1), corner(1)];
    const edgeIds = graph.edges
      .filter((e) => {
        const p = edgePath(graph, nodes, e);
        return plan.settings.edgeIds.includes(e.id) && creaseOf(surface, p) === crease;
      })
      .map((e) => e.id)
      .sort();
    const side = (face: number): CubeSeamSide => {
      const [q0, q1] = ends.map((p) => netPoint(net, face, faceUV(surface, face, p))) as [
          Vec2,
          Vec2,
        ],
        { cell } = net.faces[face]!,
        loops: CubeSeamSide['loops'] = [];
      let shifted = 0,
        kind: CubeSeamSide['kind'];
      const round = (x: number) => Math.round(x * 1e9) / 1e9;
      if (round(q0[1]) === round(q1[1])) {
        const bottom = round(q0[1]) === cell[1];
        kind = bottom ? 'start' : 'end';
        const lo = Math.round(Math.min(q0[0], q1[0]) * nw),
          hi = Math.round(Math.max(q0[0], q1[0]) * nw);
        for (let j = lo; j < hi; j++) {
          const p = (bottom ? first : last).get(j)!;
          if (p.course !== (bottom ? cell[1] * nc : (cell[1] + 1) * nc - 1)) shifted++;
          loops.push({ id: p.loop.id, needle: j, course: p.course });
        }
        if (q0[0] > q1[0]) loops.reverse();
      } else {
        const left = round(q0[0]) === cell[0];
        kind = left ? 'left side' : 'right side';
        const j = left ? cell[0] * nw : (cell[0] + 1) * nw - 1,
          lo = Math.round(Math.min(q0[1], q1[1]) * nc),
          hi = Math.round(Math.max(q0[1], q1[1]) * nc);
        for (let k = lo; k < hi; k++) {
          const p = at.get(`${j},${k}`);
          if (!p) shifted++;
          else loops.push({ id: p.loop.id, needle: j, course: k });
        }
        if (q0[1] > q1[1]) loops.reverse();
      }
      const cutSides: Record<string, 0 | 1> = {};
      for (const seam of plan.seams) {
        if (!edgeIds.includes(seam.sourceEdgeId)) continue;
        seam.sides.forEach((s, i) => {
          const ci = cellIndex.get(cutFaces.get(s.faceId) ?? '');
          if (ci !== undefined && placed.cellFaces[ci]!.has(face))
            cutSides[seam.sourceEdgeId] = i as 0 | 1;
        });
      }
      return { face, kind, loops, shifted, cutSides };
    };
    return { crease, sourceEdgeIds: edgeIds, sides: [side(F), side(G)] };
  });
}
