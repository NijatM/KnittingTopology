import type {
  Diagnostic,
  GraphStatistics,
  PatternGraph,
  SurfaceAttachment,
  SurfaceSpec,
  Vec3,
} from './types';
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
import {
  hasRectangularMapping,
  mappedUVAtTriangle,
  mappedUVPath,
  MAPPED_ATTACHMENT_TOLERANCE,
} from '../import/uv-mapping';

/** Accept either incident source triangle at an edge/vertex; never replace known UV by closest-point projection. */
export function mappedAttachmentMatches(
  surface: SurfaceSpec,
  position: Vec3,
  attachment: SurfaceAttachment
): boolean {
  const mesh = surface.mesh,
    bary = attachment?.barycentric,
    face = attachment?.faceId;
  if (
    !hasRectangularMapping(surface) ||
    !mesh ||
    !attachment ||
    attachment.surfaceRevision !== surface.revision ||
    attachment.patch !== 0 ||
    !Array.isArray(attachment.uv) ||
    attachment.uv.length !== 2 ||
    attachment.uv.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
    !Number.isInteger(face) ||
    face! < 0 ||
    face! >= mesh.indices.length / 3 ||
    !Array.isArray(bary) ||
    bary.length !== 3 ||
    bary.some(
      (x) =>
        !Number.isFinite(x) ||
        x < -MAPPED_ATTACHMENT_TOLERANCE ||
        x > 1 + MAPPED_ATTACHMENT_TOLERANCE
    ) ||
    Math.abs(bary[0]! + bary[1]! + bary[2]! - 1) > MAPPED_ATTACHMENT_TOLERANCE ||
    !finite3(position)
  )
    return false;
  try {
    const normalized = bary.map((value) => Math.max(0, Math.min(1, value))) as Vec3;
    const total = normalized[0] + normalized[1] + normalized[2];
    for (let i = 0; i < 3; i++) normalized[i]! /= total;
    const uv = mappedUVAtTriangle(surface, face!, normalized);
    if (uv.some((x, i) => Math.abs(x - attachment.uv[i]!) > 1e-8)) return false;
    const point: Vec3 = [0, 0, 0];
    for (let corner = 0; corner < 3; corner++) {
      const vertex = mesh.indices[face! * 3 + corner]!;
      for (let axis = 0; axis < 3; axis++)
        point[axis]! += normalized[corner]! * mesh.positions[vertex * 3 + axis]!;
    }
    return norm(sub(point, position)) <= surface.size * 1e-8;
  } catch {
    return false;
  }
}

/** One extra validation pass only: the synthetic coarse graph deliberately has no nested coarse metadata. */
function validateMappedCoarse(graph: PatternGraph, surface: SurfaceSpec): Diagnostic[] {
  const diagnostics: Diagnostic[] = [],
    tolerance = surface.size * 1e-8;
  const report = (id: string, label: string, message: string, ids: string[] = []) =>
    diagnostics.push({
      id,
      severity: 'error' as const,
      label,
      message,
      tolerance,
      toleranceUnits: 'm',
      method:
        'Bounded coarse-complex validation with the same mapped attachment and canonical path checks; ordered patch corners compared to evaluated coarse-node UV within 1e-8 × support size.',
      entityIds: ids.slice(0, 20),
    });
  const coarse = graph.coarseTopology,
    patches = graph.coarsePatches;
  if (!Array.isArray(patches) || patches.length > 12000) {
    report(
      'coarse-patch-bound',
      'Invalid coarse patch records',
      'Coarse patches require an array of at most 12000 bounded records.'
    );
    return diagnostics;
  }
  if (!coarse) {
    if (patches.length)
      report(
        'coarse-topology-missing',
        'Missing coarse topology',
        'Mapped coarse patch corners require their explicit coarse topology for validation.'
      );
    return diagnostics;
  }
  if (
    !Array.isArray(coarse.nodes) ||
    !Array.isArray(coarse.edges) ||
    !Array.isArray(coarse.cells) ||
    coarse.nodes.length > MAX_GRAPH_NODES ||
    coarse.edges.length > MAX_GRAPH_EDGES ||
    coarse.cells.length > MAX_GRAPH_CELLS
  ) {
    report(
      'coarse-graph-bound',
      'Invalid coarse graph',
      'Coarse nodes, edges and cells must satisfy the shared bounded graph-array contract.'
    );
    return diagnostics;
  }
  const countPathPoints = (edges: PatternGraph['edges']) =>
    edges.reduce((sum, edge) => sum + (Array.isArray(edge.path) ? edge.path.length : 0), 0);
  const pathPoints = countPathPoints(graph.edges) + countPathPoints(coarse.edges);
  if (pathPoints > 2_000_000) {
    report(
      'coarse-path-bound',
      'Mapped paths too large',
      'Final and coarse paths together exceed the two-million-point validation limit.'
    );
    return diagnostics;
  }
  const coarseGraph: PatternGraph = {
    nodes: coarse.nodes,
    edges: coarse.edges,
    cells: coarse.cells,
    coarsePatches: [],
    provenance: graph.provenance,
  };
  for (const diagnostic of validateGraph(coarseGraph, surface))
    if (diagnostic.severity === 'error')
      diagnostics.push({
        ...diagnostic,
        id: `coarse-${diagnostic.id}`,
        label: `Coarse ${diagnostic.label.toLowerCase()}`,
      });
  const nodes = new Map(coarse.nodes.map((node) => [node.id, node]));
  const cells = new Map(coarse.cells.map((cell) => [cell.id, cell]));
  const seen = new Set<string>(),
    invalid: string[] = [];
  for (const patch of patches) {
    const cell = cells.get(patch.id);
    if (
      seen.has(patch.id) ||
      !cell ||
      patch.patch !== cell.patch ||
      !Array.isArray(patch.corners) ||
      patch.corners.length > 128 ||
      patch.corners.length !== cell.nodes.length
    ) {
      invalid.push(patch.id);
      continue;
    }
    seen.add(patch.id);
    for (let i = 0; i < patch.corners.length; i++) {
      const corner = patch.corners[i]!,
        node = nodes.get(cell.nodes[i]!);
      if (
        !finite3(corner) ||
        !node ||
        !mappedAttachmentMatches(surface, node.position, node.attachment) ||
        surfaceResidual(surface, corner) > tolerance ||
        norm(sub(corner, evaluateSurface(surface, node.attachment.patch, ...node.attachment.uv))) >
          tolerance
      ) {
        invalid.push(patch.id);
        break;
      }
    }
  }
  for (const cell of coarse.cells) if (!seen.has(cell.id)) invalid.push(cell.id);
  if (invalid.length)
    report(
      'coarse-patch-geometry',
      'Invalid mapped coarse patch geometry',
      'Each coarse cell needs exactly one patch with matching ordered corners, patch ID and canonical mapped coarse-node geometry; corners must lie on the support.',
      invalid
    );
  return diagnostics;
}

