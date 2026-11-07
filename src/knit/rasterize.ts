// Network -> per-loop structure assignment. Works in continuous grid coordinates (see mapping.ts), so it does not
// depend on how a surface is mapped. Priority: node marks over edge lines over cell fill.
import type { KnitSettings, PatternGraph, SurfaceSpec } from '../core/types';
import { extraordinaryNodeIds } from '../core/diagnostics';
import type { Key } from './keys';
import type { KnitMapping } from './mapping';
import { structuresForKey, type Structure } from './structures';
import { imageIndex } from './grid';

export const SOURCE = { background: 0, cell: 1, edge: 2, node: 3, extraordinary: 4 } as const;
export type SourceKind = (typeof SOURCE)[keyof typeof SOURCE];
export const SOURCE_NAMES = ['background', 'cell', 'edge', 'node', 'extraordinary node'] as const;

export interface Raster {
  w: number;
  h: number;
  /** Per image cell: index into `structures`. */
  structure: Uint16Array;
  /** Per image cell: what the loop comes from (SOURCE) and its index in graph.cells / edges / nodes, or -1. */
  kind: Uint8Array;
  element: Int32Array;
  structures: Structure[];
  /** Structure id per graph cell (same order as graph.cells). */
  cellStructure: string[];
  /** Rule conflicts and unresolved ids, for the report. */
  issues: string[];
}

type Poly = number[]; // flat [x0, y0, x1, y1, ...] in grid coordinates

function inside(px: number, py: number, poly: Poly): boolean {
  let c = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[2 * i]!,
      yi = poly[2 * i + 1]!,
      xj = poly[2 * j]!,
      yj = poly[2 * j + 1]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function bounds(poly: Poly): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i]!);
    x1 = Math.max(x1, poly[i]!);
    y0 = Math.min(y0, poly[i + 1]!);
    y1 = Math.max(y1, poly[i + 1]!);
  }
  return [x0, y0, x1, y1];
}

/** 0-based indices whose cell centre (i + 0.5) lies in [lo, hi]. */
const centreRange = (lo: number, hi: number, n: number): [number, number] => [
  Math.max(0, Math.ceil(lo - 0.5)),
  Math.min(n - 1, Math.floor(hi - 0.5)),
];

/** Assigns a structure id to every graph cell from the rule, then the manual overrides. */
export function assignCells(
  graph: PatternGraph,
  cellPolys: Poly[],
  mapping: KnitMapping,
  settings: KnitSettings,
  issues: string[]
): string[] {
  const { fill, rule, overrides } = settings.cells;
  const out = graph.cells.map(() => fill);
  if (rule.kind === 'sides') {
    graph.cells.forEach((c, i) => {
      const n = c.nodes.length;
      out[i] = rule.bySides[n >= 6 ? '6+' : String(n)] ?? fill;
    });
  } else if (rule.kind === 'alternating') {
    const index = new Map(graph.cells.map((c, i) => [c.id, i]));
    const adj: number[][] = graph.cells.map(() => []);
    for (const e of graph.edges)
      if (e.cells.length === 2) {
        const a = index.get(e.cells[0]!),
          b = index.get(e.cells[1]!);
        if (a !== undefined && b !== undefined) {
          adj[a]!.push(b);
          adj[b]!.push(a);
        }
      }
    const colour = new Int8Array(graph.cells.length).fill(-1);
    for (let s = 0; s < graph.cells.length; s++) {
      if (colour[s] !== -1) continue;
      colour[s] = 0;
      const queue = [s];
      for (let q = 0; q < queue.length; q++)
        for (const n of adj[queue[q]!]!)
          if (colour[n] === -1) {
            colour[n] = 1 - colour[queue[q]!]!;
            queue.push(n);
          }
    }
    let conflicts = 0;
    adj.forEach((ns, a) => ns.forEach((b) => a < b && colour[a] === colour[b] && conflicts++));
    if (conflicts)
      issues.push(
        `Alternating rule: ${conflicts} neighbouring cell pairs share a structure (the network has odd cycles).`
      );
    graph.cells.forEach((_, i) => {
      out[i] = rule.palette[colour[i]! % rule.palette.length] ?? fill;
    });
  } else if (rule.kind === 'coarse') {
    const coarse = graph.coarseTopology;
    if (!coarse || !coarse.cells.length) {
      issues.push('Coarse rule: this network has no coarse topology; cells use the fill.');
    } else {
      const pos = new Map(coarse.nodes.map((n) => [n.id, mapping.toGrid(n.position)]));
      const polys = coarse.cells.map((c) => c.nodes.flatMap((id) => pos.get(id) ?? [NaN, NaN]));
      const boxes = polys.map(bounds);
      const index = new Map(coarse.cells.map((c, i) => [c.id, i]));
      const adj: Set<number>[] = coarse.cells.map(() => new Set());
      for (const e of coarse.edges)
        if (e.cells.length === 2) {
          const a = index.get(e.cells[0]!),
            b = index.get(e.cells[1]!);
          if (a !== undefined && b !== undefined && a !== b) {
            adj[a]!.add(b);
            adj[b]!.add(a);
          }
        }
      const colour = coarse.cells.map(() => -1);
      let conflicts = 0;
      coarse.cells.forEach((_, i) => {
        const used = new Set([...adj[i]!].map((n) => colour[n]));
        let c = 0;
        while (used.has(c) && c < rule.palette.length) c++;
        if (c >= rule.palette.length) {
          conflicts++;
          c = i % rule.palette.length;
        }
        colour[i] = c;
      });
      if (conflicts)
        issues.push(
          `Coarse rule: ${conflicts} coarse cells could not differ from all neighbours with ${rule.palette.length} structures.`
        );
      let outside = 0;
      cellPolys.forEach((poly, i) => {
        let cx = 0,
          cy = 0;
        for (let p = 0; p < poly.length; p += 2) {
          cx += poly[p]!;
          cy += poly[p + 1]!;
        }
        cx /= poly.length / 2;
        cy /= poly.length / 2;
        const hit = polys.findIndex((cp, ci) => {
          const [x0, y0, x1, y1] = boxes[ci]!;
          return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1 && inside(cx, cy, cp);
        });
        if (hit < 0) outside++;
        else out[i] = rule.palette[colour[hit]!]!;
      });
      if (outside)
        issues.push(`Coarse rule: ${outside} cells lie in no coarse cell and use the fill.`);
    }
  }
  const index = new Map(graph.cells.map((c, i) => [c.id, i]));
  const missing = Object.keys(overrides).filter((id) => !index.has(id));
  for (const [id, s] of Object.entries(overrides)) {
    const i = index.get(id);
    if (i !== undefined) out[i] = s;
  }
  if (missing.length)
    issues.push(
      `${missing.length} manual cell overrides name cells that are not in this network (kept in the settings).`
    );
  return out;
}

