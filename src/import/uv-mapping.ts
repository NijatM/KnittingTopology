/** Supplied rectangular OBJ charts. No unwrap, geodesic, or global 3D intersection claim. */
import type {
  GenerationContext,
  ImportedMeshData,
  RectangularUVReport,
  SurfaceAttachment,
  SurfaceSpec,
  Vec2,
  Vec3,
} from '../core/types';
import { cross, dot, finite3, norm, sub } from '../core/math';
import { importedMeshSize, validateImportedMesh } from './mesh';

/** Determinants are measured after independently normalizing both UV axes. */
export const UV_DETERMINANT_TOLERANCE = 1e-14;
const QUERY_EPS = 32 * Number.EPSILON;
/** Scientific attachment tolerance; the looser project schema check is only a prefilter. */
export const MAPPED_ATTACHMENT_TOLERANCE = 1e-8;
export const MAPPED_PATH_METHOD_VERSION = 'rectangular-uv-edge-crossings-v2';
const MAX_QUERY_WORK = 2_000_000;
export const MAX_MAPPED_PATH_SAMPLES = 200_002;
type Box = { min: Vec3; max: Vec3 };
type Tree = Box & { left?: Tree; right?: Tree; ids?: number[] };
type Edge = { a: number; b: number; count: number; orientation: number };
type Index = {
  mesh: ImportedMeshData;
  uv: Vec2[];
  edges: Edge[];
  uvTree: Tree;
  worldTree: Tree;
  edgeTree: Tree;
  area: number;
};
type Cache = { report: RectangularUVReport; index?: Index };
// Scientific inputs are immutable by contract. Each index owns its validated numeric arrays.
const cache = new WeakMap<ImportedMeshData, Cache>();
function checkpoint(context?: GenerationContext): void {
  if (context?.cancelled?.()) {
    const error = new Error('Supplied chart preparation cancelled.');
    error.name = 'AbortError';
    throw error;
  }
}
function fail(reason: string): never {
  throw new Error(reason);
}
function vertex(mesh: ImportedMeshData, id: number): Vec3 {
  return [mesh.positions[3 * id], mesh.positions[3 * id + 1], mesh.positions[3 * id + 2]];
}
function determinant(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function box(points: Vec3[]): Box {
  const min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  return { min, max };
}
function buildTree(boxes: Box[], context?: GenerationContext): Tree {
  let work = 0;
  function build(ids: number[]): Tree {
    if (++work % 256 === 1) checkpoint(context);
    const bounds: Box = {
      min: [Infinity, Infinity, Infinity],
      max: [-Infinity, -Infinity, -Infinity],
    };
    for (const id of ids)
      for (let k = 0; k < 3; k++) {
        bounds.min[k] = Math.min(bounds.min[k], boxes[id].min[k]);
        bounds.max[k] = Math.max(bounds.max[k], boxes[id].max[k]);
      }
    if (ids.length <= 8) return { ...bounds, ids };
    let axis = 0;
    for (let k = 1; k < 3; k++)
      if (bounds.max[k] - bounds.min[k] > bounds.max[axis] - bounds.min[axis]) axis = k;
    ids.sort(
      (a, b) =>
        boxes[a].min[axis] + boxes[a].max[axis] - (boxes[b].min[axis] + boxes[b].max[axis]) || a - b
    );
    const middle = Math.floor(ids.length / 2);
    return { ...bounds, left: build(ids.slice(0, middle)), right: build(ids.slice(middle)) };
  }
  return build(boxes.map((_, i) => i));
}
function prepare(input: ImportedMeshData, context?: GenerationContext): Cache {
  checkpoint(context);
  const previous = cache.get(input);
  if (previous) return previous;
  let result: Cache;
  try {
    const mesh = validateImportedMesh(input);
    if (mesh.source.format !== 'obj')
      fail('A supplied rectangular chart requires OBJ texture coordinates.');
    if (!mesh.uvs || mesh.uvs.length !== (mesh.positions.length / 3) * 2)
      fail(
        'Complete, single-valued OBJ UV coordinates are unavailable (missing coordinates or a seam).'
      );
    if (mesh.uvs.some((v) => !Number.isFinite(v))) fail('OBJ UV coordinates must be finite.');
    const boundsMin: Vec2 = [Infinity, Infinity],
      boundsMax: Vec2 = [-Infinity, -Infinity];
    for (let i = 0; i < mesh.uvs.length; i++) {
      boundsMin[i % 2] = Math.min(boundsMin[i % 2], mesh.uvs[i]);
      boundsMax[i % 2] = Math.max(boundsMax[i % 2], mesh.uvs[i]);
    }
    const spans = boundsMax.map((v, i) => v - boundsMin[i]);
    if (spans.some((v) => !Number.isFinite(v) || v <= 0))
      fail('The UV bounding rectangle must have two finite positive extents.');
    const uv: Vec2[] = [];
    for (let i = 0; i < mesh.uvs.length; i += 2)
      uv.push([
        (mesh.uvs[i] - boundsMin[0]) / spans[0],
        (mesh.uvs[i + 1] - boundsMin[1]) / spans[1],
      ]);
    const count = uv.length,
      parent = Array.from({ length: count }, (_, i) => i),
      used = new Set<number>();
    const edgeMap = new Map<string, Edge>(),
      faces = new Set<string>();
    const links = Array.from({ length: count }, () => [] as [number, number][]);
    const uvBoxes: Box[] = [],
      worldBoxes: Box[] = [];
    let area = 0,
      areaCorrection = 0,
      uvArea = 0,
      uvCorrection = 0;
    let minScaleM = Infinity,
      maxScaleM = 0,
      maxCondition = 0;
    function find(a: number): number {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    }
    const areaTolerance = importedMeshSize(mesh) ** 2 * 1e-14;
    for (let f = 0; f < mesh.indices.length; f += 3) {
      if (f % 768 === 0) checkpoint(context);
      const ids = mesh.indices.slice(f, f + 3),
        [a, b, c] = ids;
      if (new Set(ids).size !== 3)
        fail('Collapsed repeated-index faces are unsupported by the supplied chart.');
      const key = [...ids].sort((a, b) => a - b).join(',');
      if (faces.has(key)) fail('Duplicate indexed faces are unsupported by the supplied chart.');
      faces.add(key);
      const p = ids.map((i) => vertex(mesh, i)),
        q = ids.map((i) => uv[i]);
      const ab = sub(p[1], p[0]),
        ac = sub(p[2], p[0]),
        faceArea = norm(cross(ab, ac)) / 2;
      if (faceArea <= areaTolerance)
        fail('Degenerate world triangles exceed the relative area tolerance (extent² × 1e-14 m²).');
      const det = determinant(q[0], q[1], q[2]);
      if (!(det > UV_DETERMINANT_TOLERANCE))
        fail(
          'Every UV triangle must have positive determinant > 1e-14 after normalization; flipped or globally reversed charts must be corrected in the OBJ.'
        );
      let corrected = faceArea - areaCorrection,
        next = area + corrected;
      areaCorrection = next - area - corrected;
      area = next;
      corrected = det / 2 - uvCorrection;
      next = uvArea + corrected;
      uvCorrection = next - uvArea - corrected;
      uvArea = next;
      const du: Vec3 = ab.map(
        (v, k) => (v * (q[2][1] - q[0][1]) - ac[k] * (q[1][1] - q[0][1])) / det
      ) as Vec3;
      const dv: Vec3 = ac.map(
        (v, k) => (v * (q[1][0] - q[0][0]) - ab[k] * (q[2][0] - q[0][0])) / det
      ) as Vec3;
      const aa = dot(du, du),
        bb = dot(du, dv),
        cc = dot(dv, dv);
      const high = Math.sqrt((aa + cc + Math.hypot(aa - cc, 2 * bb)) / 2);
      const low = norm(cross(du, dv)) / high;
      if (!(low > 0) || !Number.isFinite(high / low))
        fail('Chart derivatives are numerically singular.');
      minScaleM = Math.min(minScaleM, low);
      maxScaleM = Math.max(maxScaleM, high);
      maxCondition = Math.max(maxCondition, high / low);
      uvBoxes.push(box(q.map(([u, v]) => [u, v, 0])));
      worldBoxes.push(box(p));
      for (let j = 0; j < 3; j++) {
        const v = ids[j],
          next = ids[(j + 1) % 3],
          other = ids[(j + 2) % 3];
        used.add(v);
        parent[find(v)] = find(next);
        links[v].push([next, other]);
        const key = v < next ? `${v},${next}` : `${next},${v}`;
        const edge = edgeMap.get(key) ?? { a: v, b: next, count: 0, orientation: 0 };
        edge.count++;
        edge.orientation += v < next ? 1 : -1;
        edgeMap.set(key, edge);
      }
    }
    if (used.size !== count)
      fail('Isolated declared vertices are unsupported by the supplied chart.');
    if (new Set([...used].map(find)).size !== 1)
      fail('The supplied chart must be one connected disk.');
    const edges = [...edgeMap.values()];
    if (edges.some((e) => e.count > 2 || (e.count === 2 && e.orientation !== 0)))
      fail('The supplied chart requires manifold edges and consistent face orientation.');
    if (count - edges.length + mesh.indices.length / 3 !== 1)
      fail(
        'The supplied chart must be a disk with Euler characteristic 1; holes and closed surfaces are unsupported.'
      );
    // A manifold vertex link is exactly one path at the boundary or one cycle inside.
    for (let v = 0; v < count; v++) {
      if (v % 256 === 0) checkpoint(context);
      const adjacency = new Map<number, number[]>();
      for (const [a, b] of links[v]) {
        const aa = adjacency.get(a) ?? [];
        aa.push(b);
        adjacency.set(a, aa);
        const bb = adjacency.get(b) ?? [];
        bb.push(a);
        adjacency.set(b, bb);
      }
      let ends = 0;
      for (const neighbors of adjacency.values()) {
        if (neighbors.length === 1) ends++;
        else if (neighbors.length !== 2)
          fail('Non-manifold vertex links are unsupported by the supplied chart.');
      }
      if (ends !== 0 && ends !== 2)
        fail('Non-manifold vertex links are unsupported by the supplied chart.');
      const seen = new Set<number>(),
        todo = [adjacency.keys().next().value!];
      while (todo.length) {
        const at = todo.pop()!;
        if (seen.has(at)) continue;
        seen.add(at);
        for (const n of adjacency.get(at)!) if (!seen.has(n)) todo.push(n);
      }
      if (seen.size !== adjacency.size)
        fail('Disconnected vertex fans are unsupported by the supplied chart.');
    }
    const boundary = edges.filter((e) => e.count === 1),
      nextBoundary = new Map<number, number>();
    if (!boundary.length) fail('The chart requires one rectangular boundary loop.');
    const corners = new Set<string>();
    for (const e of boundary) {
      if (nextBoundary.has(e.a)) fail('Boundary vertices must have one outgoing boundary edge.');
      nextBoundary.set(e.a, e.b);
      const a = uv[e.a],
        b = uv[e.b];
      // Exact supplied side membership: no snapping or tolerance-based side repair.
      const side =
        a[1] === 0 && b[1] === 0
          ? b[0] > a[0]
          : a[0] === 1 && b[0] === 1
            ? b[1] > a[1]
            : a[1] === 1 && b[1] === 1
              ? b[0] < a[0]
              : a[0] === 0 && b[0] === 0
                ? b[1] < a[1]
                : false;
      if (!side)
        fail(
          'The boundary must follow the exact four rectangle sides once in positive order; no snapping is performed.'
        );
      if ((a[0] === 0 || a[0] === 1) && (a[1] === 0 || a[1] === 1)) {
        const key = a.join(',');
        if (corners.has(key))
          fail('Each UV rectangle corner must occur exactly once on the boundary.');
        corners.add(key);
      }
    }
    const visited = new Set<number>();
    let at = boundary[0].a;
    while (!visited.has(at)) {
      visited.add(at);
      const next = nextBoundary.get(at);
      if (next === undefined) fail('The boundary must be one closed loop.');
      at = next;
    }
    if (at !== boundary[0].a || visited.size !== boundary.length || corners.size !== 4)
      fail('The boundary must be one bijective rectangle loop containing all four corners.');
    if (Math.abs(uvArea - 1) > 1e-9)
      fail('Normalized UV area disagrees with rectangular coverage at tolerance 1e-9.');
    checkpoint(context);
    const uvTree = buildTree(uvBoxes, context),
      worldTree = buildTree(worldBoxes, context);
    const edgeTree = buildTree(
      edges.map((e) => box([uv[e.a], uv[e.b]].map(([u, v]) => [u, v, 0]))),
      context
    );
    result = {
      report: {
        status: 'ready',
        reason:
          'A single positively oriented rectangular OBJ chart passes the documented floating-point checks.',
        boundsMin,
        boundsMax,
        uvArea,
        minScaleM,
        maxScaleM,
        maxCondition,
        diagnostics: [
          {
            id: 'uv-rectangular-chart',
            severity: 'info',
            label: 'Supplied rectangular OBJ chart',
            message:
              'Connected oriented manifold disk; exact bijective rectangle boundary; normalized positive triangle determinants. Floating-point checks are not an exact bijectivity certificate or a global 3D self-intersection certificate.',
            method:
              'rectangular-obj-uv-v1. Independent UV bounding-box normalization; det > 1e-14; world triangle area > extent² × 1e-14 m²; UV area residual <= 1e-9. Boundary + orientation criterion: Lipman (2014), Theorem 1, arXiv:1310.0955. UV lookup uses conservative determinant forward-error bounds and maximum minimum-barycentric candidate selection; ties use face ID. rectangular-uv-edge-crossings-v2: path parallel/collinear classification uses 8ε relative cross-product bounds; crossings are ordered by projection of their actual clamped UV points. Attachment barycentrics accept errors <= 1e-8, then clamp and renormalize. Scale bounds are triangle Jacobian singular values in meters per normalized UV.',
            tolerance: UV_DETERMINANT_TOLERANCE,
            toleranceUnits: 'normalized UV²',
          },
        ],
      },
      index: { mesh, uv, edges, uvTree, worldTree, edgeTree, area },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    const reason = error instanceof Error ? error.message : 'Unsupported supplied chart.';
    result = {
      report: {
        status: 'unavailable',
        reason,
        diagnostics: [
          {
            id: 'uv-chart-unavailable',
            severity: 'info',
            label: 'Supplied chart unavailable',
            message: reason,
            method:
              'rectangular-obj-uv-v1; rejected charts remain inspection-only; no repair or automatic unwrapping.',
          },
        ],
      },
    };
  }
  if (input && typeof input === 'object') cache.set(input, result);
  return result;
}
export function checkRectangularUV(
  mesh: ImportedMeshData,
  context?: GenerationContext
): RectangularUVReport {
  // Only the small report is copied; scientific payload/index copies are prepared once.
  const r = prepare(mesh, context).report;
  return {
    ...r,
    ...(r.boundsMin ? { boundsMin: [...r.boundsMin] as Vec2 } : {}),
    ...(r.boundsMax ? { boundsMax: [...r.boundsMax] as Vec2 } : {}),
    diagnostics: r.diagnostics.map((d) => ({ ...d })),
  };
}
export function requireRectangularUV(mesh: ImportedMeshData, context?: GenerationContext): void {
  const result = prepare(mesh, context);
  if (!result.index) throw new Error(`Supplied chart unavailable: ${result.report.reason}`);
}
export function hasRectangularMapping(s: SurfaceSpec): boolean {
  return s.kind === 'mesh' && s.mapping === 'rectangular-obj-uv-v1';
}
function indexFor(s: SurfaceSpec): Index {
  if (!hasRectangularMapping(s) || !s.mesh)
    fail('Imported surfaces require a selected, verified rectangular OBJ mapping.');
  const result = prepare(s.mesh);
  if (!result.index) fail(`Supplied chart unavailable: ${result.report.reason}`);
  return result.index;
}
function requireUV(p: Vec2): void {
  if (!Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 1))
    fail('Mapped coordinates require finite UV in [0,1]².');
}
/** Conservative forward-error screen, including coordinate subtraction uncertainty. */
function determinantEstimate(a: Vec2, b: Vec2, c: Vec2): { value: number; error: number } {
  const x = b[0] - a[0],
    y = c[1] - a[1],
    z = b[1] - a[1],
    w = c[0] - a[0];
  const products = Math.abs(x * y) + Math.abs(z * w);
  const differences =
    (Math.abs(b[0]) + Math.abs(a[0])) * Math.abs(y) +
    (Math.abs(c[1]) + Math.abs(a[1])) * Math.abs(x) +
    (Math.abs(b[1]) + Math.abs(a[1])) * Math.abs(w) +
    (Math.abs(c[0]) + Math.abs(a[0])) * Math.abs(z);
  return { value: x * y - z * w, error: 8 * Number.EPSILON * (products + differences) };
}
function barycentric(index: Index, face: number, p: Vec2): { weights: Vec3; errors: Vec3 } {
  const ids = index.mesh.indices.slice(3 * face, 3 * face + 3),
    [a, b, c] = ids.map((i) => index.uv[i]);
  const denominator = determinantEstimate(a, b, c);
  const numerators = [
    determinantEstimate(p, b, c),
    determinantEstimate(a, p, c),
    determinantEstimate(a, b, p),
  ];
  const weights = numerators.map((n) => n.value / denominator.value) as Vec3;
  const errors = numerators.map(
    (n, i) =>
      (n.error + Math.abs(weights[i]) * denominator.error) /
        Math.max(denominator.value - denominator.error, denominator.value * 0.25) +
      8 * Number.EPSILON * Math.abs(weights[i])
  ) as Vec3;
  return { weights, errors };
}
function pointAt(index: Index, face: number, bary: Vec3): Vec3 {
  const out: Vec3 = [0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const id = index.mesh.indices[3 * face + j];
    for (let k = 0; k < 3; k++) out[k] += bary[j] * index.mesh.positions[3 * id + k];
  }
  return out;
}
function attachment(s: SurfaceSpec, faceId: number, bary: Vec3, uv: Vec2): SurfaceAttachment {
  return { surfaceRevision: s.revision, patch: 0, uv: [...uv], faceId, barycentric: [...bary] };
}
export function evaluateMappedSurface(
  s: SurfaceSpec,
  u: number,
  v: number
): { position: Vec3; attachment: SurfaceAttachment } {
  requireUV([u, v]);
  const index = indexFor(s),
    todo = [index.uvTree];
  let face = Infinity,
    bary: Vec3 | undefined,
    bestScore = -Infinity,
    work = 0;
  while (todo.length) {
    if (++work > MAX_QUERY_WORK) fail('Mapped UV lookup exceeded its bounded work limit.');
    const node = todo.pop()!;
    if (
      u < node.min[0] - QUERY_EPS ||
      u > node.max[0] + QUERY_EPS ||
      v < node.min[1] - QUERY_EPS ||
      v > node.max[1] + QUERY_EPS
    )
      continue;
    if (node.ids) {
      for (const id of node.ids) {
        const { weights: b, errors } = barycentric(index, id, [u, v]);
        const score = Math.min(...b);
        if (
          b.every((w, k) => w >= -errors[k] && w <= 1 + errors[k]) &&
          (score > bestScore || (score === bestScore && id < face))
        ) {
          face = id;
          bestScore = score;
          bary = b.map((w) => Math.max(0, Math.min(1, w))) as Vec3;
          const sum = bary[0] + bary[1] + bary[2];
          bary = bary.map((w) => w / sum) as Vec3;
        }
      }
    } else todo.push(node.right!, node.left!);
  }
  if (!bary) fail('Normalized UV could not be located on the accepted supplied chart.');
  return { position: pointAt(index, face, bary), attachment: attachment(s, face, bary, [u, v]) };
}
// Ericson's triangle closest-point region tests, using owned meter coordinates.
function closestBary(p: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = sub(b, a),
    ac = sub(c, a),
    ap = sub(p, a),
    d1 = dot(ab, ap),
    d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [1, 0, 0];
  const bp = sub(p, b),
    d3 = dot(ab, bp),
    d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [0, 1, 0];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [1 - v, v, 0];
  }
  const cp = sub(p, c),
    d5 = dot(ab, cp),
    d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [0, 0, 1];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [1 - w, 0, w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [0, 1 - w, w];
  }
  const denominator = 1 / (va + vb + vc),
    v = vb * denominator,
    w = vc * denominator;
  return [1 - v - w, v, w];
}
function boxDistance(p: Vec3, box: Box): number {
  let out = 0;
  for (let k = 0; k < 3; k++) {
    const d = Math.max(box.min[k] - p[k], 0, p[k] - box.max[k]);
    out += d * d;
  }
  return out;
}
function nearest(index: Index, p: Vec3): { face: number; bary: Vec3; position: Vec3 } {
  if (!finite3(p) || p.some((v) => Math.abs(v) > 1e9))
    fail('Projection requires three finite coordinates of magnitude <= 1e9 meters.');
  const todo = [index.worldTree];
  let distance = Infinity,
    face = Infinity,
    bary: Vec3 = [1, 0, 0],
    position: Vec3 = [0, 0, 0],
    work = 0;
  while (todo.length) {
    if (++work > MAX_QUERY_WORK)
      fail('Mapped closest-point lookup exceeded its bounded work limit.');
    const node = todo.pop()!;
    if (boxDistance(p, node) > distance) continue;
    if (node.ids) {
      for (const id of node.ids) {
        const points = index.mesh.indices
          .slice(3 * id, 3 * id + 3)
          .map((i) => vertex(index.mesh, i));
        const b = closestBary(p, points[0], points[1], points[2]),
          q = pointAt(index, id, b),
          delta = sub(p, q),
          d = dot(delta, delta);
        if (d < distance || (d === distance && id < face)) {
          distance = d;
          face = id;
          bary = b;
          position = q;
        }
      }
    } else {
      const left = node.left!,
        right = node.right!;
      if (boxDistance(p, left) <= boxDistance(p, right)) todo.push(right, left);
      else todo.push(left, right);
    }
  }
  return { face, bary, position };
}
export function mappedUVAtTriangle(s: SurfaceSpec, faceId: number, bary: Vec3): Vec2 {
  const index = indexFor(s);
  if (
    !Number.isSafeInteger(faceId) ||
    faceId < 0 ||
    3 * faceId >= index.mesh.indices.length ||
    !finite3(bary) ||
    bary.some((v) => v < -MAPPED_ATTACHMENT_TOLERANCE || v > 1 + MAPPED_ATTACHMENT_TOLERANCE) ||
    Math.abs(bary[0] + bary[1] + bary[2] - 1) > MAPPED_ATTACHMENT_TOLERANCE
  )
    fail(
      'Mapped triangle attachment requires a valid triangle and normalized nonnegative barycentrics.'
    );
  const normalized = bary.map((v) => Math.max(0, Math.min(1, v))) as Vec3;
  const sum = normalized[0] + normalized[1] + normalized[2];
  for (let j = 0; j < 3; j++) normalized[j] /= sum;
  const uv: Vec2 = [0, 0];
  for (let j = 0; j < 3; j++) {
    const q = index.uv[index.mesh.indices[3 * faceId + j]];
    uv[0] += normalized[j] * q[0];
    uv[1] += normalized[j] * q[1];
  }
  return uv.map((v) => Math.max(0, Math.min(1, v))) as Vec2;
}
export function projectMappedSurface(
  s: SurfaceSpec,
  p: Vec3
): { position: Vec3; attachment: SurfaceAttachment } {
  const n = nearest(indexFor(s), p),
    uv = mappedUVAtTriangle(s, n.face, n.bary);
  return { position: n.position, attachment: attachment(s, n.face, n.bary, uv) };
}
export function mappedNormal(s: SurfaceSpec, p: Vec3): Vec3 {
  const index = indexFor(s),
    face = nearest(index, p).face;
  const [a, b, c] = index.mesh.indices
    .slice(3 * face, 3 * face + 3)
    .map((id) => vertex(index.mesh, id));
  const n = cross(sub(b, a), sub(c, a)),
    length = norm(n);
  return n.map((v) => v / length) as Vec3;
}
export function mappedSurfaceArea(s: SurfaceSpec): number {
  return indexFor(s).area;
}
export function mappedResidual(s: SurfaceSpec, p: Vec3): number {
  return norm(sub(p, nearest(indexFor(s), p).position));
}
function intersectsSegmentBox(a: Vec2, b: Vec2, box: Box): boolean {
  let lo = 0,
    hi = 1;
  for (let k = 0; k < 2; k++) {
    const d = b[k] - a[k];
    if (d === 0) {
      if (a[k] < box.min[k] - QUERY_EPS || a[k] > box.max[k] + QUERY_EPS) return false;
    } else {
      const t0 = (box.min[k] - QUERY_EPS - a[k]) / d,
        t1 = (box.max[k] + QUERY_EPS - a[k]) / d;
      lo = Math.max(lo, Math.min(t0, t1));
      hi = Math.min(hi, Math.max(t0, t1));
      if (lo > hi) return false;
    }
  }
  return true;
}
/** Straight UV segment, split at every source edge; its image is PL, not a geodesic. */
export function mappedUVPath(s: SurfaceSpec, a: Vec2, b: Vec2): Vec3[] {
  requireUV(a);
  requireUV(b);
  const index = indexFor(s),
    d: Vec2 = [b[0] - a[0], b[1] - a[1]],
    crossings: { t: number; point: Vec3; edgeId: number }[] = [];
  if (d[0] === 0 && d[1] === 0) {
    const p = evaluateMappedSurface(s, ...a).position;
    return [p, [...p]];
  }
  const length = Math.hypot(...d),
    lengthSquared = d[0] * d[0] + d[1] * d[1];
  const todo = [index.edgeTree];
  let work = 0;
  function lineTolerance(uv: Vec2): number {
    return (
      8 *
      Number.EPSILON *
      length *
      (Math.hypot(...a) + Math.hypot(...uv) + Math.hypot(uv[0] - a[0], uv[1] - a[1]))
    );
  }
  function add(uv: Vec2, point: Vec3, edgeId: number): void {
    const relative: Vec2 = [uv[0] - a[0], uv[1] - a[1]];
    // Sort using the actual clamped crossing, never an ill-conditioned det ratio.
    const t = (relative[0] * d[0] + relative[1] * d[1]) / lengthSquared;
    if (t > 0 && t < 1 && Math.abs(relative[0] * d[1] - relative[1] * d[0]) <= lineTolerance(uv)) {
      crossings.push({ t, point, edgeId });
      if (crossings.length > MAX_MAPPED_PATH_SAMPLES * 2)
        fail('Mapped path exceeds the bounded crossing work limit.');
    }
  }
  while (todo.length) {
    if (++work > MAX_QUERY_WORK) fail('Mapped path exceeded its bounded edge-query work limit.');
    const node = todo.pop()!;
    if (!intersectsSegmentBox(a, b, node)) continue;
    if (node.ids)
      for (const id of node.ids) {
        const e = index.edges[id],
          c = index.uv[e.a],
          f = index.uv[e.b];
        const ex = f[0] - c[0],
          ey = f[1] - c[1],
          edgeLength = Math.hypot(ex, ey);
        const det = d[0] * ey - d[1] * ex,
          cx = c[0] - a[0],
          cy = c[1] - a[1];
        const parallelTolerance = 8 * Number.EPSILON * length * edgeLength;
        if (Math.abs(det) > parallelTolerance) {
          const u = (cx * d[1] - cy * d[0]) / det;
          if (u >= -QUERY_EPS && u <= 1 + QUERY_EPS) {
            const weight = Math.max(0, Math.min(1, u));
            const uv: Vec2 = [c[0] + weight * ex, c[1] + weight * ey];
            const p = vertex(index.mesh, e.a),
              q = vertex(index.mesh, e.b);
            add(uv, p.map((v, k) => v + weight * (q[k] - v)) as Vec3, id);
          }
        } else if (Math.abs(cx * d[1] - cy * d[0]) <= lineTolerance(c)) {
          add(c, vertex(index.mesh, e.a), id);
          add(f, vertex(index.mesh, e.b), id);
        }
      }
    else todo.push(node.right!, node.left!);
  }
  crossings.sort((x, y) => x.t - y.t || x.edgeId - y.edgeId);
  // Distinct crossings remain distinct even arbitrarily close to a source vertex.
  const unique = crossings.filter((crossing, i) => i === 0 || crossing.t !== crossings[i - 1].t);
  if (unique.length + 2 > MAX_MAPPED_PATH_SAMPLES)
    fail('Mapped path exceeds the bounded sample count.');
  // Edge interpolation is the exact PL image at a crossing. It avoids a triangle
  // lookup per crossing, so this path routine never nests full triangle/edge scans.
  return [
    evaluateMappedSurface(s, ...a).position,
    ...unique.map((c) => c.point),
    evaluateMappedSurface(s, ...b).position,
  ];
}
/** Display coordinates only when the selected mapping has passed validation. */
export function mappedDisplayUVs(s: SurfaceSpec): number[] {
  return indexFor(s).uv.flat();
}
