import type { PatternGraph, SurfaceSpec } from './types';
import { MAX_SUBDIVISIONS } from './limits';
import { embeddedEdgeLength } from './surfaces';
import { edgeKey } from './topology';
/** Opposite-edge equivalence classes of an explicit all-quad coarse complex (Oval et al., §3.2). */
export function extractCoarseStrips(
  surface: SurfaceSpec,
  graph: PatternGraph,
  spacing: number,
  overrides: Record<string, number> = {}
): NonNullable<PatternGraph['coarseTopology']> {
  if (
    new Set(graph.nodes.map((n) => n.id)).size !== graph.nodes.length ||
    new Set(graph.edges.map((e) => e.id)).size !== graph.edges.length ||
    new Set(graph.cells.map((c) => c.id)).size !== graph.cells.length
  )
    throw new Error('Coarse node, edge and cell IDs must be unique before strip extraction.');
  const parent = new Map(graph.edges.map((e) => [e.id, e.id])),
    edges = new Map(graph.edges.map((e) => [edgeKey(e.a, e.b), e])),
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (x !== r) {
      const next = parent.get(x)!;
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    a = find(a);
    b = find(b);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
  };
  for (const c of graph.cells) {
    if (c.nodes.length !== 4) throw new Error('Strip extraction requires all-quad coarse cells.');
    const e = c.nodes.map((a, i) => edges.get(edgeKey(a, c.nodes[(i + 1) % 4]!))!.id);
    union(e[0]!, e[2]!);
    union(e[1]!, e[3]!);
  }
  const groups = new Map<string, typeof graph.edges>();
  for (const e of graph.edges) {
    const id = find(e.id),
      group = groups.get(id) ?? [];
    group.push(e);
    groups.set(id, group);
  }
  const strips = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([root, es]) => {
      const id = `strip:${root}`,
        meanLength =
          es.reduce(
            (sum, e) => sum + embeddedEdgeLength(surface, nodes.get(e.a)!, nodes.get(e.b)!, e.path),
            0
          ) / es.length,
        value = overrides[id] ?? Math.max(1, Math.round(meanLength / spacing));
      if (!Number.isInteger(value) || value < 1 || value > MAX_SUBDIVISIONS)
        throw new Error(
          `Strip ${id} requires an integer subdivision count from 1 to 128; increase target spacing or reduce the strip override.`
        );
      return {
        id,
        edgeIds: es.map((e) => e.id).sort(),
        closed: es.every((e) => e.cells.length === 2),
        subdivisions: value,
      };
    });
  for (const key of Object.keys(overrides))
    if (!strips.some((s) => s.id === key))
      throw new Error(
        `Unknown coarse strip override ${key}; regenerate topology before editing its strips.`
      );
  return {
    nodes: structuredClone(graph.nodes),
    edges: structuredClone(graph.edges),
    cells: structuredClone(graph.cells),
    strips,
  };
}
export function coarseCellCounts(
  topology: NonNullable<PatternGraph['coarseTopology']>
): [number, number][] {
  const edgeCounts = new Map<string, number>(),
    edges = new Map(topology.edges.map((e) => [edgeKey(e.a, e.b), e.id]));
  for (const s of topology.strips) for (const id of s.edgeIds) edgeCounts.set(id, s.subdivisions);
  return topology.cells.map((c) => [
    edgeCounts.get(edges.get(edgeKey(c.nodes[0]!, c.nodes[1]!))!)!,
    edgeCounts.get(edges.get(edgeKey(c.nodes[1]!, c.nodes[2]!))!)!,
  ]);
}
