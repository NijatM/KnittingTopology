// Loop <-> network element links for the linked bitmap and 3D views.
import type { PatternGraph } from '../../core/types';
import type { ViewerSelection } from '../../viewer/types';
import type { KnitProgram } from '../../knit/program';
import { SOURCE, SOURCE_NAMES } from '../../knit/rasterize';
import { needleOf, passOf } from '../../knit/grid';

/** The network element a loop comes from, as a viewer selection. */
export function loopSelection(
  p: KnitProgram,
  graph: PatternGraph,
  i: number
): ViewerSelection | null {
  const kind = p.raster.kind[i],
    e = p.raster.element[i]!;
  if (e < 0) return null;
  if (kind === SOURCE.cell) return graph.cells[e] ? { kind: 'cell', id: graph.cells[e].id } : null;
  if (kind === SOURCE.edge) return graph.edges[e] ? { kind: 'edge', id: graph.edges[e].id } : null;
  if (kind === SOURCE.node || kind === SOURCE.extraordinary)
    return graph.nodes[e] ? { kind: 'node', id: graph.nodes[e].id } : null;
  return null;
}

/** Loops that come from a selected network element (node marks include both node kinds). */
export function selectionLoops(
  p: KnitProgram,
  graph: PatternGraph,
  s: ViewerSelection | null
): Uint8Array | null {
  if (!s) return null;
  const list =
    s.kind === 'cell'
      ? graph.cells
      : s.kind === 'edge'
        ? graph.edges
        : s.kind === 'node'
          ? graph.nodes
          : null;
  const index = list?.findIndex((x) => x.id === s.id) ?? -1;
  if (index < 0) return null;
  const kinds: number[] =
    s.kind === 'cell'
      ? [SOURCE.cell]
      : s.kind === 'edge'
        ? [SOURCE.edge]
        : [SOURCE.node, SOURCE.extraordinary];
  const out = new Uint8Array(p.w * p.h);
  let any = false;
  for (let i = 0; i < out.length; i++)
    if (p.raster.element[i] === index && kinds.includes(p.raster.kind[i]!)) {
      out[i] = 1;
      any = true;
    }
  return any ? out : null;
}

export function marksOf(p: KnitProgram, cells: readonly number[]): Uint8Array {
  const out = new Uint8Array(p.w * p.h);
  for (const i of cells) out[i] = 1;
  return out;
}

/** One line describing a loop: needle, pass, operation, structure and source. */
export function loopText(p: KnitProgram, graph: PatternGraph, i: number): string {
  const op = p.key.ops[p.cells[i]!];
  const kind = p.raster.kind[i]!,
    e = p.raster.element[i]!;
  const structure = p.raster.structures[p.raster.structure[i]!];
  const id =
    kind === SOURCE.cell
      ? graph.cells[e]?.id
      : kind === SOURCE.edge
        ? graph.edges[e]?.id
        : kind === SOURCE.node || kind === SOURCE.extraordinary
          ? graph.nodes[e]?.id
          : undefined;
  const moved = p.transfers.find(
    (t) => t.needle === needleOf(p.w, i) && t.pass === passOf(p.w, p.h, i)
  );
  return `Needle ${needleOf(p.w, i) + 1}, pass ${passOf(p.w, p.h, i) + 1}: ${op?.name ?? 'unknown'} (${op?.colour ?? '?'}) · ${structure?.name ?? '?'} · ${SOURCE_NAMES[kind]}${id ? ` ${id}` : ''}${moved ? ` · automatic transfer (${moved.from} → ${moved.to})` : ''}`;
}
