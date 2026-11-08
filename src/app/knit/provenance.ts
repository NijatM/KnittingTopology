// Loop <-> network element links for the linked bitmap and 3D views.
import type {
  KnitGraphStages,
  KnitStagePoint,
  PatternGraph,
  SurfaceSpec,
  Vec3,
} from '../../core/types';
import { evaluateSurface } from '../../core/surfaces';
import type { ViewerSelection } from '../../viewer/types';
import type { KnitProgram } from '../../knit/program';
import { SOURCE, SOURCE_NAMES } from '../../knit/rasterize';
import { imageIndex, needleOf, passOf } from '../../knit/grid';
import type { KnitLayers } from './KnitInspection';

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
export function loopText(p: KnitProgram, graph: PatternGraph | null, i: number): string {
  const op = p.key.ops[p.cells[i]!];
  const kind = p.raster.kind[i]!,
    e = p.raster.element[i]!;
  const structure = p.raster.structures[p.raster.structure[i]!];
  const placement = p.shape?.needles.placements[p.shape.placementAt[i]!];
  const roles =
    placement && p.shape
      ? [
          ...new Set([
            placement.role,
            ...p.shape.needles.steps
              .filter(
                (step) => step.pass === placement.course + 1 && step.needle === placement.needle
              )
              .map((step) => step.role),
          ]),
        ].join(' / ')
      : '';
  const id =
    kind === SOURCE.cell
      ? graph?.cells[e]?.id
      : kind === SOURCE.edge
        ? graph?.edges[e]?.id
        : kind === SOURCE.node || kind === SOURCE.extraordinary
          ? graph?.nodes[e]?.id
          : undefined;
  if (p.shape)
    return `Needle ${needleOf(p.w, i) + 1}, pass ${passOf(p.w, p.h, i) + 1}: ${op?.name ?? 'unknown'} · ${structure?.name ?? '?'} · ${placement ? `${p.settings.mode === 'network' ? 'reference ' : ''}${roles} · course ${placement.course + 1} · ${placement.loop.id}` : p.rectification ? 'rectangular fill (no surface reference)' : 'held / outside course'}${p.settings.mode !== 'shape' ? ` · ${SOURCE_NAMES[kind]}${id ? ` ${id}` : ''}` : ''}`;
  const moved = p.transfers.find(
    (t) => t.needle === needleOf(p.w, i) && t.pass === passOf(p.w, p.h, i)
  );
  return `Needle ${needleOf(p.w, i) + 1}, pass ${passOf(p.w, p.h, i) + 1}: ${op?.name ?? 'unknown'} (${op?.colour ?? '?'}) · ${structure?.name ?? '?'} · ${SOURCE_NAMES[kind]}${id ? ` ${id}` : ''}${moved ? ` · automatic transfer (${moved.from} → ${moved.to})` : ''}`;
}

/** Render-only shaping marks retain their bitmap index; turns are explicit steps. */
export function shapeOverlay(p: KnitProgram) {
  if (!p.shape) return null;
  const shape = p.shape;
  return {
    courses: shape.geometry.courses.map((c) => c.points.map((point) => point.position)),
    marks: shape.needles.steps.flatMap((step) => {
      const index = imageIndex(p.w, p.h, step.needle, step.pass - 1);
      const i = shape.placementAt[index]!;
      if (i < 0) return [];
      return [{ position: shape.needles.placements[i]!.loop.position, index, role: step.role }];
    }),
  };
}

/** Render-only knit graph stage: course stage links, or the loop stage (primal edges, or loops joined
 * along their courses and to their parents) with loops coloured by role. */
export function knitGraphOverlay(
  graph: Pick<KnitGraphStages, 'courses' | 'loops'> | undefined,
  surface: SurfaceSpec,
  stage: 'courses' | 'loops'
): { weft: Vec3[][]; warp: Vec3[][]; loops: { position: Vec3; role: string }[] } | null {
  if (!graph) return null;
  const at = (q: KnitStagePoint) => evaluateSurface(surface, q.patch ?? 0, q.uv[0], q.uv[1]);
  if (stage === 'courses') {
    const c = graph.courses,
      pos = c.vertices.map(at);
    return {
      weft: c.vertices.length
        ? c.links.map(([a, b]) => [pos[a]!, pos[b]!])
        : c.courses.map((k) => (k.points ?? []).map(at)),
      warp: (c.warp ?? []).map(([a, b]) => [pos[a]!, pos[b]!]),
      loops: [],
    };
  }
  const l = graph.loops;
  if (!l) return null;
  const loops = l.loops.map((x) => ({ position: at(x), role: x.role }));
  if (l.primal) {
    const pos = l.primal.vertices.map(at);
    const of = (kind: 'weft' | 'warp') =>
      l.primal!.edges.filter((e) => e.kind === kind).map((e) => [pos[e.a]!, pos[e.b]!]);
    return { weft: of('weft'), warp: of('warp'), loops };
  }
  const byId = new Map(l.loops.map((x, i) => [x.id, i])),
    rows = new Map<number, Vec3[]>();
  l.loops.forEach((x, i) =>
    rows.set(x.course, [...(rows.get(x.course) ?? []), loops[i]!.position])
  );
  return {
    weft: [...rows.values()],
    warp: l.loops.flatMap((x, i) =>
      x.parents.flatMap((id) => {
        const j = byId.get(id);
        return j === undefined ? [] : [[loops[j]!.position, loops[i]!.position]];
      })
    ),
    loops,
  };
}

/** Filter display layers without rebuilding or editing the computed geometry. */
export function inspectShapeOverlay(
  overlay: ReturnType<typeof shapeOverlay>,
  layers: KnitLayers,
  shaping: boolean,
  marked: Uint8Array | null,
  hover: number | null,
  course: number | undefined,
  graph: ReturnType<typeof knitGraphOverlay> = null
) {
  if (!overlay) return null;
  const selected = (index: number) => index === hover || !!marked?.[index];
  return {
    graph: layers.graph === 'off' ? null : graph,
    courses: layers.courses ? overlay.courses : [],
    highlightedCourses:
      layers.courses && course !== undefined && overlay.courses[course]
        ? [overlay.courses[course]!]
        : [],
    marks:
      !shaping || layers.shaping === 'off'
        ? []
        : overlay.marks
            .filter((mark) => layers.shaping === 'all' || selected(mark.index))
            .map((mark) => ({ ...mark, selected: selected(mark.index) })),
  };
}
