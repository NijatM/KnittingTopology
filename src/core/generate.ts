import type {
  CoarsePatch,
  GenerationContext,
  GenerationInput,
  GenerationResult,
  GraphCell,
  PatternGraph,
  Provenance,
  SurfaceSpec,
  Vec3,
} from './types';
import { add, areaVector, clamp, cross, dot, lerp, mean, mul, norm, sub, unit } from './math';
import { analyzeGraph, polygonArea } from './diagnostics';
import { evaluateSurface, projectToSurface, surfaceNormal, validateSurface } from './surfaces';
import { assemble, edgeKey, insetGraph, MeshBuilder, transformGraph } from './topology';

import {
  MAX_BASE_CELLS,
  MAX_GRAPH_NODES,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_CELLS,
  MAX_PATCH_SIDE_COUNT,
} from './limits';
import { coarseCellCounts, extractCoarseStrips } from './strips';

export const ALGORITHM_VERSION = '1.0.0';
const SOURCES = [
  'Takayama, Panozzo & Sorkine-Hornung (2014), Pattern-Based Quadrangulation for N-Sided Patches, Computer Graphics Forum 33(5), doi:10.1111/cgf.12443.',
  'Oval et al. (2018), Topology Finding of Structural Patterns, Advances in Architectural Geometry, https://hal.science/hal-01883505.',
];
function checkpoint(context: GenerationContext | undefined, fraction: number, stage: string) {
  if (context?.cancelled?.()) {
    const e = new Error('Generation cancelled.');
    e.name = 'AbortError';
    throw e;
  }
  context?.progress?.(fraction, stage);
}
export function supportedPatchTemplate(
  sides: number,
  counts: number[],
  variant = 0
): string | null {
  if (
    !Number.isInteger(sides) ||
    sides < 3 ||
    sides > 6 ||
    counts.length !== sides ||
    counts.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PATCH_SIDE_COUNT) ||
    !Number.isInteger(variant) ||
    variant < 0 ||
    variant > 1
  )
    return null;
  if (
    sides === 3 &&
    counts.length === 3 &&
    counts.filter((n) => n === 2).length === 1 &&
    counts.filter((n) => n === 1).length === 2
  )
    return 'triangle-single-quad-211';
  if (
    sides === 4 &&
    variant === 0 &&
    counts.length === 4 &&
    counts[0] === counts[2] &&
    counts[1] === counts[3]
  )
    return 'opposite-equal-rectangle';
  if (
    sides >= 3 &&
    sides <= 6 &&
    counts.length === sides &&
    counts.every((n, i, a) => n % 2 === 0 && n === a[(i + 2) % a.length])
  )
    return 'compatible-even-central-fan';
  return null;
}
export function validateGenerationInput(input: GenerationInput) {
  if (!input || !input.parameters || !Array.isArray(input.guides))
    throw new Error('Generation requires a surface, parameters and guide array.');
  validateSurface(input.surface);
  const p = input.parameters;
  if (
    !['patch-grid', 'n-sided-patch'].includes(p.strategy) ||
    !['regular', 'inset', 'alternating', 'radial'].includes(p.preset) ||
    !['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'].includes(p.family)
  )
    throw new Error('Unsupported strategy, topology preset or pattern family.');
  if (!Number.isFinite(p.spacing) || p.spacing <= 0 || p.spacing > input.surface.size * 10)
    throw new Error('Target spacing must be positive and at most ten times the surface size.');
  if (!Number.isFinite(p.orientation) || Math.abs(p.orientation) > 3600)
    throw new Error('Orientation must be finite and within ±3600 degrees.');
  if (
    !Number.isFinite(p.guideStrength) ||
    p.guideStrength < 0 ||
    p.guideStrength > 1 ||
    !Number.isFinite(p.relaxation) ||
    p.relaxation < 0 ||
    p.relaxation > 1
  )
    throw new Error('Guide strength and relaxation must be between 0 and 1.');
  if (
    !Number.isSafeInteger(p.seed) ||
    !Number.isInteger(p.variant) ||
    p.variant < 0 ||
    p.variant > 1
  )
    throw new Error('Seed must be a safe integer and template variant must be 0 or 1.');
  if (
    !Number.isInteger(p.patchSides) ||
    p.patchSides < 2 ||
    p.patchSides > 6 ||
    !Array.isArray(p.boundaryCounts) ||
    p.boundaryCounts.length !== p.patchSides ||
    p.boundaryCounts.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PATCH_SIDE_COUNT)
  )
    throw new Error(
      'Patch side count must be 2–6 and each side needs an integer boundary count from 1 to 64.'
    );
  if (input.guides.length > 1000 || input.guides.reduce((n, g) => n + g.samples.length, 0) > 100000)
    throw new Error('Guide data exceeds the bounded generation limit.');
  for (const g of input.guides) {
    if (
      !Array.isArray(g.samples) ||
      !Number.isFinite(g.strength) ||
      g.strength < 0 ||
      g.strength > 1 ||
      g.samples.some(
        (s) =>
          !s.attachment ||
          s.attachment.surfaceRevision !== input.surface.revision ||
          !Array.isArray(s.position) ||
          s.position.length !== 3 ||
          s.position.some((x) => !Number.isFinite(x))
      )
    )
      throw new Error(
        'Guides require finite positions, normalized strength and the current surface revision.'
      );
    for (const sample of g.samples) {
      const a = sample.attachment;
      if (!Array.isArray(a.uv) || a.uv.length !== 2)
        throw new Error('Guide samples require analytic UV attachments.');
      const evaluated = evaluateSurface(input.surface, a.patch, ...a.uv);
      if (norm(sub(sample.position, evaluated)) > input.surface.size * 1e-8)
        throw new Error('Guide position must match its analytic surface attachment.');
    }
  }
  if (p.strategy === 'n-sided-patch') {
    if (input.surface.kind !== 'plane')
      throw new Error('The documented N-sided patch subset currently supports the plane only.');
    if (!Number.isInteger(p.patchSides) || p.patchSides < 3 || p.patchSides > 6)
      throw new Error(
        'Supported N-sided templates have 3–6 sides; the 2-sided lens template is not implemented.'
      );
    if (
      !Array.isArray(p.boundaryCounts) ||
      p.boundaryCounts.length !== p.patchSides ||
      p.boundaryCounts.some((n) => !Number.isInteger(n) || n < 1 || n > MAX_PATCH_SIDE_COUNT)
    )
      throw new Error('Each patch side requires an integer boundary edge count from 1 to 64.');
    if (p.boundaryCounts.reduce((a, b) => a + b, 0) % 2)
      throw new Error('A quadrangulated disk requires an even total boundary count.');
    if (Object.keys(p.stripOverrides ?? {}).length)
      throw new Error(
        'N-sided boundary counts are hard constraints; clear strip overrides for this strategy.'
      );
    if (!supportedPatchTemplate(p.patchSides, p.boundaryCounts, p.variant))
      throw new Error(
        'Unsupported side-count combination: triangular single-quad template supports permutations of (2,1,1); rectangular template needs opposite equal counts; central-fan templates need even counts with count[i] = count[i+2]. Even total alone is necessary but not sufficient for this implemented subset.'
      );
  }
}
function provenance(input: GenerationInput): Provenance {
  return {
    algorithm: 'Independent bounded patch-template quadrangulation and Conway-style graph mapping',
    version: ALGORITHM_VERSION,
    sources: SOURCES,
    scope:
      'Implemented subset: triangular single-quad (2,1,1) kernel; opposite-equal rectangular integer grid; 3–6-sided central-fan quads with compatible even side counts; coarse inset/ring/checkerboard templates. Cube/sphere cubical atlases, soft guides and closed-surface graph transformations are engineering extensions; cube dual/ambo are feature-conforming per-chart clipped operators, while sphere operators are global. Not a full reproduction of either paper; no uniform-spacing or mechanical claims.',
    parameters: structuredClone(input.parameters),
    surfaceRevision: input.surface.revision,
    seed: input.parameters.seed,
    notes: [
      'Units: meters; analytic chart UV in [0,1]²; right-handed Z-up.',
      'Density uses explicit opposite-edge coarse strip equivalence classes with rounded mean embedded edge length / requested spacing; target spacing is measured, not guaranteed.',
      'Orientation is a soft background tangent cross-field; nearest guide tangents blend as a sign-invariant 4-RoSy field. Projected edge corrections retain edge length in their target, pin boundaries/creases/seams and backtrack inverted faces. Optional Laplacian relaxation follows.',
      'Seed is recorded for reproducibility; these deterministic templates do not use random perturbations.',
      'N-sided boundary counts are hard constraints and override target spacing; preset selection applies to patch-grid mode only.',
      'Open-surface dual cells are clipped using boundary-edge midpoints and the original boundary vertex; ambo uses positive corner triangle fans from retained original boundary vertices in clipped boundary regions; gyro retains and splits original boundary edges at thirds.',
      'Diagonal is this project’s connected single-diagonal polygon-fan triangulation retaining original edges, rather than the two-component crossing-diagonal network.',
      'Sphere uses radial normalized-cube charts, not an equal-area or equi-angular map. Saddles are an optional analytic project extension.',
    ],
  };
}
function regularCoarse(s: SurfaceSpec, p: Provenance, twoByTwo = false): PatternGraph {
  const b = new MeshBuilder(s, 'coarse:'),
    n = twoByTwo ? 2 : 1;
  for (let patch = 0; patch < (s.kind === 'sphere' || s.kind === 'cube' ? 6 : 1); patch++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        b.cell(
          [
            [i / n, j / n],
            [(i + 1) / n, j / n],
            [(i + 1) / n, (j + 1) / n],
            [i / n, (j + 1) / n],
          ].map(([u, v]) => b.node(evaluateSurface(s, patch, u!, v!), patch)),
          patch
        );
  return assemble(s, b.nodes, b.cells, p);
}
function templateCoarse(
  input: GenerationInput,
  p: Provenance
): { graph: PatternGraph; counts?: [number, number][] } {
  const s = input.surface,
    params = input.parameters;
  if (params.strategy === 'patch-grid') {
    let graph = regularCoarse(s, p, params.preset === 'alternating');
    if (params.preset === 'inset') graph = insetGraph(s, graph, () => true);
    else if (params.preset === 'alternating')
      graph = insetGraph(s, graph, (_, i) => i % 4 === 0 || i % 4 === 3);
    else if (params.preset === 'radial') {
      graph = insetGraph(s, graph, () => true);
      graph = insetGraph(s, graph, (_, i) => i % 5 === 0);
    }
    return { graph };
  }
  const n = params.patchSides,
    counts = params.boundaryCounts;
  if (n === 4 && params.variant === 0 && counts[0] === counts[2] && counts[1] === counts[3])
    return { graph: regularCoarse(s, p), counts: [[counts[0]!, counts[1]!]] };
  const b = new MeshBuilder(s, 'fan:'),
    corners = Array.from({ length: n }, (_, i): Vec3 => [
      s.size * 0.48 * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
      s.size * 0.48 * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
      0,
    ]);
  if (supportedPatchTemplate(n, counts, params.variant) === 'triangle-single-quad-211') {
    const side = counts.indexOf(2),
      ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push(b.node(corners[i]!));
      if (i === side) ids.push(b.node(lerp(corners[i]!, corners[(i + 1) % 3]!, 0.5)));
    }
    b.cell(ids, 0);
    return { graph: assemble(s, b.nodes, b.cells, p), counts: [[1, 1]] };
  }
  for (let i = 0; i < n; i++)
    b.cell(
      [
        b.node(corners[i]!),
        b.node(lerp(corners[i]!, corners[(i + 1) % n]!, 0.5)),
        b.node([0, 0, 0]),
        b.node(lerp(corners[(i + n - 1) % n]!, corners[i]!, 0.5)),
      ],
      0
    );
  return {
    graph: assemble(s, b.nodes, b.cells, p),
    counts: counts.map((x, i) => [x / 2, counts[(i + n - 1) % n]! / 2]),
  };
}
function subdivide(
  s: SurfaceSpec,
  g: PatternGraph,
  counts: [number, number][],
  context?: GenerationContext
): PatternGraph {
  const b = new MeshBuilder(s, 'v:'),
    nodes = new Map(g.nodes.map((n) => [n.id, n]));
  let total = 0;
  for (const [a, c] of counts) total += a * c;
  if (total > MAX_BASE_CELLS)
    throw new Error(
      `Requested density would create ${total} base cells; the interactive limit is ${MAX_BASE_CELLS}. Increase spacing or reduce side counts.`
    );
  for (let k = 0; k < g.cells.length; k++) {
    checkpoint(context, 0.12 + (0.38 * k) / g.cells.length, 'Densifying compatible quad strips');
    const c = g.cells[k]!,
      p = c.nodes.map((n) => nodes.get(n)!.position),
      [nu, nv] = counts[k]!,
      ids: string[][] = [];
    if (c.nodes.length !== 4) throw new Error('Only quadrilateral coarse cells can be densified.');
    for (let j = 0; j <= nv; j++) {
      const row: string[] = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu,
          v = j / nv;
        let pos = lerp(lerp(p[0]!, p[1]!, u), lerp(p[3]!, p[2]!, u), v),
          identity: string | undefined;
        const corner =
          i === 0 && j === 0
            ? 0
            : i === nu && j === 0
              ? 1
              : i === nu && j === nv
                ? 2
                : i === 0 && j === nv
                  ? 3
                  : -1;
        if (corner >= 0) {
          identity = `coarse-node:${c.nodes[corner]}`;
          pos = p[corner]!;
        } else if (i === 0 || i === nu || j === 0 || j === nv) {
          const ends =
              j === 0
                ? [0, 1, i, nu]
                : i === nu
                  ? [1, 2, j, nv]
                  : j === nv
                    ? [3, 2, i, nu]
                    : [0, 3, j, nv],
            a = c.nodes[ends[0]!]!,
            z = c.nodes[ends[1]!]!,
            count = ends[3]!,
            index = a < z ? ends[2]! : count - ends[2]!;
          identity = `coarse-edge:${edgeKey(a, z)}:${index}/${count}`;
          pos = lerp(
            nodes.get(a < z ? a : z)!.position,
            nodes.get(a < z ? z : a)!.position,
            index / count
          );
        }
        row.push(b.node(pos, c.patch, undefined, identity));
      }
      ids.push(row);
    }
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++)
        b.cell([ids[j]![i]!, ids[j]![i + 1]!, ids[j + 1]![i + 1]!, ids[j + 1]![i]!], c.patch, c.id);
  }
  return assemble(s, b.nodes, b.cells, g.provenance, g.coarsePatches, g.coarseTopology);
}
function pinned(g: PatternGraph): Set<string> {
  const fixed = new Set(
    g.nodes
      .filter((n) => n.feature === 'crease' || n.feature === 'corner' || n.feature === 'boundary')
      .map((n) => n.id)
  );
  for (const e of g.edges)
    if (e.cells.length === 1) {
      fixed.add(e.a);
      fixed.add(e.b);
    }
  return fixed;
}
interface Segment {
  a: Vec3;
  b: Vec3;
  strength: number;
  patch: number;
}
function guideSegments(input: GenerationInput): Segment[] {
  const a: Segment[] = [];
  for (const g of input.guides)
    for (let i = 1; i < g.samples.length; i++)
      if (
        g.samples[i]!.attachment.patch === g.samples[i - 1]!.attachment.patch &&
        norm(sub(g.samples[i]!.position, g.samples[i - 1]!.position)) > input.surface.size * 1e-10
      )
        a.push({
          a: g.samples[i - 1]!.position,
          b: g.samples[i]!.position,
          strength: g.strength,
          patch: g.samples[i]!.attachment.patch,
        });
  return a;
}
function nearest(
  p: Vec3,
  segs: Segment[],
  patch: number
): { point: Vec3; tangent: Vec3; distance: number; strength: number } | undefined {
  let best: ReturnType<typeof nearest>;
  for (const s of segs) {
    if (s.patch !== patch) continue;
    const v = sub(s.b, s.a),
      t = clamp(dot(sub(p, s.a), v) / dot(v, v), 0, 1),
      q = lerp(s.a, s.b, t),
      distance = norm(sub(p, q));
    if (!best || distance < best.distance)
      best = { point: q, tangent: mul(v, 1 / norm(v)), distance, strength: s.strength };
  }
  return best;
}
function tangentVector(v: Vec3, normal: Vec3): Vec3 {
  return sub(v, mul(normal, dot(v, normal)));
}
function alignment(g: PatternGraph, segs: Segment[], surface: SurfaceSpec): number | undefined {
  if (!segs.length) return undefined;
  const map = new Map(g.nodes.map((n) => [n.id, n.position])),
    patches = new Map(g.cells.map((c) => [c.id, c.patch]));
  let sum = 0,
    count = 0;
  const stride = Math.max(1, Math.ceil(g.edges.length / 4000));
  for (let i = 0; i < g.edges.length; i += stride) {
    const e = g.edges[i]!,
      a = map.get(e.a)!,
      b = map.get(e.b)!,
      middle = projectToSurface(surface, lerp(a, b, 0.5), patches.get(e.cells[0]!)),
      normal = surfaceNormal(surface, middle.position, middle.attachment.patch),
      v = tangentVector(sub(b, a), normal),
      near = nearest(middle.position, segs, middle.attachment.patch);
    if (near && near.distance < surface.size * 0.25 && norm(v) > 1e-14) {
      const t = tangentVector(near.tangent, normal);
      if (norm(t) > 1e-12) {
        const angle = Math.acos(clamp(Math.abs(dot(unit(v), unit(t))), 0, 1));
        sum += (Math.min(angle, Math.PI / 2 - angle) * 180) / Math.PI;
        count++;
      }
    }
  }
  return count ? sum / count : undefined;
}
function validEmbedding(s: SurfaceSpec, nodes: PatternGraph['nodes'], cells: GraphCell[]): boolean {
  const map = new Map(nodes.map((n) => [n.id, n.position])),
    tol = s.size * s.size * 1e-13;
  for (const c of cells) {
    const ps = c.nodes.map((id) => map.get(id)!),
      av = areaVector(ps),
      normal = surfaceNormal(s, mean(ps), c.patch);
    if (dot(av, normal) <= tol) return false;
    if (
      ps.length === 4 &&
      ps.some(
        (p, i) => dot(cross(sub(ps[(i + 1) % 4]!, p), sub(ps[(i + 3) % 4]!, p)), normal) <= tol
      )
    )
      return false;
  }
  return true;
}
/** Bounded sign-invariant 4-RoSy field fitting. Every edge rotates toward the nearer guide tangent or its tangent-plane perpendicular, retaining its current length in the correction target. */
function shapeGeometry(
  input: GenerationInput,
  g: PatternGraph,
  context?: GenerationContext
): { graph: PatternGraph; before?: number; after?: number; maxMove: number } {
  const s = input.surface,
    params = input.parameters,
    fixed = pinned(g),
    segs = guideSegments(input),
    dropped = input.guides.reduce(
      (sum, stroke) =>
        sum +
        stroke.samples
          .slice(1)
          .filter((sample, i) => sample.attachment.patch !== stroke.samples[i]!.attachment.patch)
          .length,
      0
    ),
    before = alignment(g, segs, s),
    original = new Map(g.nodes.map((n) => [n.id, n.position]));
  if (dropped)
    g.provenance.notes.push(
      `Dropped ${dropped} cross-chart guide segment(s); strokes are split at atlas seams and no tangent is transferred across a cube crease.`
    );
  // Atlas seam identities remain explicit; no interpolation across incompatible chart frames.
  for (const e of g.edges)
    if (e.feature === 'seam') {
      fixed.add(e.a);
      fixed.add(e.b);
    }
  if (segs.length * g.edges.length > 15000000)
    throw new Error(
      'Guide influence workload exceeds the interactive limit; simplify guides or increase spacing.'
    );
  let nodes = g.nodes.map((n) => ({ ...n }));
  const byId = new Map(nodes.map((n) => [n.id, n])),
    patches = new Map(g.cells.map((c) => [c.id, c.patch]));
  const fields = g.edges.map((e) => {
    const a = byId.get(e.a)!.position,
      b = byId.get(e.b)!.position,
      mid = projectToSurface(s, lerp(a, b, 0.5), patches.get(e.cells[0]!)),
      normal = surfaceNormal(s, mid.position, mid.attachment.patch),
      [u, v] = mid.attachment.uv;
    const lo = Math.max(0, u - 1e-5),
      hi = Math.min(1, u + 1e-5),
      basis = unit(
        tangentVector(
          sub(
            evaluateSurface(s, mid.attachment.patch, hi, v),
            evaluateSurface(s, mid.attachment.patch, lo, v)
          ),
          normal
        )
      ),
      other = cross(normal, basis),
      near = nearest(mid.position, segs, mid.attachment.patch);
    let angle = (params.orientation * Math.PI) / 180;
    if (near && params.guideStrength > 0 && norm(tangentVector(near.tangent, normal)) > 1e-12) {
      const projectedNorm = norm(tangentVector(near.tangent, normal)),
        t = unit(tangentVector(near.tangent, normal)),
        theta = Math.atan2(dot(t, other), dot(t, basis)),
        weight =
          params.guideStrength *
          near.strength *
          projectedNorm *
          Math.exp(-((near.distance / (s.size * 0.3)) ** 2));
      angle =
        Math.atan2(
          (1 - weight) * Math.sin(4 * angle) + weight * Math.sin(4 * theta),
          (1 - weight) * Math.cos(4 * angle) + weight * Math.cos(4 * theta)
        ) / 4;
    }
    return {
      direction: add(mul(basis, Math.cos(angle)), mul(other, Math.sin(angle))),
      patch: mid.attachment.patch,
    };
  });
  let accepted = 0,
    rejected = 0;
  const iterations = nodes.some((n) => !fixed.has(n.id)) ? 48 : 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (iteration % 4 === 0)
      checkpoint(
        context,
        0.53 + (0.18 * iteration) / iterations,
        'Fitting tangent cross-field with inversion checks'
      );
    const lookup = new Map(nodes.map((n) => [n.id, n])),
      corrections = new Map(nodes.map((n) => [n.id, { delta: [0, 0, 0] as Vec3, count: 0 }]));
    g.edges.forEach((e, index) => {
      const a = lookup.get(e.a)!.position,
        b = lookup.get(e.b)!.position,
        mid = projectToSurface(s, lerp(a, b, 0.5), fields[index]!.patch),
        normal = surfaceNormal(s, mid.position, mid.attachment.patch),
        edge = tangentVector(sub(b, a), normal),
        length = norm(edge);
      if (length < 1e-14) return;
      const t = unit(tangentVector(fields[index]!.direction, normal)),
        perp = cross(normal, t),
        target = Math.abs(dot(edge, t)) >= Math.abs(dot(edge, perp)) ? t : perp,
        oriented = mul(target, dot(edge, target) < 0 ? -length : length),
        delta = mul(sub(oriented, edge), 0.5);
      const ca = corrections.get(e.a)!,
        cb = corrections.get(e.b)!;
      ca.delta = sub(ca.delta, delta);
      cb.delta = add(cb.delta, delta);
      ca.count++;
      cb.count++;
    });
    let step = 0.8,
      installed = false;
    // Distinguishing check: only positive, nondegenerate quad corner Jacobians are accepted. Bounded backtracking is numerical line search, not silent invalid installation.
    for (let search = 0; search < 8; search++) {
      const candidate = nodes.map((n) => {
        if (fixed.has(n.id)) return n;
        const c = corrections.get(n.id)!;
        return {
          ...n,
          ...projectToSurface(
            s,
            add(n.position, mul(c.delta, step / Math.max(1, c.count))),
            n.attachment.patch
          ),
        };
      });
      if (validEmbedding(s, candidate, g.cells)) {
        nodes = candidate;
        installed = true;
        accepted++;
        break;
      }
      step *= 0.5;
    }
    if (!installed) {
      rejected++;
      break;
    }
  }
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of g.edges) {
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
  }
  const smoothIterations = Math.round(params.relaxation * 8);
  for (let k = 0; k < smoothIterations; k++) {
    checkpoint(
      context,
      0.72 + (0.03 * k) / Math.max(1, smoothIterations),
      'Relaxing free interior vertices'
    );
    const lookup = new Map(nodes.map((n) => [n.id, n]));
    const candidate = nodes.map((n) =>
      fixed.has(n.id)
        ? n
        : {
            ...n,
            ...projectToSurface(
              s,
              lerp(n.position, mean(adj.get(n.id)!.map((id) => lookup.get(id)!.position)), 0.18),
              n.attachment.patch
            ),
          }
    );
    if (validEmbedding(s, candidate, g.cells)) nodes = candidate;
  }
  g.provenance.notes.push(
    `Cross-field fitting: ${accepted}/${iterations} accepted iterations, ${rejected} blocked iteration(s); up to eight step halvings per iteration; pinned boundary, cube features and atlas seams.`
  );
  const result = assemble(s, nodes, g.cells, g.provenance, g.coarsePatches, g.coarseTopology),
    after = alignment(result, segs, s),
    maxMove = nodes.reduce((a, n) => Math.max(a, norm(sub(n.position, original.get(n.id)!))), 0);
  return { graph: result, before, after, maxMove };
}
export function generatePattern(
  input: GenerationInput,
  context?: GenerationContext
): GenerationResult {
  checkpoint(context, 0, 'Checking inputs');
  validateGenerationInput(input);
  const p = provenance(input),
    s = input.surface;
  const template = templateCoarse(input, p),
    base = template.graph,
    nodeMap = new Map(base.nodes.map((n) => [n.id, n.position]));
  const coarse: CoarsePatch[] = base.cells.map((c) => ({
    id: c.id,
    corners: c.nodes.map((id) => nodeMap.get(id)!),
    patch: c.patch,
    subdivisions: [],
    template:
      input.parameters.strategy === 'n-sided-patch'
        ? input.parameters.patchSides === 4 && input.parameters.variant === 0
          ? 'opposite-equal-rectangle'
          : 'compatible-even-central-fan'
        : `coarse-${input.parameters.preset}`,
  }));
  base.coarseTopology = extractCoarseStrips(
    s,
    base,
    input.parameters.strategy === 'n-sided-patch' ? s.size : input.parameters.spacing,
    input.parameters.strategy === 'patch-grid' ? input.parameters.stripOverrides : undefined
  );
  const counts = template.counts ?? coarseCellCounts(base.coarseTopology);
  if (template.counts) {
    const assigned = new Map<string, number>(),
      edgeIds = new Map(base.edges.map((e) => [edgeKey(e.a, e.b), e.id]));
    base.cells.forEach((c, i) =>
      c.nodes.forEach((a, j) => {
        const b = c.nodes[(j + 1) % 4]!,
          id = edgeIds.get(edgeKey(a, b))!;
        const value = counts[i]![j % 2]!;
        if (assigned.has(id) && assigned.get(id) !== value)
          throw new Error('Template strip subdivision mismatch.');
        assigned.set(id, value);
      })
    );
    for (const strip of base.coarseTopology.strips) {
      const values = strip.edgeIds.map((id) => assigned.get(id)!);
      if (!values.every((v) => v === values[0]))
        throw new Error('Template opposite-edge strip incompatibility.');
      strip.subdivisions = values[0]!;
    }
  }
  coarse.forEach((c, i) => {
    c.subdivisions = [counts[i]![0], counts[i]![1], counts[i]![0], counts[i]![1]];
    c.template =
      input.parameters.strategy === 'n-sided-patch'
        ? supportedPatchTemplate(
            input.parameters.patchSides,
            input.parameters.boundaryCounts,
            input.parameters.variant
          )!
        : c.template;
  });
  base.coarsePatches = coarse;
  let graph = subdivide(s, base, counts, context);
  const shaped = shapeGeometry(input, graph, context);
  graph = shaped.graph;
  checkpoint(context, 0.76, 'Applying graph pattern transformation');
  graph = transformGraph(s, graph, input.parameters.family);
  if (
    graph.nodes.length > MAX_GRAPH_NODES ||
    graph.edges.length > MAX_GRAPH_EDGES ||
    graph.cells.length > MAX_GRAPH_CELLS
  )
    throw new Error('Transformed graph exceeds the shared project graph limits; increase spacing.');
  checkpoint(context, 0.88, 'Checking incidence, orientation and surface membership');
  const result = analyzeGraph(graph, s, input.parameters.spacing);
  result.diagnostics.push(
    {
      id: 'spacing',
      severity: result.statistics.spacingRmsRelative > 0.25 ? 'warning' : 'info',
      label:
        input.parameters.strategy === 'n-sided-patch'
          ? 'Edge spacing versus unused reference'
          : 'Achieved edge spacing',
      message: `Relative RMS edge-length deviation is ${(result.statistics.spacingRmsRelative * 100).toFixed(1)}%. Pattern transformations change the edge length distribution.`,
      value: result.statistics.spacingRmsRelative,
      units: 'relative RMS',
      method:
        'sqrt(mean((embedded edge length / requested spacing − 1)²)); great-circle lengths on sphere, exact piecewise-linear cube projected paths, sampled saddle paths.',
    },
    {
      id: 'support-area',
      severity: 'info',
      label: 'Support surface area',
      message:
        'Statistics surfaceArea is the full analytic support area (saddle: 128×128 midpoint integral). An N-sided patch covers only part of that support.',
      value: result.statistics.surfaceArea,
      units: 'm²',
      method: 'Plane s²; cube 6s²; sphere πs²; saddle numerical midpoint quadrature.',
    },
    {
      id: 'polygon-area',
      severity: 'info',
      label: 'Graph chord polygon area',
      message:
        'Sum of polygon area-vector magnitudes; this approximates curved embedded cells and does not certify absence of geometric crossings.',
      value: polygonArea(graph),
      units: 'm²',
      method: 'Σ |½ Σ cross(p_i,p_(i+1))|; chord vertices, no curved-face area integration.',
    },
    {
      id: 'embedding-displacement',
      severity: 'info',
      label: 'Embedding displacement',
      message:
        'Maximum node movement from tangent cross-field fitting and relaxation before pattern mapping.',
      value: shaped.maxMove,
      units: 'm',
      method:
        'Maximum Euclidean displacement of free nodes; boundaries, cube creases and sphere atlas seams fixed.',
    },
    {
      id: 'paper-scope',
      severity: 'info',
      label: 'Implemented paper subset',
      message: p.scope,
      method:
        'Independent integer-template construction; citations and exact restrictions retained in graph provenance.',
    }
  );
  const droppedGuideSegments = input.guides.reduce(
    (sum, stroke) =>
      sum +
      stroke.samples
        .slice(1)
        .filter((sample, i) => sample.attachment.patch !== stroke.samples[i]!.attachment.patch)
        .length,
    0
  );
  if (droppedGuideSegments)
    result.diagnostics.push({
      id: 'guide-segments',
      severity: 'warning',
      label: 'Guide chart splitting',
      message: `Dropped ${droppedGuideSegments} cross-chart segment(s); only same-chart guide tangents influence a chart, and near-zero projected tangents are ignored.`,
      value: droppedGuideSegments,
      method:
        'Count successive samples with different analytic patch IDs; no cross-crease tangent transport is assumed.',
    });
  if (shaped.before !== undefined && shaped.after !== undefined)
    result.diagnostics.push({
      id: 'guide-alignment',
      severity: 'info',
      label: 'Guide alignment measurement',
      message: `Mean tangent cross-field error near guides: ${shaped.before.toFixed(2)}° before, ${shaped.after.toFixed(2)}° after embedding. Tangent or perpendicular direction is chosen; improvement is measured, not guaranteed.`,
      value: shaped.after,
      units: 'degrees',
      method:
        'min(acute angle, 90° − acute angle) using 3D tangent-plane projected edge and guide vectors within 0.25 × support size; at most 4000 pre-transformation edges.',
    });
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length)
    throw new Error(
      `Generated graph failed validation: ${errors.map((d) => `${d.label}: ${d.message} ${d.entityIds?.slice(0, 3).join(',') ?? ''}`).join('; ')}`
    );
  checkpoint(context, 1, 'Validated graph ready');
  return { graph, ...result };
}
