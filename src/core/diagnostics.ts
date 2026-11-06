import type { Diagnostic, GraphStatistics, PatternGraph, SurfaceSpec, Vec3 } from './types';
import { MAX_GRAPH_NODES, MAX_GRAPH_EDGES, MAX_GRAPH_CELLS } from './limits';
import { areaVector, cross, dot, finite3, mean, norm, sub } from './math';
import {
  analyticSurfaceArea,
  embeddedEdgeLength,
  evaluateSurface,
  surfaceNormal,
  surfaceResidual,
  validateSurface,
} from './surfaces';
import { edgeKey } from './topology';

export function validateGraph(graph: PatternGraph, surface: SurfaceSpec): Diagnostic[] {
  validateSurface(surface);
  const d: Diagnostic[] = [],
    scale = surface.size,
    tol = scale * 1e-8,
    areaTol = scale * scale * 1e-14;
  const report = (id: string, label: string, message: string, ids: string[] = [], value?: number) =>
    d.push({
      id,
      severity: 'error',
      label,
      message,
      ...(value !== undefined ? { value } : {}),
      tolerance: tol,
      method:
        'Explicit oriented cellular-complex incidence and analytic surface tests; length tolerance 1e-8 × support size, area tolerance 1e-14 × size².',
      entityIds: ids.slice(0, 20),
    });
  if (
    !graph ||
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.edges) ||
    !Array.isArray(graph.cells)
  ) {
    report('graph-shape', 'Invalid graph', 'Graph must contain node, edge and cell arrays.');
    return d;
  }
  if (
    graph.nodes.length > MAX_GRAPH_NODES ||
    graph.edges.length > MAX_GRAPH_EDGES ||
    graph.cells.length > MAX_GRAPH_CELLS
  ) {
    report('graph-bound', 'Graph too large', 'Graph exceeds bounded validation limits.');
    return d;
  }
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    cells = new Map(graph.cells.map((c) => [c.id, c]));
  if (nodes.size !== graph.nodes.length)
    report('duplicate-nodes', 'Duplicate node IDs', 'Node IDs must be unique.');
  if (cells.size !== graph.cells.length)
    report('duplicate-cells', 'Duplicate cell IDs', 'Cell IDs must be unique.');
  const badPosition = graph.nodes.filter((n) => !finite3(n.position));
  if (badPosition.length) {
    report(
      'nonfinite',
      'Invalid coordinates',
      'All node coordinates must be finite triples.',
      badPosition.map((n) => n.id)
    );
    return d;
  }
  const off = graph.nodes.filter((n) => surfaceResidual(surface, n.position) > tol);
  if (off.length)
    report(
      'surface-membership',
      'Nodes leave surface',
      'Analytic residual exceeds tolerance.',
      off.map((n) => n.id)
    );
  const maxPatch = surface.kind === 'cube' || surface.kind === 'sphere' ? 5 : 0;
  const attach = graph.nodes.filter(
    (n) =>
      !n.attachment ||
      n.attachment.surfaceRevision !== surface.revision ||
      !Number.isInteger(n.attachment.patch) ||
      n.attachment.patch < 0 ||
      n.attachment.patch > maxPatch ||
      !Array.isArray(n.attachment.uv) ||
      n.attachment.uv.length !== 2 ||
      n.attachment.uv.some((x) => !Number.isFinite(x) || x < 0 || x > 1)
  );
  if (attach.length)
    report(
      'attachments',
      'Invalid surface attachments',
      'Node attachments require the current surface revision, patch and normalized UV.',
      attach.map((n) => n.id)
    );
  if (!attach.length) {
    const mismatch = graph.nodes.filter(
      (n) =>
        norm(sub(n.position, evaluateSurface(surface, n.attachment.patch, ...n.attachment.uv))) >
        tol
    );
    if (mismatch.length)
      report(
        'attachment-position',
        'Attachment/position mismatch',
        'Node coordinates must match their analytic surface attachment.',
        mismatch.map((n) => n.id)
      );
  }
  const incidence = new Map<
      string,
      { a: string; b: string; cells: string[]; directions: number[] }
    >(),
    invalidFaces: string[] = [],
    flipped: string[] = [],
    degenerate: string[] = [];
  for (const c of graph.cells) {
    if (
      !Array.isArray(c.nodes) ||
      c.nodes.length < 3 ||
      new Set(c.nodes).size !== c.nodes.length ||
      c.nodes.some((n) => !nodes.has(n))
    ) {
      invalidFaces.push(c.id);
      continue;
    }
    const p = c.nodes.map((id) => nodes.get(id)!.position),
      av = areaVector(p),
      m = mean(p),
      normal = surface.kind === 'cube' ? m : surfaceNormal(surface, m, c.patch);
    if (norm(av) <= areaTol) degenerate.push(c.id);
    else if (dot(av, normal) <= areaTol * (surface.kind === 'cube' ? scale : 1)) flipped.push(c.id);
    // A quad must have a consistently signed Jacobian at each corner in its mean tangent plane.
    if (
      p.length === 4 &&
      p.some(
        (v, i) =>
          dot(cross(sub(p[(i + 1) % 4]!, v), sub(p[(i + 3) % 4]!, v)), av) < -areaTol * norm(av)
      )
    )
      flipped.push(c.id);
    for (let i = 0; i < c.nodes.length; i++) {
      const a = c.nodes[i]!,
        b = c.nodes[(i + 1) % c.nodes.length]!,
        k = edgeKey(a, b),
        inc = incidence.get(k) ?? { a, b, cells: [], directions: [] };
      inc.cells.push(c.id);
      inc.directions.push(a < b ? 1 : -1);
      incidence.set(k, inc);
    }
  }
  if (invalidFaces.length)
    report(
      'invalid-cells',
      'Invalid cell boundaries',
      'Cells require at least three distinct existing nodes.',
      invalidFaces
    );
  if (degenerate.length)
    report(
      'degenerate-cells',
      'Degenerate cells',
      'Cell area vector is zero within the relative area tolerance.',
      degenerate
    );
  if (flipped.length)
    report(
      'inverted-cells',
      'Inverted cells',
      'Cell orientation or quad corner Jacobian is inconsistent with the outward surface normal.',
      flipped
    );
  const edgeIds = new Set<string>(),
    edgeKeys = new Set<string>(),
    badEdges: string[] = [],
    nonmanifold: string[] = [],
    badOrientation: string[] = [];
  for (const e of graph.edges) {
    const k = edgeKey(e.a, e.b),
      inc = incidence.get(k);
    if (
      edgeIds.has(e.id) ||
      edgeKeys.has(k) ||
      e.a === e.b ||
      !nodes.has(e.a) ||
      !nodes.has(e.b) ||
      !inc ||
      new Set(e.cells).size !== e.cells.length ||
      inc.cells.length !== e.cells.length ||
      e.cells.some((id) => !inc.cells.includes(id))
    )
      badEdges.push(e.id);
    edgeIds.add(e.id);
    edgeKeys.add(k);
    if (
      e.path &&
      (!Array.isArray(e.path) ||
        e.path.length < 2 ||
        e.path.some((p) => !finite3(p) || surfaceResidual(surface, p) > tol) ||
        norm(sub(e.path[0]!, nodes.get(e.a)?.position ?? [Infinity, 0, 0])) > tol ||
        norm(sub(e.path[e.path.length - 1]!, nodes.get(e.b)?.position ?? [Infinity, 0, 0])) > tol)
    )
      badEdges.push(e.id);
  }
  for (const [k, inc] of incidence) {
    if (!edgeKeys.has(k)) badEdges.push(k);
    if (inc.cells.length > 2) nonmanifold.push(k);
    if (inc.cells.length === 2 && inc.directions[0] === inc.directions[1]) badOrientation.push(k);
  }
  if (badEdges.length)
    report(
      'edge-incidence',
      'Invalid edge incidence',
      'Graph edges must exactly encode ordered cell boundaries, unique IDs and valid embedded endpoint paths.',
      badEdges
    );
  if (nonmanifold.length)
    report(
      'nonmanifold',
      'Nonmanifold edges',
      'An edge has more than two incident cells.',
      nonmanifold
    );
  if (badOrientation.length)
    report(
      'edge-orientation',
      'Inconsistent cell orientation',
      'Two cells traverse a shared edge in the same direction.',
      badOrientation
    );
  const links = new Map(
      graph.nodes.map((n) => [n.id, new Map<string, Set<string>>() as Map<string, Set<string>>])
    ),
    boundaryDegree = new Map(graph.nodes.map((n) => [n.id, 0]));
  for (const c of graph.cells)
    if (Array.isArray(c.nodes)) for (const id of c.nodes) links.get(id)?.set(c.id, new Set());
  for (const inc of incidence.values())
    for (const id of [inc.a, inc.b]) {
      const link = links.get(id);
      if (!link) continue;
      if (inc.cells.length === 1) boundaryDegree.set(id, (boundaryDegree.get(id) ?? 0) + 1);
      if (inc.cells.length === 2) {
        link.get(inc.cells[0]!)?.add(inc.cells[1]!);
        link.get(inc.cells[1]!)?.add(inc.cells[0]!);
      }
    }
  const badLinks: string[] = [];
  for (const [id, link] of links) {
    const first = link.keys().next().value as string | undefined;
    if (first === undefined) continue;
    const visited = new Set([first]),
      queue = [first];
    while (queue.length)
      for (const next of link.get(queue.pop()!) ?? [])
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
    const bd = boundaryDegree.get(id)!;
    if (visited.size !== link.size || (bd !== 0 && bd !== 2)) badLinks.push(id);
  }
  if (badLinks.length)
    report(
      'vertex-link',
      'Nonmanifold vertex links',
      'Incident cells must form one cycle at an interior node or one path at a boundary node.',
      badLinks
    );
  const closed = surface.kind === 'cube' || surface.kind === 'sphere',
    boundary = [...incidence.values()].filter((i) => i.cells.length === 1).length;
  if (closed && boundary)
    report(
      'open-seams',
      'Open closed-surface seams',
      'Cube and sphere graphs must have no boundary edges.',
      [],
      boundary
    );
  if (graph.cells.length === 0)
    report('empty-graph', 'Empty graph', 'A valid pattern must contain cells.');
  const stats = computeStatistics(graph, surface, graph.provenance?.parameters?.spacing ?? scale);
  if (stats.components !== 1)
    report(
      'disconnected',
      'Disconnected graph',
      'A generated surface pattern must be connected.',
      [],
      stats.components
    );
  if (stats.euler !== (closed ? 2 : 1))
    report(
      'euler',
      'Unexpected Euler characteristic',
      `Expected ${closed ? 2 : 1} for a connected ${closed ? 'sphere-like closed surface' : 'disk'}.`,
      [],
      stats.euler
    );
  d.push({
    id: 'valence-convention',
    severity: 'info',
    label: 'Extraordinary vertex convention',
    message:
      'Interior valence is graph degree; boundary valence is degree + 2 at geometric corners and degree + 1 elsewhere. Extraordinary means adjusted valence differs from 4.',
    value: stats.extraordinaryVertices,
    method:
      'Takayama boundary valence convention; corner inferred from noncollinear incident boundary segments in analytic UV on plane/saddle (normalized 3D otherwise), cross-product tolerance 1e-10.',
  });
  d.push({
    id: 'euler-check',
    severity: 'info',
    label: 'Euler characteristic',
    message: `V − E + F = ${stats.euler}; ${stats.components} connected component(s), ${stats.boundaryEdges} boundary edges.`,
    value: stats.euler,
    method: 'Explicit unique graph identities, undirected adjacency traversal, boundary incidence.',
  });
  if (closed && graph.cells.every((c) => c.nodes.length === 4)) {
    const degree = new Map(graph.nodes.map((n) => [n.id, 0]));
    for (const e of graph.edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
      degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
    }
    const deficit = [...degree.values()].reduce((a, v) => a + 4 - v, 0);
    d.push({
      id: 'quad-deficit',
      severity: deficit === 8 ? 'info' : 'error',
      label: 'Quad degree deficit',
      message: `Σ(4 − degree) = ${deficit}; a closed spherical quadrangulation requires 8.`,
      value: deficit,
      tolerance: 0,
      method: 'Discrete Euler identity for closed all-quad orientable meshes.',
    });
  }
  return d;
}
export function computeStatistics(
  graph: PatternGraph,
  surface: SurfaceSpec,
  targetSpacing = graph.provenance.parameters.spacing
): GraphStatistics {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    adj = new Map(graph.nodes.map((n) => [n.id, [] as string[]])),
    boundary = new Set<string>();
  const lengths: number[] = [];
  for (const e of graph.edges) {
    if (!nodes.has(e.a) || !nodes.has(e.b)) continue;
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
    if (e.cells.length === 1) {
      boundary.add(e.a);
      boundary.add(e.b);
    }
    lengths.push(
      embeddedEdgeLength(surface, nodes.get(e.a)!.position, nodes.get(e.b)!.position, e.path)
    );
  }
  let components = 0;
  const seen = new Set<string>();
  for (const id of nodes.keys())
    if (!seen.has(id)) {
      components++;
      const stack = [id];
      seen.add(id);
      while (stack.length)
        for (const next of adj.get(stack.pop()!) ?? [])
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
    }
  const total = lengths.reduce((a, b) => a + b, 0),
    count = lengths.length;
  const boundaryNeighbors = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of graph.edges)
    if (e.cells.length === 1) {
      boundaryNeighbors.get(e.a)?.push(e.b);
      boundaryNeighbors.get(e.b)?.push(e.a);
    }
  const extraordinary = graph.nodes.filter((n) => {
    let degree = adj.get(n.id)!.length;
    if (boundary.has(n.id)) {
      const neighbors = boundaryNeighbors.get(n.id)!;
      const normalizedBoundaryDirection = (id: string): Vec3 => {
        const other = nodes.get(id)!;
        return surface.kind === 'plane' || surface.kind === 'saddle'
          ? [
              other.attachment.uv[0] - n.attachment.uv[0],
              other.attachment.uv[1] - n.attachment.uv[1],
              0,
            ]
          : (sub(other.position, n.position).map((x) => x / surface.size) as Vec3);
      };
      const corner =
        neighbors.length === 2 &&
        norm(
          cross(
            normalizedBoundaryDirection(neighbors[0]!),
            normalizedBoundaryDirection(neighbors[1]!)
          )
        ) > 1e-10;
      degree += corner ? 2 : 1;
    }
    return degree !== 4;
  }).length;
  return {
    vertices: graph.nodes.length,
    edges: graph.edges.length,
    cells: graph.cells.length,
    components,
    boundaryEdges: graph.edges.filter((e) => e.cells.length === 1).length,
    euler: graph.nodes.length - graph.edges.length + graph.cells.length,
    extraordinaryVertices: extraordinary,
    meanEdgeLength: count ? total / count : 0,
    minEdgeLength: count ? lengths.reduce((a, b) => Math.min(a, b), Infinity) : 0,
    maxEdgeLength: count ? lengths.reduce((a, b) => Math.max(a, b), 0) : 0,
    totalEdgeLength: total,
    spacingRmsRelative:
      count && targetSpacing > 0
        ? Math.sqrt(lengths.reduce((a, l) => a + (l / targetSpacing - 1) ** 2, 0) / count)
        : 0,
    surfaceArea: analyticSurfaceArea(surface),
    quadFraction: graph.cells.length
      ? graph.cells.filter((c) => c.nodes.length === 4).length / graph.cells.length
      : 0,
  };
}
export function analyzeGraph(
  graph: PatternGraph,
  surface: SurfaceSpec,
  targetSpacing = graph.provenance.parameters.spacing
): { diagnostics: Diagnostic[]; statistics: GraphStatistics } {
  return {
    diagnostics: validateGraph(graph, surface),
    statistics: computeStatistics(graph, surface, targetSpacing),
  };
}
export function polygonArea(graph: PatternGraph): number {
  const p = new Map(graph.nodes.map((n) => [n.id, n.position]));
  return graph.cells.reduce((a, c) => a + norm(areaVector(c.nodes.map((id) => p.get(id)!))), 0);
}
