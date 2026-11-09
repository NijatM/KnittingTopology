import type {
  GraphCell,
  GraphNode,
  PatternGraph,
  PatternFamily,
  SurfaceSpec,
  Vec3,
  Provenance,
} from './types';
import { areaVector, cross, dot, lerp, mean, norm, sub } from './math';
import { isModifiedSphere, sphereDomain, sphereDomainBlend } from './sphere-domain';
import { projectToSurface, surfaceNormal, surfacePath } from './surfaces';
export const edgeKey = (a: string, b: string) => JSON.stringify(a < b ? [a, b] : [b, a]);
export function featureAt(s: SurfaceSpec, p: Vec3): GraphNode['feature'] {
  if (s.kind === 'cube') {
    const n = p.filter((x) => Math.abs(Math.abs(x) - s.size / 2) < s.size * 1e-9).length;
    return n >= 3 ? 'corner' : n === 2 ? 'crease' : 'interior';
  }
  if (s.kind === 'plane' || s.kind === 'saddle')
    return Math.abs(Math.abs(p[0]) - s.size / 2) < s.size * 1e-9 ||
      Math.abs(Math.abs(p[1]) - s.size / 2) < s.size * 1e-9
      ? 'boundary'
      : 'interior';
  return 'interior';
}
function blend(s: SurfaceSpec, points: Vec3[], weights?: number[]): Vec3 {
  const w = weights ?? points.map(() => 1 / points.length);
  return isModifiedSphere(s) && sphereDomain(s).opened
    ? sphereDomainBlend(s, points, w)
    : points.reduce<Vec3>(
        (sum, p, i) => [sum[0] + p[0] * w[i]!, sum[1] + p[1] * w[i]!, sum[2] + p[2] * w[i]!],
        [0, 0, 0]
      );
}
export class MeshBuilder {
  nodes: GraphNode[] = [];
  cells: GraphCell[] = [];
  positions = new Map<string, Vec3>();
  private keys = new Map<string, string>();
  private identities = new Map<string, string>();
  constructor(
    public surface: SurfaceSpec,
    public prefix = 'v'
  ) {}
  node(p: Vec3, patch?: number, preferredId?: string, identity?: string): string {
    if (identity && this.identities.has(identity)) return this.identities.get(identity)!;
    const q = projectToSurface(this.surface, p, patch),
      k = q.position.map((x) => Math.round((x / this.surface.size) * 1e11)).join(',');
    const old = this.keys.get(k);
    if (old) {
      if (identity) this.identities.set(identity, old);
      return old;
    }
    const id = preferredId ?? `${this.prefix}${this.nodes.length}`;
    this.keys.set(k, id);
    if (identity) this.identities.set(identity, id);
    this.positions.set(id, q.position);
    this.nodes.push({ id, ...q, feature: featureAt(this.surface, q.position) });
    return id;
  }
  cell(nodes: string[], patch: number, sourceCell?: string, id?: string) {
    this.cells.push({
      id: id ?? `${this.prefix}f${this.cells.length}`,
      nodes,
      patch,
      ...(sourceCell ? { sourceCell } : {}),
    });
  }
}
export function assemble(
  s: SurfaceSpec,
  nodes: GraphNode[],
  cells: GraphCell[],
  provenance: Provenance,
  coarsePatches: PatternGraph['coarsePatches'] = [],
  coarseTopology?: PatternGraph['coarseTopology']
): PatternGraph {
  const used = new Set(cells.flatMap((c) => c.nodes)),
    clean = nodes.filter((n) => used.has(n.id)),
    map = new Map(clean.map((n) => [n.id, n]));
  const edges = new Map<string, PatternGraph['edges'][number]>(),
    cellPatch = new Map(cells.map((c) => [c.id, c.patch]));
  for (const c of cells)
    for (let i = 0; i < c.nodes.length; i++) {
      const a = c.nodes[i]!,
        b = c.nodes[(i + 1) % c.nodes.length]!,
        key = edgeKey(a, b);
      let edge = edges.get(key);
      if (!edge) {
        const pa = map.get(a)!.position,
          pb = map.get(b)!.position;
        const shared =
          s.kind === 'cube'
            ? pa.reduce(
                (count, x, k) =>
                  count +
                  (Math.abs(Math.abs(x) - s.size / 2) < s.size * 1e-9 &&
                  Math.abs(x - pb[k]!) < s.size * 1e-9
                    ? 1
                    : 0),
                0
              )
            : 0;
        edge = {
          id: `e:${key}`,
          a,
          b,
          cells: [],
          ...(shared >= 2 ? { feature: 'crease' as const } : {}),
          path: surfacePath(s, pa, pb),
        };
        edges.set(key, edge);
      }
      edge.cells.push(c.id);
    }
  for (const e of edges.values()) {
    if (e.cells.length === 1) e.feature = 'boundary';
    else if (s.kind === 'sphere') {
      const ps = e.cells.map((id) => cellPatch.get(id));
      if (new Set(ps).size > 1) e.feature = 'seam';
    }
  }
  for (const e of edges.values())
    if (e.cells.length === 1)
      for (const id of [e.a, e.b]) {
        const n = map.get(id)!;
        if (n.feature === 'interior') n.feature = 'boundary';
      }
  return {
    nodes: clean,
    edges: [...edges.values()],
    cells,
    coarsePatches,
    provenance,
    ...(coarseTopology ? { coarseTopology } : {}),
  };
}
/** Conway-style combinatorial operations on an oriented cellular mesh. Open dual/ambo are clipped at boundary vertices. */
function transformCore(s: SurfaceSpec, g: PatternGraph, family: PatternFamily): PatternGraph {
  if (family === 'quad') return g;
  let splitConcaveAmbo = 0;
  const out = new MeshBuilder(s, `${family}:`),
    byId = new Map(g.nodes.map((n) => [n.id, n])),
    centers = new Map<string, string>(),
    midpoints = new Map<string, string>();
  const center = (c: GraphCell) => {
    let id = centers.get(c.id);
    if (!id) {
      id = out.node(
        blend(
          s,
          c.nodes.map((n) => byId.get(n)!.position)
        ),
        c.patch,
        `c:${c.id}`
      );
      centers.set(c.id, id);
    }
    return id;
  };
  const midpoint = (a: string, b: string) => {
    const key = edgeKey(a, b);
    let id = midpoints.get(key);
    if (!id) {
      id = out.node(
        blend(s, [byId.get(a)!.position, byId.get(b)!.position]),
        undefined,
        `m:${key}`
      );
      midpoints.set(key, id);
    }
    return id;
  };
  if (family === 'kis' || family === 'diagonal' || family === 'gyro') {
    const third = (a: string, b: string) =>
      out.node(
        blend(s, [byId.get(a)!.position, byId.get(b)!.position], [2 / 3, 1 / 3]),
        undefined,
        `t:${a}>${b}`
      );
    for (const c of g.cells) {
      const old = c.nodes.map((id) =>
          out.node(byId.get(id)!.position, byId.get(id)!.attachment.patch, id)
        ),
        n = old.length;
      if (family === 'diagonal') {
        let start = 0;
        const positive = (a: number, b: number, d: number) =>
          dot(
            areaVector([
              byId.get(c.nodes[a]!)!.position,
              byId.get(c.nodes[b]!)!.position,
              byId.get(c.nodes[d]!)!.position,
            ]),
            surfaceNormal(
              s,
              isModifiedSphere(s)
                ? mean([
                    byId.get(c.nodes[a]!)!.position,
                    byId.get(c.nodes[b]!)!.position,
                    byId.get(c.nodes[d]!)!.position,
                  ])
                : mean(c.nodes.map((id) => byId.get(id)!.position)),
              c.patch
            )
          ) >
          s.size * s.size * 1e-14;
        if ((n === 4 && !positive(0, 1, 2)) || (n === 4 && !positive(0, 2, 3))) {
          if (!positive(1, 2, 3) || !positive(1, 3, 0))
            throw new Error(`No nondegenerate quad diagonal for ${c.id}.`);
          start = 1;
        }
        for (let i = 1; i < n - 1; i++)
          out.cell([old[start]!, old[(start + i) % n]!, old[(start + i + 1) % n]!], c.patch, c.id);
      } else if (family === 'kis') {
        const m = center(c);
        for (let i = 0; i < n; i++) out.cell([old[i]!, old[(i + 1) % n]!, m], c.patch, c.id);
      } else {
        const m = center(c);
        for (let i = 0; i < n; i++) {
          const a = c.nodes[i]!,
            b = c.nodes[(i + 1) % n]!,
            prev = c.nodes[(i + n - 1) % n]!;
          out.cell([old[i]!, third(a, b), m, third(prev, a), third(a, prev)], c.patch, c.id);
        }
      }
    }
  } else {
    const incident = new Map(g.nodes.map((n) => [n.id, [] as GraphCell[]])),
      edges = new Map(g.edges.map((e) => [edgeKey(e.a, e.b), e]));
    for (const c of g.cells) {
      center(c);
      for (const n of c.nodes) incident.get(n)!.push(c);
      if (family === 'ambo')
        out.cell(
          c.nodes.map((a, i) => midpoint(a, c.nodes[(i + 1) % c.nodes.length]!)),
          c.patch,
          c.id
        );
    }
    for (const original of g.nodes) {
      const around = incident.get(original.id)!;
      if (!around.length) continue;
      const outgoing = (c: GraphCell) => {
        const i = c.nodes.indexOf(original.id);
        return edges.get(edgeKey(original.id, c.nodes[(i + 1) % c.nodes.length]!))!;
      };
      const incoming = (c: GraphCell) => {
        const i = c.nodes.indexOf(original.id);
        return edges.get(
          edgeKey(original.id, c.nodes[(i + c.nodes.length - 1) % c.nodes.length]!)
        )!;
      };
      const boundaryStart = around.find((c) => outgoing(c).cells.length === 1),
        start =
          boundaryStart ?? [...around].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!,
        ordered: GraphCell[] = [],
        visited = new Set<string>();
      let current: GraphCell | undefined = start;
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        ordered.push(current);
        const next: string | undefined = incoming(current).cells.find((id) => id !== current!.id);
        current = next ? around.find((c) => c.id === next) : undefined;
      }
      if (ordered.length !== around.length || (!boundaryStart && current?.id !== start.id))
        throw new Error(`Cannot orient the incident cell fan at ${original.id}.`);
      const firstEdge = outgoing(start),
        lastEdge = incoming(ordered[ordered.length - 1]!),
        ids =
          family === 'dual'
            ? ordered.map(center)
            : [
                midpoint(firstEdge.a, firstEdge.b),
                ...ordered.map((c) => {
                  const e = incoming(c);
                  return midpoint(e.a, e.b);
                }),
              ];
      if (boundaryStart) {
        if (family === 'dual') {
          ids.unshift(midpoint(firstEdge.a, firstEdge.b));
          ids.push(midpoint(lastEdge.a, lastEdge.b));
        }
        ids.push(out.node(original.position, original.attachment.patch, original.id));
      }
      if (boundaryStart && family === 'ambo') {
        const originalId = ids.pop()!;
        for (let i = 0; i < ids.length - 1; i++)
          out.cell([originalId, ids[i]!, ids[i + 1]!], start.patch, ordered[i]!.id);
        continue;
      }
      if (!boundaryStart && family === 'ambo') ids.pop();
      const unique = [...new Set(ids)];
      const points = unique.map((id) => out.positions.get(id)!),
        av = areaVector(points),
        normal = surfaceNormal(s, mean(points), start.patch),
        tol = s.size * s.size * 1e-14;
      if (
        (s.kind === 'cube' || isModifiedSphere(s)) &&
        family === 'ambo' &&
        unique.length === 4 &&
        points.some(
          (p, i) =>
            dot(cross(sub(points[(i + 1) % 4]!, p), sub(points[(i + 3) % 4]!, p)), av) <
            -tol * norm(av)
        )
      ) {
        const positive = (indices: number[]) =>
          dot(areaVector(indices.map((i) => points[i]!)), normal) > tol;
        const split =
          positive([0, 1, 2]) && positive([0, 2, 3])
            ? [
                [0, 1, 2],
                [0, 2, 3],
              ]
            : positive([1, 2, 3]) && positive([1, 3, 0])
              ? [
                  [1, 2, 3],
                  [1, 3, 0],
                ]
              : undefined;
        if (!split)
          throw new Error(
            `Cannot positively triangulate clipped ambo vertex region ${original.id}.`
          );
        for (const triangle of split)
          out.cell(
            triangle.map((i) => unique[i]!),
            start.patch,
            start.id
          );
        splitConcaveAmbo++;
      } else if (unique.length >= 3 && norm(av) > tol) out.cell(unique, start.patch, start.id);
    }
  }
  if (splitConcaveAmbo)
    g.provenance.notes.push(
      `Cube ambo chart refinement: ${splitConcaveAmbo} concave interior vertex quadrilateral(s) split along a positive-area diagonal; original polygon boundary edges retained.`
    );
  return assemble(s, out.nodes, out.cells, g.provenance, g.coarsePatches, g.coarseTopology);
}
/** Cube feature-conforming extension: clip dual/ambo independently in each chart and weld shared boundary identities. Closed sphere operators remain global. */
export function transformGraph(
  s: SurfaceSpec,
  g: PatternGraph,
  family: PatternFamily
): PatternGraph {
  if (s.kind !== 'cube' || (family !== 'dual' && family !== 'ambo'))
    return transformCore(s, g, family);
  const merged = new MeshBuilder(s, `${family}:cube:`);
  for (let patch = 0; patch < 6; patch++) {
    const cells = g.cells.filter((c) => c.patch === patch),
      ids = new Set(cells.flatMap((c) => c.nodes)),
      local = assemble(
        s,
        g.nodes.filter((n) => ids.has(n.id)),
        cells,
        g.provenance
      ),
      transformed = transformCore(s, local, family),
      mapping = new Map<string, string>();
    for (const n of transformed.nodes)
      mapping.set(n.id, merged.node(n.position, patch, n.id, n.id));
    for (const c of transformed.cells)
      merged.cell(
        c.nodes.map((id) => mapping.get(id)!),
        patch,
        c.sourceCell,
        `chart:${patch}/${c.id}`
      );
  }
  g.provenance.notes.push(
    `Cube ${family} is a feature-conforming per-chart clipped project extension (ambo boundary vertex regions are triangulated from original vertices), welded along every original cube crease; it differs from the global closed Conway operator.`
  );
  return assemble(s, merged.nodes, merged.cells, g.provenance, g.coarsePatches, g.coarseTopology);
}
/** Insert an interior quad and four quad annulus cells, preserving all old shared edges. */
export function insetGraph(
  s: SurfaceSpec,
  g: PatternGraph,
  select: (cell: GraphCell, index: number) => boolean
): PatternGraph {
  const b = new MeshBuilder(s, 'inset:');
  const old = new Map(g.nodes.map((n) => [n.id, n]));
  for (const n of g.nodes) b.node(n.position, n.attachment.patch, n.id);
  g.cells.forEach((c, index) => {
    if (!select(c, index)) {
      b.cell(c.nodes, c.patch, c.sourceCell, c.id);
      return;
    }
    const center = blend(
      s,
      c.nodes.map((id) => old.get(id)!.position)
    );
    const inner = c.nodes.map((id) =>
      b.node(blend(s, [old.get(id)!.position, center], [0.55, 0.45]), c.patch)
    );
    b.cell(inner, c.patch, c.id, `${c.id}/inner`);
    for (let i = 0; i < c.nodes.length; i++)
      b.cell(
        [
          c.nodes[i]!,
          c.nodes[(i + 1) % c.nodes.length]!,
          inner[(i + 1) % inner.length]!,
          inner[i]!,
        ],
        c.patch,
        c.id,
        `${c.id}/ring${i}`
      );
  });
  return assemble(s, b.nodes, b.cells, g.provenance, g.coarsePatches, g.coarseTopology);
}
/** Face center and shared edge midpoint split: arbitrary polygons become all-quads. */
export function quadrangulateFaces(s: SurfaceSpec, g: PatternGraph): PatternGraph {
  const b = new MeshBuilder(s, 'q:');
  const old = new Map(g.nodes.map((n) => [n.id, n]));
  for (const c of g.cells) {
    const p = c.nodes.map((id) => old.get(id)!.position),
      m = b.node(blend(s, p), c.patch);
    for (let i = 0; i < p.length; i++)
      b.cell(
        [
          b.node(p[i]!, undefined, c.nodes[i]),
          b.node(blend(s, [p[i]!, p[(i + 1) % p.length]!])),
          m,
          b.node(blend(s, [p[(i + p.length - 1) % p.length]!, p[i]!])),
        ],
        c.patch,
        c.id
      );
  }
  return assemble(s, b.nodes, b.cells, g.provenance, g.coarsePatches, g.coarseTopology);
}
