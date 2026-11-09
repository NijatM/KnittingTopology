// Corner-fan splitting for a closed oriented sphere-topology cell complex. Project implementation.
import type { GenerationContext, KnitCutSettings, PatternGraph, SurfaceSpec } from '../core/types';
import { MAX_GRAPH_CELLS, MAX_GRAPH_EDGES, MAX_GRAPH_NODES } from '../core/limits';
import { validateSurface } from '../core/surfaces';
import { sphereDomain } from '../core/sphere-domain';
import {
  cutEdgeLength,
  type CutBoundaryStep,
  type CutBuild,
  type CutComplex,
  type CutEdge,
  type CutPlan,
  type CutSeam,
} from './cut-types';

const pair = (a: string, b: string) => (a < b ? JSON.stringify([a, b]) : JSON.stringify([b, a]));
class DSU {
  p: Uint32Array;
  constructor(n: number) {
    this.p = Uint32Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) {
      this.p[i] = this.p[this.p[i]!]!;
      i = this.p[i]!;
    }
    return i;
  }
  join(a: number, b: number) {
    a = this.find(a);
    b = this.find(b);
    if (a !== b) this.p[Math.max(a, b)] = Math.min(a, b);
  }
}
/** Freshness only: never a cryptographic or mathematical identity certificate. */
export function cutSourceSignature(surface: SurfaceSpec, graph: PatternGraph): string {
  let hash = 2166136261;
  const add = (v: unknown) => {
    const s = String(v);
    for (let i = 0; i < s.length; i++) {
      hash ^= s.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 255;
    hash = Math.imul(hash, 16777619);
  };
  add(surface.kind);
  add(surface.size);
  add(surface.curvature);
  add(surface.revision);
  if (
    surface.kind === 'sphere' &&
    ((surface.poleOpeningDiameter ?? 0) > 0 || (surface.sphereFraction ?? 1) !== 1)
  ) {
    add(surface.poleOpeningDiameter ?? 0);
    add(surface.sphereFraction ?? 1);
  }
  for (const n of graph.nodes) {
    add(n.id);
    for (const x of n.position) add(x);
    add(n.attachment.patch);
    for (const x of n.attachment.uv) add(x);
  }
  for (const e of graph.edges) {
    add(e.id);
    add(e.a);
    add(e.b);
    for (const c of e.cells) add(c);
    for (const p of e.path ?? []) for (const x of p) add(x);
  }
  for (const c of graph.cells) {
    add(c.id);
    add(c.patch);
    for (const n of c.nodes) add(n);
  }
  return `cut-source-fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
export function cutSettingsKey(s: KnitCutSettings): string {
  return JSON.stringify([s.surfaceRevision, s.sourceSignature, s.preset, [...s.edgeIds].sort()]);
}

/** Verify edge incidence, orientation, vertex links, connectivity and boundary order independently. */
export function inspectCutComplex(c: CutComplex): {
  euler: number;
  components: number;
  boundaryComponents: number;
  boundary: CutBoundaryStep[];
} {
  let scale = 0;
  for (const v of c.vertices) for (const x of v.position) scale = Math.max(scale, Math.abs(x));
  const endpointTolerance = scale * 1e-10;
  const vertices = new Map(c.vertices.map((v, i) => [v.id, i])),
    edges = new Map(c.edges.map((e) => [e.id, e])),
    faceIds = new Set(c.faces.map((f) => f.id));
  if (
    vertices.size !== c.vertices.length ||
    edges.size !== c.edges.length ||
    faceIds.size !== c.faces.length ||
    !c.faces.length
  )
    throw new Error('Cut complex contains missing or duplicate identities.');
  const dsu = new DSU(c.vertices.length),
    uses = new Map<string, CutBoundaryStep[]>(),
    links = new Map<string, Map<string, string[]>>();
  for (const f of c.faces) {
    if (
      f.vertices.length < 3 ||
      f.vertices.length !== f.edges.length ||
      new Set(f.vertices).size !== f.vertices.length
    )
      throw new Error('Cut faces must have simple ordered boundaries.');
    for (let i = 0; i < f.vertices.length; i++) {
      const a = f.vertices[i]!,
        b = f.vertices[(i + 1) % f.vertices.length]!,
        e = edges.get(f.edges[i]!);
      if (
        !vertices.has(a) ||
        !vertices.has(b) ||
        !e ||
        !((e.a === a && e.b === b) || (e.a === b && e.b === a))
      )
        throw new Error('Cut edge and face endpoints disagree.');
      dsu.join(vertices.get(a)!, vertices.get(b)!);
      const use = { edgeId: e.id, sourceEdgeId: e.sourceId, faceId: f.id, from: a, to: b };
      const list = uses.get(e.id) ?? [];
      list.push(use);
      uses.set(e.id, list);
      const at = links.get(a) ?? new Map<string, string[]>(),
        prev = f.edges[(i + f.edges.length - 1) % f.edges.length]!,
        next = f.edges[i]!;
      at.set(prev, [...(at.get(prev) ?? []), next]);
      at.set(next, [...(at.get(next) ?? []), prev]);
      links.set(a, at);
    }
  }
  const boundary: CutBoundaryStep[] = [];
  for (const e of c.edges) {
    const u = uses.get(e.id) ?? [];
    if (
      !u.length ||
      u.length > 2 ||
      e.faces.length !== u.length ||
      new Set(e.faces).size !== u.length ||
      u.some((s) => !e.faces.includes(s.faceId))
    )
      throw new Error('Cut edge incidence is not manifold.');
    if (u.length === 2 && (u[0]!.from !== u[1]!.to || u[0]!.to !== u[1]!.from))
      throw new Error('Cut face orientations disagree.');
    if (u.length === 1) boundary.push(u[0]!);
    if (e.path) {
      if (e.path.length < 2 || e.path.some((p) => p.length !== 3 || !p.every(Number.isFinite)))
        throw new Error('Cut paths must contain finite 3D samples.');
      const a = c.vertices[vertices.get(e.a)!]!.position,
        b = c.vertices[vertices.get(e.b)!]!.position;
      if (
        Math.hypot(...e.path[0]!.map((x, i) => x - a[i]!)) > endpointTolerance ||
        Math.hypot(...e.path.at(-1)!.map((x, i) => x - b[i]!)) > endpointTolerance
      )
        throw new Error(`Cut path endpoints differ from their vertices (${e.sourceId}).`);
    }
  }
  const boundaryDegree = new Map<string, number>();
  for (const s of boundary)
    for (const v of [s.from, s.to]) boundaryDegree.set(v, (boundaryDegree.get(v) ?? 0) + 1);
  for (const v of c.vertices) {
    if (v.position.length !== 3 || !v.position.every(Number.isFinite))
      throw new Error('Cut positions must be finite 3D coordinates.');
    const link = links.get(v.id);
    if (!link?.size) throw new Error('Cut complex has an isolated vertex.');
    const deg = [...link.values()].map((a) => a.length),
      ends = deg.filter((d) => d === 1).length;
    const onBoundary = boundaryDegree.has(v.id);
    if (
      deg.some((d) => d !== 1 && d !== 2) ||
      (onBoundary ? ends !== 2 || boundaryDegree.get(v.id) !== 2 : ends !== 0)
    )
      throw new Error('Cut vertex link is not a manifold fan.');
    const seen = new Set<string>(),
      queue = [link.keys().next().value!];
    for (let i = 0; i < queue.length; i++) {
      const n = queue[i]!;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const q of link.get(n) ?? []) if (!seen.has(q)) queue.push(q);
    }
    if (seen.size !== link.size) throw new Error('Cut vertex has disconnected fans.');
  }
  const outgoing = new Map<string, CutBoundaryStep>();
  for (const s of boundary) {
    if (outgoing.has(s.from)) throw new Error('Boundary is branched.');
    outgoing.set(s.from, s);
  }
  const visited = new Set<string>(),
    ordered: CutBoundaryStep[] = [];
  let loops = 0;
  for (const start of [...boundary].sort((a, b) =>
    a.edgeId < b.edgeId ? -1 : a.edgeId > b.edgeId ? 1 : 0
  )) {
    if (visited.has(start.edgeId)) continue;
    loops++;
    let s: CutBoundaryStep | undefined = start;
    do {
      if (!s || visited.has(s.edgeId)) throw new Error('Boundary does not close consistently.');
      visited.add(s.edgeId);
      ordered.push(s);
      s = outgoing.get(s.to);
    } while (s?.edgeId !== start.edgeId);
  }
  return {
    euler: c.vertices.length - c.edges.length + c.faces.length,
    components: new Set(c.vertices.map((_, i) => dsu.find(i))).size,
    boundaryComponents: loops,
    boundary: ordered,
  };
}

/** Source incidence, preserving original identities and ordered boundaries. */
export function sourceCutComplex(graph: PatternGraph): CutComplex {
  if (
    !graph.nodes.length ||
    graph.nodes.length > MAX_GRAPH_NODES ||
    graph.edges.length > MAX_GRAPH_EDGES ||
    graph.cells.length > MAX_GRAPH_CELLS
  )
    throw new Error('Cut source exceeds the graph resource bounds.');
  const nodes = new Set(graph.nodes.map((n) => n.id)),
    pairs = new Map<string, string>();
  if (
    nodes.size !== graph.nodes.length ||
    new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length
  )
    throw new Error('Source identities are duplicated.');
  for (const n of graph.nodes)
    if (n.position.length !== 3 || !n.position.every(Number.isFinite))
      throw new Error('Source positions must be finite.');
  for (const e of graph.edges) {
    const key = pair(e.a, e.b);
    if (e.a === e.b || !nodes.has(e.a) || !nodes.has(e.b) || pairs.has(key))
      throw new Error('Source edge endpoints are missing, repeated or ambiguous.');
    pairs.set(key, e.id);
  }
  return {
    vertices: graph.nodes.map((n) => ({ ...n, sourceId: n.id })),
    edges: graph.edges.map((e) => ({ ...e, sourceId: e.id, faces: e.cells })),
    faces: graph.cells.map((c) => ({
      id: c.id,
      sourceId: c.id,
      patch: c.patch,
      vertices: c.nodes,
      edges: c.nodes.map((a, i) => pairs.get(pair(a, c.nodes[(i + 1) % c.nodes.length]!)) ?? ''),
    })),
  };
}

/** A sector is already a disk; its natural meridians are not a closing seam. */
export function inspectSphereSector(
  surface: SurfaceSpec,
  graph: PatternGraph,
  context?: GenerationContext
): ReturnType<typeof inspectCutComplex> {
  validateSurface(surface);
  const d = sphereDomain(surface);
  if (!d.partial) throw new Error('Natural-sector validation requires partial angular coverage.');
  if (context?.cancelled?.()) {
    const e = new Error('Sector validation cancelled.');
    e.name = 'AbortError';
    throw e;
  }
  if (graph.provenance.surfaceRevision !== surface.revision)
    throw new Error(
      'Sphere sector network belongs to a different surface. Regenerate the network.'
    );
  const result = inspectCutComplex(sourceCutComplex(graph));
  if (result.euler !== 1 || result.components !== 1 || result.boundaryComponents !== 1)
    throw new Error('Sphere sector must be one oriented manifold disk with one natural boundary.');
  const nodes = new Map(graph.nodes.map((n) => [n.id, n.position])),
    edges = new Map(graph.edges.map((e) => [e.id, e]));
  const tol = surface.size * 1e-8;
  const onBoundary = (p: number[]) => {
    if (Math.abs(Math.hypot(...p) - d.radius) > tol || Math.abs(p[2]!) > d.zMax + tol) return false;
    if (d.opened && Math.abs(Math.abs(p[2]!) - d.zMax) <= tol) return true;
    if (Math.hypot(p[0]!, p[1]!) <= tol) return true;
    let phi = Math.atan2(p[1]!, p[0]!);
    if (phi < 0) phi += 2 * Math.PI;
    return Math.min(phi, 2 * Math.PI - phi) <= 1e-8 || Math.abs(phi - d.longitudeSpan) <= 1e-8;
  };
  for (const step of result.boundary) {
    const edge = edges.get(step.sourceEdgeId)!;
    if (!(edge.path ?? [nodes.get(edge.a)!, nodes.get(edge.b)!]).every(onBoundary))
      throw new Error('A sector boundary leaves the declared meridian or polar rim.');
  }
  return result;
}

export function buildCutDisk(
  surface: SurfaceSpec,
  graph: PatternGraph,
  settings: KnitCutSettings,
  context?: GenerationContext
): CutBuild {
  const check = () => {
    if (context?.cancelled?.()) {
      const e = new Error('Cut validation cancelled.');
      e.name = 'AbortError';
      throw e;
    }
  };
  try {
    check();
    validateSurface(surface);
    if (!['cube', 'sphere'].includes(surface.kind))
      throw new Error('Cut planning currently supports the generated cube and sphere.');
    if (
      !graph.nodes.length ||
      graph.nodes.length > MAX_GRAPH_NODES ||
      graph.edges.length > MAX_GRAPH_EDGES ||
      graph.cells.length > MAX_GRAPH_CELLS
    )
      throw new Error('Cut source exceeds the graph resource bounds.');
    if (
      graph.provenance.surfaceRevision !== surface.revision ||
      settings.surfaceRevision !== surface.revision ||
      settings.sourceSignature !== cutSourceSignature(surface, graph)
    )
      throw new Error(
        'Cut draft belongs to a different surface or network. Restore a preset or start a new draft.'
      );
    const nodes = new Map(graph.nodes.map((n, i) => [n.id, i])),
      edgeIndex = new Map(graph.edges.map((e, i) => [e.id, i]));
    if (nodes.size !== graph.nodes.length || edgeIndex.size !== graph.edges.length)
      throw new Error('Source identities are duplicated.');
    const sourceByPair = new Map<string, string>();
    for (const e of graph.edges) {
      if (e.a === e.b || !nodes.has(e.a) || !nodes.has(e.b) || sourceByPair.has(pair(e.a, e.b)))
        throw new Error('Source edge endpoints are missing, repeated or ambiguous.');
      sourceByPair.set(pair(e.a, e.b), e.id);
    }
    const source: CutComplex = {
      vertices: graph.nodes.map((n) => ({ ...n, sourceId: n.id })),
      edges: graph.edges.map((e) => ({ ...e, sourceId: e.id, faces: e.cells })),
      faces: graph.cells.map((c) => ({
        id: c.id,
        sourceId: c.id,
        patch: c.patch,
        vertices: c.nodes,
        edges: c.nodes.map(
          (a, i) => sourceByPair.get(pair(a, c.nodes[(i + 1) % c.nodes.length]!)) ?? ''
        ),
      })),
    };
    const before = inspectCutComplex(source);
    const domain = surface.kind === 'sphere' ? sphereDomain(surface) : null;
    if (domain?.partial)
      throw new Error(
        'A partial sphere sector is already open; use its natural meridian boundaries instead of a closing cut.'
      );
    const annulus = !!domain?.opened;
    if (
      before.euler !== (annulus ? 0 : 2) ||
      before.components !== 1 ||
      before.boundaryComponents !== (annulus ? 2 : 0)
    )
      throw new Error(
        annulus
          ? 'Source sphere band must be one oriented annulus with Euler characteristic 0 and two rim boundaries.'
          : 'Source must be one closed oriented manifold with Euler characteristic 2.'
      );
    if (annulus) {
      const tol = surface.size * 1e-8,
        byId = new Map(graph.nodes.map((n) => [n.id, n.position]));
      for (const e of graph.edges.filter((e) => e.cells.length === 1))
        if (
          !(e.path ?? [byId.get(e.a)!, byId.get(e.b)!]).every(
            (p) =>
              Math.abs(Math.abs(p[2]) - domain!.zMax) <= tol &&
              Math.abs(Math.hypot(...p) - domain!.radius) <= tol
          )
        )
          throw new Error('Sphere band natural boundaries must lie on the two polar rims.');
    }
    const cuts = new Set(settings.edgeIds);
    if (!cuts.size) throw new Error('Select at least one cut edge.');
    if (cuts.size !== settings.edgeIds.length || [...cuts].some((e) => !edgeIndex.has(e)))
      throw new Error('Cut edges are duplicated or missing from the source network.');
    const tree = new DSU(graph.nodes.length),
      cutVertices = new Set<string>(),
      degree = new Map<string, number>();
    for (const id of cuts) {
      const e = graph.edges[edgeIndex.get(id)!]!;
      if (e.cells.length !== 2)
        throw new Error('A natural rim boundary cannot be selected as a paired cut seam.');
      const a = nodes.get(e.a)!,
        b = nodes.get(e.b)!;
      if (tree.find(a) === tree.find(b)) throw new Error('The selected cut contains a cycle.');
      tree.join(a, b);
      for (const n of [e.a, e.b]) {
        cutVertices.add(n);
        degree.set(n, (degree.get(n) ?? 0) + 1);
      }
    }
    if (new Set([...cutVertices].map((n) => tree.find(nodes.get(n)!))).size !== 1)
      throw new Error('The selected cut is disconnected.');
    context?.progress?.(0.25, 'Splitting cut vertex fans');
    check();
    const corners: { node: string; face: string }[] = [];
    const at = new Map<string, Map<string, number>>();
    for (const f of source.faces) {
      const m = new Map<string, number>();
      for (const node of f.vertices) {
        m.set(node, corners.length);
        corners.push({ node, face: f.id });
      }
      at.set(f.id, m);
    }
    const fans = new DSU(corners.length);
    for (let i = 0; i < graph.edges.length; i++) {
      if ((i & 1023) === 0) check();
      const e = graph.edges[i]!;
      if (cuts.has(e.id) || e.cells.length !== 2) continue;
      for (const node of [e.a, e.b])
        fans.join(at.get(e.cells[0]!)!.get(node)!, at.get(e.cells[1]!)!.get(node)!);
    }
    const copies = new Map<number, string>(),
      vertices: CutComplex['vertices'] = [];
    corners.forEach((c, i) => {
      const root = fans.find(i);
      if (!copies.has(root)) {
        const n = graph.nodes[nodes.get(c.node)!]!,
          id = JSON.stringify(['cut-v', n.id, corners[root]!.face]);
        copies.set(root, id);
        vertices.push({
          id,
          sourceId: n.id,
          position: [...n.position],
          attachment: {
            ...n.attachment,
            uv: [...n.attachment.uv],
            ...(n.attachment.barycentric
              ? { barycentric: [...n.attachment.barycentric] as [number, number, number] }
              : {}),
          },
        });
      }
    });
    const vertex = (face: string, node: string) => copies.get(fans.find(at.get(face)!.get(node)!))!;
    const edges: CutEdge[] = [],
      edgeCopies = new Map<string, Map<string, string>>();
    for (const e of graph.edges) {
      const copiesByFace = new Map<string, string>();
      for (const f of cuts.has(e.id) ? e.cells : [e.cells[0]!]) {
        const id = JSON.stringify(['cut-e', e.id, cuts.has(e.id) ? f : 'joined']);
        edges.push({
          id,
          sourceId: e.id,
          a: vertex(f, e.a),
          b: vertex(f, e.b),
          faces: cuts.has(e.id) ? [f] : [...e.cells],
          ...(e.path ? { path: e.path.map((p) => [...p] as [number, number, number]) } : {}),
        });
        for (const face of cuts.has(e.id) ? [f] : e.cells) copiesByFace.set(face, id);
      }
      edgeCopies.set(e.id, copiesByFace);
    }
    const complex: CutComplex = {
      vertices,
      edges,
      faces: source.faces.map((f) => ({
        ...f,
        vertices: f.vertices.map((n) => vertex(f.id, n)),
        edges: f.edges.map((e) => edgeCopies.get(e)!.get(f.id)!),
      })),
    };
    context?.progress?.(0.75, 'Checking disk and seam reconstruction');
    check();
    const after = inspectCutComplex(complex);
    if (after.euler !== 1 || after.components !== 1 || after.boundaryComponents !== 1)
      throw new Error('Selected cut does not produce one manifold disk.');
    const boundaryByEdge = new Map(after.boundary.map((s) => [s.edgeId, s])),
      seams: CutSeam[] = [];
    const originalNodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
    let cutLengthM = 0;
    for (const id of [...cuts].sort()) {
      const e = graph.edges[edgeIndex.get(id)!]!,
        a = boundaryByEdge.get(edgeCopies.get(id)!.get(e.cells[0]!)!)!,
        b = boundaryByEdge.get(edgeCopies.get(id)!.get(e.cells[1]!)!)!;
      const lengthM = cutEdgeLength(e, originalNodes.get(e.a)!, originalNodes.get(e.b)!);
      cutLengthM += lengthM;
      seams.push({
        sourceEdgeId: id,
        lengthM,
        sides: [a, b],
        vertexPairs: [
          [vertex(e.cells[0]!, e.a), vertex(e.cells[1]!, e.a)],
          [vertex(e.cells[0]!, e.b), vertex(e.cells[1]!, e.b)],
        ],
      });
    }
    const naturalBoundaries = after.boundary.filter(
      (s) => graph.edges[edgeIndex.get(s.sourceEdgeId)!]!.cells.length === 1
    );
    if (after.boundary.length !== 2 * cuts.size + naturalBoundaries.length)
      throw new Error('Cut edge pairing does not cover the boundary exactly twice.');
    const plan: CutPlan = {
      version: 'cut-corner-fans-v1',
      settings: { ...settings, edgeIds: [...cuts].sort() },
      surface,
      provenance: graph.provenance,
      complex,
      boundary: after.boundary,
      ...(annulus ? { naturalBoundaries } : {}),
      seams,
      statistics: {
        sourceEuler: before.euler,
        euler: after.euler,
        components: after.components,
        boundaryComponents: after.boundaryComponents,
        cutVertices: cutVertices.size,
        cutEdges: cuts.size,
        branchVertices: [...degree.values()].filter((d) => d > 2).length,
        cutLengthM,
      },
      notes: [
        'The cut complex is combinatorially a disk; positions remain on the original 3D surface.',
        'Paired boundary segments may form a branched seam set. No sewing order, flat layout or closed-surface knit program is generated.',
      ],
    };
    assertSeamPairs(plan, after.boundary);
    context?.progress?.(1, 'Cut validation complete');
    return { ok: true, plan };
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    return { ok: false, reason: (cause as Error).message };
  }
}
export function assertSeamPairs(
  plan: CutPlan,
  actualBoundary: CutBoundaryStep[] = inspectCutComplex(plan.complex).boundary
): void {
  const vertices = new Map(plan.complex.vertices.map((v) => [v.id, v])),
    covered = new Set<string>();
  const positions = new Map<string, number[]>();
  const actual = new Map(actualBoundary.map((s) => [s.edgeId, s]));
  const same = (a: CutBoundaryStep, b: CutBoundaryStep) =>
    a.edgeId === b.edgeId &&
    a.sourceEdgeId === b.sourceEdgeId &&
    a.faceId === b.faceId &&
    a.from === b.from &&
    a.to === b.to;
  if (
    plan.boundary.length !== actualBoundary.length ||
    plan.boundary.some((s, i) => !same(s, actualBoundary[i]!))
  )
    throw new Error('Stored boundary does not match the cut complex.');
  const sourceCuts = new Set(plan.settings.edgeIds);
  if (
    sourceCuts.size !== plan.seams.length ||
    plan.seams.some((s) => !sourceCuts.has(s.sourceEdgeId))
  )
    throw new Error('Seam pairs do not match the cut draft.');
  for (const v of plan.complex.vertices) {
    const first = positions.get(v.sourceId);
    if (first && v.position.some((x, i) => x !== first[i]))
      throw new Error('Source vertex copies have different 3D positions.');
    positions.set(v.sourceId, v.position);
  }
  for (const seam of plan.seams) {
    const [a, b] = seam.sides;
    if (
      !actual.has(a.edgeId) ||
      !actual.has(b.edgeId) ||
      !same(a, actual.get(a.edgeId)!) ||
      !same(b, actual.get(b.edgeId)!)
    )
      throw new Error('Seam side differs from its actual boundary edge.');
    if (
      a.sourceEdgeId !== seam.sourceEdgeId ||
      b.sourceEdgeId !== seam.sourceEdgeId ||
      a.edgeId === b.edgeId ||
      covered.has(a.edgeId) ||
      covered.has(b.edgeId)
    )
      throw new Error('Seam sides are missing, repeated or mismatched.');
    if (
      vertices.get(a.from)?.sourceId !== vertices.get(b.to)?.sourceId ||
      vertices.get(a.to)?.sourceId !== vertices.get(b.from)?.sourceId
    )
      throw new Error('Seam boundary directions are inconsistent.');
    const left = new Set([a.from, a.to]),
      right = new Set([b.from, b.to]);
    for (const [u, v] of seam.vertexPairs) {
      if (
        !vertices.has(u) ||
        !vertices.has(v) ||
        vertices.get(u)!.sourceId !== vertices.get(v)!.sourceId
      )
        throw new Error('Seam endpoint copies do not match their source.');
      if (!left.delete(u) || !right.delete(v))
        throw new Error('Seam endpoint pairs do not cover both sides exactly.');
    }
    if (left.size || right.size)
      throw new Error('Seam endpoint pairs do not cover both sides exactly.');
    covered.add(a.edgeId);
    covered.add(b.edgeId);
  }
  const natural = plan.naturalBoundaries ?? [];
  if (natural.length) {
    const d = sphereDomain(plan.surface),
      tol = plan.surface.size * 1e-8;
    if (!d.opened || d.partial || plan.statistics.sourceEuler !== 0)
      throw new Error('Natural cut boundaries require an opened full-coverage sphere band.');
    const edgeById = new Map(plan.complex.edges.map((e) => [e.id, e]));
    for (const step of natural) {
      if (
        !actual.has(step.edgeId) ||
        !same(step, actual.get(step.edgeId)!) ||
        covered.has(step.edgeId) ||
        sourceCuts.has(step.sourceEdgeId)
      )
        throw new Error('Natural boundary differs from the cut complex or overlaps a paired seam.');
      const e = edgeById.get(step.edgeId)!;
      const endpoints = [vertices.get(step.from)!.position, vertices.get(step.to)!.position];
      const sign = Math.sign(endpoints[0]![2]);
      if (
        e.faces.length !== 1 ||
        !(e.path ?? endpoints).every(
          (p) =>
            Math.abs(p[2] - sign * d.zMax) <= tol && Math.abs(Math.hypot(...p) - d.radius) <= tol
        )
      )
        throw new Error('Natural boundary is not a polar rim.');
      covered.add(step.edgeId);
    }
  }
  if (covered.size !== plan.boundary.length || plan.boundary.some((s) => !covered.has(s.edgeId)))
    throw new Error('Seam pairs do not cover the entire boundary.');
}
export function seamMapJson(plan: CutPlan, current: KnitCutSettings): string {
  if (cutSettingsKey(plan.settings) !== cutSettingsKey(current))
    throw new Error('Seam export blocked: validate the current cut draft first.');
  const topology = inspectCutComplex(plan.complex);
  if (topology.euler !== 1 || topology.components !== 1 || topology.boundaryComponents !== 1)
    throw new Error('Seam export blocked: cut complex is not one disk.');
  assertSeamPairs(plan, topology.boundary);
  const text = JSON.stringify(
    {
      format: 'knitting-topology-seam-map',
      version: 1,
      units: 'm',
      method: plan.version,
      surface: plan.surface,
      sourceSignature: plan.settings.sourceSignature,
      provenance: plan.provenance,
      cut: plan.settings,
      statistics: plan.statistics,
      complex: plan.complex,
      boundary: plan.boundary,
      ...(plan.naturalBoundaries ? { naturalBoundaries: plan.naturalBoundaries } : {}),
      seams: plan.seams,
      notes: plan.notes,
    },
    null,
    2
  );
  if (text.length > 64_000_000)
    throw new Error('Seam export is too large. Reduce network density.');
  return text;
}
