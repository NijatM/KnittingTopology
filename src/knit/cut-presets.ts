import type { GenerationContext, PatternGraph, SurfaceSpec } from '../core/types';
import { cutEdgeLength, type CutBuild, type CutInput } from './cut-types';
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

/** Sampled-length shortest graph path with a preference for the +X meridian; not a geodesic certificate. */
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
    adj: { to: number; edge: string; weight: number }[][] = graph.nodes.map(() => []),
    r = surface.size / 2;
  for (const e of [...graph.edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const a = index.get(e.a),
      b = index.get(e.b);
    if (a === undefined || b === undefined)
      throw new Error('Preset source edge has a missing endpoint.');
    const p =
      e.path && e.path.length >= 2 ? e.path : [graph.nodes[a]!.position, graph.nodes[b]!.position];
    const deviation =
      p.reduce((s, q) => s + (Math.abs(q[1]) + Math.max(0, -q[0])) / r, 0) / p.length;
    const weight =
      cutEdgeLength(e, graph.nodes[a]!.position, graph.nodes[b]!.position) * (1 + 4 * deviation);
    adj[a]!.push({ to: b, edge: e.id, weight });
    adj[b]!.push({ to: a, edge: e.id, weight });
  }
  const dist = new Float64Array(graph.nodes.length).fill(Infinity),
    prev = new Int32Array(graph.nodes.length).fill(-1),
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
  const start = index.get(north.id)!,
    end = index.get(south.id)!;
  dist[start] = 0;
  push(start, 0);
  let count = 0;
  while (heap.length) {
    if ((count++ & 1023) === 0 && context?.cancelled?.()) {
      const e = new Error('Cut preset cancelled.');
      e.name = 'AbortError';
      throw e;
    }
    const q = pop();
    if (q.cost !== dist[q.node]) continue;
    if (q.node === end) break;
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
  if (!Number.isFinite(dist[end])) throw new Error('The meridian endpoints are disconnected.');
  const result: string[] = [];
  for (let n = end; n !== start; n = prev[n]!) {
    if (prev[n] === -1) throw new Error('Invalid meridian predecessor path.');
    result.push(via[n]!);
  }
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