export function rasterizeNetwork(
  graph: PatternGraph,
  surface: SurfaceSpec,
  mapping: KnitMapping,
  settings: KnitSettings,
  key: Key
): Raster {
  const w = mapping.needles,
    h = mapping.passes,
    issues: string[] = [];
  const library = structuresForKey(key, settings.tiles, settings.keys);
  const byId = new Map(library.map((s) => [s.id, s]));
  const structures: Structure[] = [];
  const slot = new Map<string, number>();
  const unknown = new Set<string>();
  const resolve = (id: string): number => {
    let s = byId.get(id);
    if (!s) {
      unknown.add(id);
      s = byId.get(settings.cells.fill) ?? library[0]!;
    }
    let i = slot.get(s.id);
    if (i === undefined) {
      i = structures.length;
      structures.push(s);
      slot.set(s.id, i);
    }
    return i;
  };

  const n = w * h;
  const structure = new Uint16Array(n),
    kind = new Uint8Array(n),
    element = new Int32Array(n).fill(-1);
  structure.fill(resolve(settings.cells.fill));

  const nodeGrid = new Map(graph.nodes.map((nd) => [nd.id, mapping.toGrid(nd.position)]));
  const edgeOf = new Map<string, number>();
  graph.edges.forEach((e, i) => edgeOf.set(e.a < e.b ? `${e.a}|${e.b}` : `${e.b}|${e.a}`, i));
  /** Grid polyline of an edge, from node a to node b. */
  const edgeLine = (ei: number, from: string): number[] => {
    const e = graph.edges[ei]!;
    const pts = (e.path && e.path.length >= 2 ? e.path : null)?.map((p) => mapping.toGrid(p)) ?? [
      nodeGrid.get(e.a)!,
      nodeGrid.get(e.b)!,
    ];
    if (from !== e.a) pts.reverse();
    return pts.flat();
  };

  // cells
  const cellPolys: Poly[] = graph.cells.map((c) => {
    const poly: number[] = [];
    c.nodes.forEach((a, i) => {
      const b = c.nodes[(i + 1) % c.nodes.length]!;
      const ei = edgeOf.get(a < b ? `${a}|${b}` : `${b}|${a}`);
      const line = ei === undefined ? [...nodeGrid.get(a)!] : edgeLine(ei, a);
      poly.push(...line.slice(0, ei === undefined ? 2 : -2));
    });
    return poly;
  });
  const cellStructure = assignCells(graph, cellPolys, mapping, settings, issues);
  cellPolys.forEach((poly, ci) => {
    const [x0, y0, x1, y1] = bounds(poly);
    const [j0, j1] = centreRange(x0, x1, w),
      [k0, k1] = centreRange(y0, y1, h);
    const s = resolve(cellStructure[ci]!);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++) {
        const i = imageIndex(w, h, j, k);
        if (kind[i] === SOURCE.background && inside(j + 0.5, k + 0.5, poly)) {
          kind[i] = SOURCE.cell;
          element[i] = ci;
          structure[i] = s;
        }
      }
  });

  // edge lines: cell centres within width/2 of the polyline. Ties on one side only (half-open band), with the
  // direction normalised, so a line is exactly `width` loops thick along the grid axes.
  const boundaryNodes = new Set<string>();
  for (const e of graph.edges)
    if (e.cells.length < 2) {
      boundaryNodes.add(e.a);
      boundaryNodes.add(e.b);
    }
  if (settings.edges.structure) {
    const s = resolve(settings.edges.structure),
      r = settings.edges.width / 2;
    graph.edges.forEach((e, ei) => {
      if (e.cells.length < 2 && !settings.edges.boundary) return;
      const line = edgeLine(ei, e.a);
      for (let p = 0; p + 3 < line.length; p += 2) {
        let ax = line[p]!,
          ay = line[p + 1]!,
          bx = line[p + 2]!,
          by = line[p + 3]!;
        if (bx < ax || (bx === ax && by < ay)) [ax, ay, bx, by] = [bx, by, ax, ay];
        const dx = bx - ax,
          dy = by - ay,
          len = Math.hypot(dx, dy);
        const [j0, j1] = centreRange(Math.min(ax, bx) - r, Math.max(ax, bx) + r, w),
          [k0, k1] = centreRange(Math.min(ay, by) - r, Math.max(ay, by) + r, h);
        for (let k = k0; k <= k1; k++)
          for (let j = j0; j <= j1; j++) {
            const cx = j + 0.5 - ax,
              cy = k + 0.5 - ay;
            const t = len > 0 ? (cx * dx + cy * dy) / (len * len) : 0;
            let hit: boolean;
            if (len > 0 && t >= 0 && t <= 1) {
              const side = (dx * cy - dy * cx) / len;
              hit = side > -r && side <= r;
            } else {
              const ex = t > 1 ? bx : ax,
                ey = t > 1 ? by : ay;
              hit = Math.hypot(j + 0.5 - ex, k + 0.5 - ey) < r;
            }
            if (!hit) continue;
            const i = imageIndex(w, h, j, k);
            kind[i] = SOURCE.edge;
            element[i] = ei;
            structure[i] = s;
          }
      }
    });
  }

  // node marks: squares `size` loops wide centred on the node
  const special = extraordinaryNodeIds(graph, surface);
  if (settings.nodes.structure || settings.nodes.extraordinary) {
    const m = settings.nodes.size;
    graph.nodes.forEach((nd, ni) => {
      if (boundaryNodes.has(nd.id) && !settings.edges.boundary) return;
      const odd = special.has(nd.id);
      const id = (odd && settings.nodes.extraordinary) || settings.nodes.structure;
      if (!id) return;
      const s = resolve(id);
      const [gx, gy] = nodeGrid.get(nd.id)!;
      const j0 = Math.max(0, Math.ceil(gx - m / 2 - 0.5)),
        j1 = Math.min(w - 1, Math.ceil(gx + m / 2 - 0.5) - 1);
      const k0 = Math.max(0, Math.ceil(gy - m / 2 - 0.5)),
        k1 = Math.min(h - 1, Math.ceil(gy + m / 2 - 0.5) - 1);
      for (let k = k0; k <= k1; k++)
        for (let j = j0; j <= j1; j++) {
          const i = imageIndex(w, h, j, k);
          kind[i] = odd && settings.nodes.extraordinary ? SOURCE.extraordinary : SOURCE.node;
          element[i] = ni;
          structure[i] = s;
        }
    });
  }

  let background = 0;
  for (let i = 0; i < n; i++) if (kind[i] === SOURCE.background) background++;
  if (background)
    issues.push(`${background} loops lie in no network cell and use the fill structure.`);
  if (unknown.size)
    issues.push(
      `Structures not available with the ${key.name}: ${[...unknown].join(', ')}; the fill is used instead.`
    );
  return { w, h, structure, kind, element, structures, cellStructure, issues };
}
