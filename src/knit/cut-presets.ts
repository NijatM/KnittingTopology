import type { GenerationContext, GraphEdge, PatternGraph, SurfaceSpec, Vec3 } from '../core/types';
import { cutEdgeLength, orientedEdgePath, type CutBuild, type CutInput } from './cut-types';
import { buildCutDisk, cutSourceSignature } from './cuts';
import { validateSurface } from '../core/surfaces';

/** Five face hinges of a conventional cross net. The remaining seven macro-creases are cuts. */
const HINGES = new Set(['0,2', '1,2', '2,4', '2,5', '0,3']);
export function cubeCrossCut(surface: SurfaceSpec, graph: PatternGraph): string[] {
  if (surface.kind !== 'cube') throw new Error('The cross-net preset needs a cube.');
  const h = surface.size / 2,
    tol = surface.size * 1e-8,
    nodes = new Map(graph.nodes.map((n) => [n.id, n.position]));
  const planes = [
    { axis: 0, value: h, face: 0 },
    { axis: 0, value: -h, face: 1 },
    { axis: 1, value: h, face: 2 },
    { axis: 1, value: -h, face: 3 },
    { axis: 2, value: h, face: 4 },
    { axis: 2, value: -h, face: 5 },
  ];
  const ids: string[] = [],
    macro = new Set<string>();
  for (const e of graph.edges) {
    const p = e.path && e.path.length >= 2 ? e.path : [nodes.get(e.a)!, nodes.get(e.b)!];
    const on = planes.filter((f) => p.every((q) => Math.abs(q[f.axis]! - f.value) <= tol));
    if (on.length !== 2) continue;
    const key = on
      .map((f) => f.face)
      .sort((a, b) => a - b)
      .join(',');
    macro.add(key);
    if (!HINGES.has(key)) ids.push(e.id);
  }
  if (macro.size !== 12)
    throw new Error(
      'The network does not retain all twelve cube crease chains. Use a feature-preserving network or edit a cut manually.'
    );
  return ids.sort();
}

/**
 * Sampled-length shortest graph path with a preference for the +X meridian; not a geodesic certificate.
 * A path that descends at every edge sample from a highest node to a lowest node is preferred, because
 * only such a cut can be knitted with pole-to-pole courses. Otherwise the highest and lowest nodes in
 * ID order are joined without that condition.
 */
