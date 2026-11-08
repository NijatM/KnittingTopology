// Shared geometric reference, distinct logical sheet histories. This is a project model, not a textile simulation.
import type { GenerationContext, KnitSettings, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import type { KnitProgram } from './program';
import { imageIndex } from './grid';
import { otherBed, type Bed } from './keys';
import { passDir, programSequence } from './sequence';

export type FabricLayer = 'front-layer' | 'back-layer';
const LAYERS: readonly FabricLayer[] = ['front-layer', 'back-layer'];
export const layerLoopId = (layer: FabricLayer, reference: string) => `${layer}:${reference}`;
const layerBed = (layer: FabricLayer): Bed => (layer === 'front-layer' ? 'front' : 'back');
export interface LayerNode {
  id: string;
  source: string;
  layer: FabricLayer;
  /** Target stitch location, zero-based internally; JSON uses one-based needle/pass. */
  pass: number;
  needle: number;
  bed: Bed;
  uv: Vec2;
  position: Vec3;
  parents: string[];
  /** null = no actual stitch; a tuck creates a loop without consuming parents. */
  actualParents: string[] | null;
  matched: boolean;
}
export interface LayerFinding {
  id: string;
  title: string;
  text: string;
  layer?: FabricLayer;
  /** Image indices. */
  cells: number[];
}
export interface LayerGraphResult {
  supported: boolean;
  nodes: LayerNode[];
  findings: LayerFinding[];
  blockers: string[];
  requests: {
    layer: FabricLayer;
    source: string;
    needle: number;
    to: number;
    afterPass: number;
    forPass: number;
  }[];
  live: { bed: Bed; needle: number; loops: string[] }[];
  counts: {
    referenceLoops: number;
    logicalLoops: number;
    matched: number;
    failed: number;
    transferRequests: number;
  };
  assumptions: string[];
  /** Optional planner snapshot: beforePass is one-based; internal live needles remain zero-based. */
  prefix?: { beforePass: number; live: LayerGraphResult['live']; findings: LayerFinding[] };
}
/** Numerical replay does not use render mappings or evaluate surface geometry. */
export type LayerProgram = Pick<
  KnitProgram,
  'w' | 'h' | 'key' | 'cells' | 'operations' | 'firstDir'
> & {
  shape?: Pick<NonNullable<KnitProgram['shape']>, 'placementAt'> & {
    needles: Pick<NonNullable<KnitProgram['shape']>['needles'], 'placements' | 'moves'>;
  };
  settings: Pick<KnitSettings, 'mode' | 'patches' | 'layerModel'>;
  patches?: unknown;
};
export type LayerSurface = Pick<SurfaceSpec, 'kind' | 'mapping'>;
const ASSUMPTIONS = [
  'shared-reference-v1: two logical sheets share the reference coordinates; no physical thickness or offset is inferred.',
  'Logical sheet identity belongs to each loop and survives a transfer to another physical bed.',
  'Actual sequence replay uses the existing pass convention: all yarn-fed actions, then yarn-free departures and simultaneous arrivals. This is not arbitrary within-symbol chronology.',
  'Expected parents are sheet-qualified reference parent IDs. The checker validates the stated target graph, not native machine feasibility or achieved fabric shape.',
  'Explicit transfer-phase checking is a separate core API. No candidate phases or automatic schedule are inserted into this program.',
] as const;
const cancelled = (context?: GenerationContext) => {
  if (context?.cancelled?.()) {
    const e = new Error('Layer check cancelled.');
    e.name = 'AbortError';
    throw e;
  }
};

/** Inspect actual canonical operations against both sheet-qualified copies of the shape graph. */
export function inspectLayerGraph(
  p: LayerProgram,
  surface: LayerSurface,
  context?: GenerationContext,
  captureBeforePass?: number
): LayerGraphResult {
  const result: LayerGraphResult = {
    supported: false,
    nodes: [],
    findings: [],
    blockers: [],
    requests: [],
    live: [],
    counts: { referenceLoops: 0, logicalLoops: 0, matched: 0, failed: 0, transferRequests: 0 },
    assumptions: [...ASSUMPTIONS],
  };
  const groups = new Map<string, LayerFinding>();
  const add = (id: string, title: string, text: string, cell?: number, layer?: FabricLayer) => {
    const key = `${id}:${layer ?? ''}:${title}`;
    if (!groups.has(key))
      groups.set(key, { id: key, title, text, ...(layer ? { layer } : {}), cells: [] });
    if (cell !== undefined) groups.get(key)!.cells.push(cell);
  };
  const finish = () => {
    result.findings = [...groups.values()].map((f) => ({ ...f, cells: [...new Set(f.cells)] }));
    result.counts.matched = result.nodes.filter((n) => n.matched).length;
    result.counts.failed = result.nodes.length - result.counts.matched;
    result.counts.logicalLoops = result.nodes.length;
    result.counts.transferRequests = result.requests.length;
    result.blockers = result.findings.map(
      (f) =>
        `Two-layer reference${f.layer ? ` (${f.layer})` : ''}: ${f.title}${f.cells.length ? ` (${f.cells.length} cells)` : ''}. ${f.text}`
    );
    return result;
  };
  const open =
    surface.kind === 'plane' ||
    surface.kind === 'saddle' ||
    (surface.kind === 'mesh' && surface.mapping === 'rectangular-obj-uv-v1');
  if (
    !open ||
    p.settings.patches ||
    p.patches ||
    !p.shape ||
    !['shape', 'both'].includes(p.settings.mode) ||
    p.key.mode !== 2
  ) {
    add(
      'unsupported',
      'unsupported enabled model',
      'Requires two guides and an unpatched open-surface Shape or combined reference. Turn off the model or choose supported inputs.'
    );
    return finish();
  }
  const shape = p.shape,
    placements = shape.needles.placements;
  result.supported = true;
  result.counts.referenceLoops = placements.length;
  const refs = new Map<string, number>();
  placements.forEach((r, n) => {
    const cell = imageIndex(p.w, p.h, r.needle, r.course);
    if (refs.has(r.loop.id))
      add('reference', 'duplicate reference loop', 'Reference IDs must be unique.', cell);
    refs.set(r.loop.id, n);
    for (const layer of LAYERS)
      result.nodes.push({
        id: layerLoopId(layer, r.loop.id),
        source: r.loop.id,
        layer,
        pass: r.course,
        needle: r.needle,
        bed: layerBed(layer),
        uv: r.loop.uv,
        position: r.loop.position,
        parents: r.parents.map((id) => layerLoopId(layer, id)),
        actualParents: null,
        matched: false,
      });
  });
  const usedExpected = new Set<string>();
  placements.forEach((r) => {
    const cell = imageIndex(p.w, p.h, r.needle, r.course);
    if (new Set(r.parents).size !== r.parents.length)
      add('reference', 'repeated reference parent', 'A reference loop repeats a parent.', cell);
    for (const id of r.parents) {
      const parent = refs.get(id);
      if (parent === undefined || placements[parent]!.course >= r.course)
        add(
          'reference',
          'invalid reference ancestry',
          'Parents must exist in an earlier pass.',
          cell
        );
      for (const layer of LAYERS) {
        const qualified = layerLoopId(layer, id);
        if (usedExpected.has(qualified))
          add(
            'reference',
            'reference parent reused',
            'This model consumes each parent once.',
            cell,
            layer
          );
        usedExpected.add(qualified);
      }
    }
  });
  for (const move of shape.needles.moves) {
    const n = shape.placementAt[imageIndex(p.w, p.h, move.needle, move.pass - 1)]!;
    const reference = placements[n];
    if (reference)
      for (const layer of LAYERS)
        result.requests.push({
          layer,
          source: layerLoopId(layer, reference.loop.id),
          needle: move.needle,
          to: move.to,
          afterPass: move.pass,
          forPass: move.forPass,
        });
  }
  const seq = p.operations ?? programSequence(p);
  if (
    seq.w !== p.w ||
    seq.h !== p.h ||
    seq.guides !== 2 ||
    seq.rows.length !== p.w * p.h ||
    seq.firstDir !== p.firstDir
  ) {
    add(
      'sequence',
      'canonical sequence dimensions differ',
      'The actual sequence must describe the current reference grid and directions.'
    );
    return finish();
  }
  const slots: string[][] = Array.from({ length: 2 * p.w }, () => []);
  const slotOf = (bed: Bed, j: number) => (bed === 'front' ? 0 : p.w) + j;
  const consumed = new Set<string>();
  for (let k = 0; k < p.h; k++) {
    cancelled(context);
    if (k + 1 === captureBeforePass) {
      // Missing earlier stitches must invalidate a prefix before the full replay's final sweep.
      for (const node of result.nodes)
        if (node.pass < k && node.actualParents === null)
          add(
            'missing',
            'required layer stitch missing',
            'No yarn-fed action created the target layer loop.',
            imageIndex(p.w, p.h, node.needle, node.pass),
            node.layer
          );
      const live: LayerGraphResult['live'] = [];
      for (const bed of ['front', 'back'] as const)
        for (let j = 0; j < p.w; j++) {
          const loops = slots[slotOf(bed, j)]!;
          if (loops.length) live.push({ bed, needle: j, loops: [...loops] });
        }
      const prior = result.nodes.filter((node) => node.pass < k);
      const consumedBefore = new Set(prior.flatMap((node) => node.parents));
      const expectedLive = new Set(
        prior.filter((node) => !consumedBefore.has(node.id)).map((node) => node.id)
      );
      const actualLive = live.flatMap((slot) => slot.loops);
      if (
        actualLive.length !== expectedLive.size ||
        new Set(actualLive).size !== actualLive.length ||
        actualLive.some((id) => !expectedLive.has(id))
      )
        add(
          'prefix-inventory',
          'incoming layer inventory differs',
          'The incoming held loops must match the reference loops not yet consumed before the selected pass. Dropped, duplicated or unexpected loops cannot be repaired by transfer planning.'
        );
      result.prefix = {
        beforePass: k + 1,
        live,
        findings: [...groups.values()].map((f) => ({ ...f, cells: [...new Set(f.cells)] })),
      };
    }
    context?.progress?.(k / Math.max(1, p.h), 'Checking logical layer histories');
    const dir = passDir(seq.firstDir, k);
    const order = Array.from({ length: p.w }, (_, j) => (dir === 1 ? j : p.w - 1 - j));
    for (const j of order) {
      const cell = imageIndex(p.w, p.h, j, k),
        n = shape.placementAt[cell]!;
      const symbol = seq.symbols[seq.rows[k * p.w + j]!];
      if (!symbol) {
        add('sequence', 'missing actual symbol', 'The sequence has an unknown symbol.', cell);
        continue;
      }
      const beds = new Set<Bed>();
      for (const step of symbol.steps) {
        if (step.kind !== 'knit' && step.kind !== 'tuck') continue;
        if (
          !['front', 'back'].includes(step.bed) ||
          !Number.isInteger(step.guide) ||
          step.guide < 1 ||
          step.guide > 2 ||
          beds.has(step.bed)
        ) {
          add(
            'sequence',
            'unsupported stitch multiplicity',
            'The shared reference requires at most one yarn-fed action per bed and valid guide IDs.',
            cell
          );
          continue;
        }
        beds.add(step.bed);
        const slot = slotOf(step.bed, j),
          layer = step.bed === 'front' ? 'front-layer' : 'back-layer';
        const node = n >= 0 ? result.nodes[2 * n + (step.bed === 'front' ? 0 : 1)] : undefined;
        const actual = step.kind === 'knit' ? [...slots[slot]!] : [];
        if (!node)
          add(
            'outside',
            'stitch outside reference',
            'An actual stitch has no target reference loop.',
            cell,
            layer
          );
        else {
          node.actualParents = actual;
          const expected = new Set(node.parents);
          node.matched =
            actual.length === expected.size &&
            new Set(actual).size === actual.length &&
            actual.every((id) => expected.has(id));
          if (!node.matched) {
            add(
              'parents',
              'parent histories differ',
              'Inspect the sheet-qualified expected and actual parent IDs.',
              cell,
              layer
            );
            const other = step.bed === 'front' ? 'back-layer:' : 'front-layer:';
            if (actual.some((id) => id.startsWith(other)))
              add(
                'wrong-layer',
                'wrong logical layer arrived',
                'Changing physical beds does not change a loop’s logical layer identity.',
                cell,
                layer
              );
          }
        }
        if (step.kind === 'knit') {
          for (const id of actual) {
            if (consumed.has(id))
              add(
                'reused',
                'parent consumed twice',
                'A parent loop cannot be consumed by two target stitches.',
                cell,
                layer
              );
            consumed.add(id);
          }
          slots[slot] = [];
        }
        slots[slot]!.push(node?.id ?? `unexpected:${step.bed}:${k}:${j}`);
      }
    }
    const arrivals: { slot: number; loops: string[] }[] = [];
    for (const j of order) {
      const cell = imageIndex(p.w, p.h, j, k),
        symbol = seq.symbols[seq.rows[k * p.w + j]!];
      for (const step of symbol?.steps ?? []) {
        if (step.kind === 'knit' || step.kind === 'tuck') continue;
        const slot = slotOf(step.bed, j);
        if (step.kind === 'drop') {
          slots[slot] = [];
          continue;
        }
        if (!('offset' in step)) {
          add(
            'sequence',
            'unknown yarn-free action',
            'Cannot replay this action in the declared model.',
            cell
          );
          continue;
        }
        const to = j + step.offset;
        if (!Number.isInteger(to) || to < 0 || to >= p.w) {
          add(
            'outside',
            'transfer outside logical grid',
            'The sequence moves a loop outside the declared program needles.',
            cell
          );
          continue;
        }
        const target = slotOf(step.kind === 'transfer' ? otherBed(step.bed) : step.bed, to);
        arrivals.push({ slot: target, loops: slots[slot]! });
        slots[slot] = [];
      }
    }
    for (const arrival of arrivals) for (const id of arrival.loops) slots[arrival.slot]!.push(id);
  }
  for (const node of result.nodes)
    if (node.actualParents === null)
      add(
        'missing',
        'required layer stitch missing',
        'No yarn-fed action created the target layer loop.',
        imageIndex(p.w, p.h, node.needle, node.pass),
        node.layer
      );
  const terminal = new Set(result.nodes.filter((n) => !usedExpected.has(n.id)).map((n) => n.id));
  const actualTerminal = new Set<string>();
  for (const bed of ['front', 'back'] as const)
    for (let j = 0; j < p.w; j++) {
      const loops = slots[slotOf(bed, j)]!;
      if (loops.length) result.live.push({ bed, needle: j, loops: [...loops] });
      for (const id of loops) {
        if (actualTerminal.has(id))
          add('terminal', 'loop held more than once', 'A live loop appears in more than one slot.');
        actualTerminal.add(id);
      }
    }
  if (terminal.size !== actualTerminal.size || [...terminal].some((id) => !actualTerminal.has(id)))
    add(
      'terminal',
      'terminal layer inventory differs',
      'Held final loops must match the reference graph’s unconsumed leaves. Finishing is not modelled.'
    );
  return finish();
}

export function applyLayerModel(
  p: KnitProgram,
  surface: SurfaceSpec,
  context?: GenerationContext
): KnitProgram {
  if (!p.settings.layerModel) return p;
  const layerGraph = inspectLayerGraph(p, surface, context);
  return {
    ...p,
    layerGraph,
    exportBlockers: [...new Set([...p.exportBlockers, ...layerGraph.blockers])],
  };
}
export function layerGraphJson(
  graph: LayerGraphResult,
  w: number,
  h: number,
  programBlockers: readonly string[] = graph.blockers
): string {
  return JSON.stringify(
    {
      format: 'knit-layer-graph',
      version: 1,
      model: 'shared-reference-v1',
      units: 'm',
      chartUnits: 'normalized-u-v',
      indexing: 'one-based needle/pass',
      needles: w,
      passes: h,
      note: 'Expected and actual logical-layer histories on shared coordinates. Project model, not machine instructions or physical validation.',
      ...graph,
      programBlockers,
      nodes: graph.nodes.map((n) => ({ ...n, needle: n.needle + 1, pass: n.pass + 1 })),
      requests: graph.requests.map((r) => ({ ...r, needle: r.needle + 1, to: r.to + 1 })),
      live: graph.live.map((s) => ({ ...s, needle: s.needle + 1 })),
      findings: graph.findings.map((f) => ({
        ...f,
        cells: f.cells.map((i) => [(i % w) + 1, h - Math.floor(i / w)]),
      })),
      ...(graph.prefix
        ? {
            prefix: {
              ...graph.prefix,
              live: graph.prefix.live.map((s) => ({ ...s, needle: s.needle + 1 })),
              findings: graph.prefix.findings.map((f) => ({
                ...f,
                cells: f.cells.map((i) => [(i % w) + 1, h - Math.floor(i / w)]),
              })),
            },
          }
        : {}),
    },
    null,
    2
  );
}
export function layerGraphLines(graph: LayerGraphResult): string[] {
  return [
    'Shared-reference two-layer graph (project model; not a machine simulation):',
    `  ${graph.counts.referenceLoops} reference loops; ${graph.counts.logicalLoops} logical layer loops; ${graph.counts.matched} local parent sets match; ${graph.counts.failed} missing or mismatched target loops.`,
    `  ${graph.counts.transferRequests} sheet-qualified sideways transfer requests; no automatic schedule inserted.`,
    ...graph.assumptions.map((s) => `  ${s}`),
    ...graph.blockers.map((s) => `  BLOCKS EXPORT: ${s}`),
  ];
}