export function validateGraph(graph: PatternGraph, surface: SurfaceSpec): Diagnostic[] {
  validateSurface(surface);
  const d: Diagnostic[] = [],
    scale = surface.size,
    tol = scale * 1e-8,
    areaTol = scale * scale * 1e-14,
    mapped = hasRectangularMapping(surface);
  const report = (id: string, label: string, message: string, ids: string[] = [], value?: number) =>
    d.push({
      id,
      severity: 'error',
      label,
      message,
      ...(value !== undefined ? { value } : {}),
      tolerance: tol,
      method:
        'Explicit oriented cellular-complex incidence and support surface tests; length tolerance 1e-8 × support size, area tolerance 1e-14 × size².',
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
  if (
    mapped &&
    (graph.edges.some((edge) => Array.isArray(edge.path) && edge.path.length > 1024) ||
      graph.edges.reduce(
        (sum, edge) => sum + (Array.isArray(edge.path) ? edge.path.length : 0),
        0
      ) > 2_000_000)
  ) {
    report(
      'path-bound',
      'Mapped paths too large',
      'Mapped paths exceed 1024 samples per edge or the two-million-point validation limit.'
    );
    return d;
  }
  if (mapped) d.push(...validateMappedCoarse(graph, surface));
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
      'Support-surface residual exceeds tolerance.',
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
      n.attachment.uv.some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
      (mapped && !mappedAttachmentMatches(surface, n.position, n.attachment))
  );
  if (attach.length)
    report(
      'attachments',
      'Invalid surface attachments',
      'Node attachments require the current surface revision, patch and normalized UV.',
      attach.map((n) => n.id)
    );
  const invalidAttachmentIds = new Set(attach.map((node) => node.id));
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
        'Node coordinates must match their support-surface attachment.',
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
    if (mapped && c.nodes.every((id) => !invalidAttachmentIds.has(id))) {
      const uv = c.nodes.map((id) => nodes.get(id)!.attachment.uv);
      const signed = uv.reduce(
        (sum, point, i) =>
          sum + point[0] * uv[(i + 1) % uv.length]![1] - point[1] * uv[(i + 1) % uv.length]![0],
        0
      );
      const badCorner =
        uv.length === 4 &&
        uv.some((point, i) => {
          const next = uv[(i + 1) % 4]!,
            previous = uv[(i + 3) % 4]!;
          return (
            (next[0] - point[0]) * (previous[1] - point[1]) -
              (next[1] - point[1]) * (previous[0] - point[0]) <=
            1e-14
          );
        });
      if (signed <= 1e-14 || badCorner) flipped.push(c.id);
    }
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
      mapped
        ? 'Cell orientation or quad corner Jacobian fails a positive normalized-UV check or the local 3D support-normal check.'
        : 'Cell orientation or quad corner Jacobian is inconsistent with the outward surface normal.',
      flipped
    );
  const edgeIds = new Set<string>(),
    edgeKeys = new Set<string>(),
    badEdges: string[] = [],
    badMappedPaths: string[] = [],
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
        e.path.some((p) => !finite3(p) || (!mapped && surfaceResidual(surface, p) > tol)) ||
        norm(sub(e.path[0]!, nodes.get(e.a)?.position ?? [Infinity, 0, 0])) > tol ||
        norm(sub(e.path[e.path.length - 1]!, nodes.get(e.b)?.position ?? [Infinity, 0, 0])) > tol)
    )
      badEdges.push(e.id);
    if (mapped) {
      const a = nodes.get(e.a),
        b = nodes.get(e.b);
      if (!e.path || !Array.isArray(e.path)) badMappedPaths.push(e.id);
      else if (!a || !b || invalidAttachmentIds.has(e.a) || invalidAttachmentIds.has(e.b))
        badEdges.push(e.id);
      else {
        const canonical = mappedUVPath(surface, a.attachment.uv, b.attachment.uv);
        if (
          canonical.length !== e.path.length ||
          canonical.some((point, i) => !finite3(e.path![i]!) || norm(sub(point, e.path![i]!)) > tol)
        )
          badMappedPaths.push(e.id);
      }
    }
  }
  for (const [k, inc] of incidence) {
    if (!edgeKeys.has(k)) badEdges.push(k);
    if (inc.cells.length > 2) nonmanifold.push(k);
    if (inc.cells.length === 2 && inc.directions[0] === inc.directions[1]) badOrientation.push(k);
  }
  if (mapped && !invalidAttachmentIds.size) {
    const intervals: [number, number][][] = [[], [], [], []];
    const boundaryIssues: string[] = [];
    for (const [key, inc] of incidence) {
      if (inc.cells.length !== 1) continue;
      const a = nodes.get(inc.a)!.attachment.uv,
        b = nodes.get(inc.b)!.attachment.uv;
      const side =
        Math.abs(a[1]) <= 1e-10 && Math.abs(b[1]) <= 1e-10
          ? 0
          : Math.abs(a[0] - 1) <= 1e-10 && Math.abs(b[0] - 1) <= 1e-10
            ? 1
            : Math.abs(a[1] - 1) <= 1e-10 && Math.abs(b[1] - 1) <= 1e-10
              ? 2
              : Math.abs(a[0]) <= 1e-10 && Math.abs(b[0]) <= 1e-10
                ? 3
                : -1;
      if (side < 0) {
        boundaryIssues.push(key);
        continue;
      }
      const axis = side % 2 === 0 ? 0 : 1;
      intervals[side]!.push([Math.min(a[axis]!, b[axis]!), Math.max(a[axis]!, b[axis]!)]);
    }
    for (let side = 0; side < 4; side++) {
      let covered = 0;
      for (const [start, end] of intervals[side]!.sort((a, b) => a[0] - b[0])) {
        if (Math.abs(start - covered) > 1e-10 || end - start <= 1e-14)
          boundaryIssues.push(`chart-side:${side}`);
        covered = end;
      }
      if (Math.abs(covered - 1) > 1e-10) boundaryIssues.push(`chart-side:${side}`);
    }
    if (boundaryIssues.length)
      report(
        'chart-boundary',
        'Incomplete rectangular chart boundary',
        'Mapped graph boundary edges must cover each normalized rectangle side exactly once, without interior segments, gaps or overlaps (UV tolerance 1e-10).',
        boundaryIssues
      );
  }
  if (badMappedPaths.length)
    report(
      'mapped-path-convention',
      'Mapped path convention mismatch',
      'Mapped edge paths must match every canonical source-triangle crossing. Regenerate this graph with the current mapping convention before using or exporting it.',
      badMappedPaths
    );
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
/** Nodes counted as extraordinary in the statistics: interior degree != 4; on the boundary, degree + 1 != 4,
 *  or degree + 2 != 4 at a boundary corner. */