export function sphereMeridianCut(
  surface: SurfaceSpec,
  graph: PatternGraph,
  context?: GenerationContext
): string[] {
  if (surface.kind !== 'sphere') throw new Error('The meridian preset needs a sphere.');
  const sorted = [...graph.nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let north = sorted[0],
    south = sorted[0];
  for (const n of sorted) {
    if (!north || n.position[2] > north.position[2]) north = n;
    if (!south || n.position[2] < south.position[2]) south = n;
  }
  if (!north || !south || north.id === south.id)
    throw new Error('The network needs distinct north/south endpoint nodes.');
  const index = new Map(graph.nodes.map((n, i) => [n.id, i])),
    all: Arc[][] = graph.nodes.map(() => []),
    down: Arc[][] = graph.nodes.map(() => []),
    r = surface.size / 2,
    step = 1e-12 * surface.size;
  for (const e of [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const a = index.get(e.a),
      b = index.get(e.b);
    if (a === undefined || b === undefined)
      throw new Error('Preset source edge has a missing endpoint.');
    const p = orientedEdgePath(e, graph.nodes[a]!.position, graph.nodes[b]!.position);
    const deviation =
      p.reduce((s, q) => s + (Math.abs(q[1]) + Math.max(0, -q[0])) / r, 0) / p.length;
    const weight =
      cutEdgeLength(e, graph.nodes[a]!.position, graph.nodes[b]!.position) * (1 + 4 * deviation);
    all[a]!.push({ to: b, edge: e.id, weight });
    all[b]!.push({ to: a, edge: e.id, weight });
    if (p.every((q, i) => i === 0 || p[i - 1]![2] - q[2] > step))
      down[a]!.push({ to: b, edge: e.id, weight });
    if (p.every((q, i) => i === 0 || q[2] - p[i - 1]![2] > step))
      down[b]!.push({ to: a, edge: e.id, weight });
  }
  const tie = 1e-9 * surface.size,
    tops = sorted
      .filter((n) => n.position[2] >= north.position[2] - tie)
      .map((n) => index.get(n.id)!),
    bottoms = new Set(
      sorted.filter((n) => n.position[2] <= south.position[2] + tie).map((n) => index.get(n.id)!)
    );
  const descending = shortestPath(down, tops, bottoms, context);
  if (descending) return descending;
  const path = shortestPath(all, [index.get(north.id)!], new Set([index.get(south.id)!]), context);
  if (!path) throw new Error('The meridian endpoints are disconnected.');
  return path;
}
type Arc = { to: number; edge: string; weight: number };
/** Multi-source Dijkstra; returns the edge IDs of the first target reached, or null. */
function shortestPath(
  adj: Arc[][],
  sources: number[],
  targets: Set<number>,
  context?: GenerationContext
): string[] | null {
  const dist = new Float64Array(adj.length).fill(Infinity),
    prev = new Int32Array(adj.length).fill(-1),
    via: string[] = [],
    heap: { node: number; cost: number }[] = [];
  const push = (node: number, cost: number) => {
    let k = heap.length;
    heap.push({ node, cost });
    while (k) {
      const p = (k - 1) >> 1;
      if (heap[p]!.cost <= cost) break;
      heap[k] = heap[p]!;
      k = p;
    }
    heap[k] = { node, cost };
  };
  const pop = () => {
    const q = heap[0]!,
      last = heap.pop()!;
    if (heap.length) {
      let k = 0;
      while (2 * k + 1 < heap.length) {
        let j = 2 * k + 1;
        if (j + 1 < heap.length && heap[j + 1]!.cost < heap[j]!.cost) j++;
        if (heap[j]!.cost >= last.cost) break;
        heap[k] = heap[j]!;
        k = j;
      }
      heap[k] = last;
    }
    return q;
  };
  for (const s of sources) {
    dist[s] = 0;
    push(s, 0);
  }
  let count = 0,
    end = -1;
  while (heap.length) {
    if ((count++ & 1023) === 0 && context?.cancelled?.()) {
      const e = new Error('Cut preset cancelled.');
      e.name = 'AbortError';
      throw e;
    }
    const q = pop();
    if (q.cost !== dist[q.node]) continue;
    if (targets.has(q.node)) {
      end = q.node;
      break;
    }
    for (const a of adj[q.node]!) {
      const cost = q.cost + a.weight;
      if (cost < dist[a.to]!) {
        dist[a.to] = cost;
        prev[a.to] = q.node;
        via[a.to] = a.edge;
        push(a.to, cost);
      }
    }
  }
  if (end < 0) return null;
  const result: string[] = [];
  for (let n = end; prev[n] !== -1; n = prev[n]!) result.push(via[n]!);
  if (!result.length) return null;
  return result.reverse();
}
export function generateCutPlan(input: CutInput, context?: GenerationContext): CutBuild {
  try {
    const { surface, graph } = input;
    validateSurface(surface);
    const settings = input.preset
      ? {
          surfaceRevision: surface.revision,
          sourceSignature: cutSourceSignature(surface, graph),
          preset: input.preset,
          edgeIds:
            input.preset === 'cube-cross'
              ? cubeCrossCut(surface, graph)
              : sphereMeridianCut(surface, graph, context),
        }
      : input.settings;
    if (!settings) return { ok: false, reason: 'Choose a preset or select cut edges first.' };
    return buildCutDisk(surface, graph, settings, context);
  } catch (cause) {
    if ((cause as Error).name === 'AbortError') throw cause;
    return { ok: false, reason: (cause as Error).message };
  }
}