export function extraordinaryNodeIds(graph: PatternGraph, surface: SurfaceSpec): Set<string> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n])),
    adj = new Map(graph.nodes.map((n) => [n.id, [] as string[]])),
    boundary = new Set<string>();
  for (const e of graph.edges) {
    if (!nodes.has(e.a) || !nodes.has(e.b)) continue;
    adj.get(e.a)!.push(e.b);
    adj.get(e.b)!.push(e.a);
    if (e.cells.length === 1) {
      boundary.add(e.a);
      boundary.add(e.b);
    }
  }
  const boundaryNeighbors = new Map(graph.nodes.map((n) => [n.id, [] as string[]]));
  for (const e of graph.edges)
    if (e.cells.length === 1) {
      boundaryNeighbors.get(e.a)?.push(e.b);
      boundaryNeighbors.get(e.b)?.push(e.a);
    }
  return new Set(
    graph.nodes
      .filter((n) => {
        let degree = adj.get(n.id)!.length;
        if (boundary.has(n.id)) {
          const neighbors = boundaryNeighbors.get(n.id)!;
          const normalizedBoundaryDirection = (id: string): Vec3 => {
            const other = nodes.get(id)!;
            return surface.kind === 'plane' ||
              surface.kind === 'saddle' ||
              hasRectangularMapping(surface)
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
      })
      .map((n) => n.id)
  );
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
  const extraordinary = extraordinaryNodeIds(graph, surface).size;
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
