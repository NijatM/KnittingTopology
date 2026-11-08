// Knit program settings: defaults and bounded validation for project files.
import type { KnitCellRule, KnitPatch, KnitPatchLayout, KnitSettings } from '../core/types';
import { MAX_GRAPH_CELLS, MAX_GRAPH_EDGES } from '../core/limits';
import { PRESET_KEYS, settingsKey, validateKeys } from './keys';
import { structuresForKey } from './structures';
import { DEFAULT_LIMITS } from './checks';
import { MAX_SIDE } from './grid';
import { validateTiles } from './tiles';
import { POPESCU_LIMITS, validateKnitGraph } from './knit-graph';
import { MAX_SPLITS, patchCount, sharedEdges, splitProblem } from './patches';

export const MAX_LINE_LOOPS = 40;
export const MAX_PALETTE = 8;
export const SIDE_CLASSES = ['3', '4', '5', '6+'] as const;

export function defaultKnitSettings(): KnitSettings {
  return {
    mode: 'network',
    keyId: '4s52-basic',
    size: { source: 'gauge' },
    cells: { fill: 'jersey', rule: { kind: 'uniform' }, overrides: {} },
    edges: { structure: 'reverse', width: 2, boundary: false },
    nodes: { structure: null, size: 3, extraordinary: null },
    autoTransfers: true,
    limits: { ...DEFAULT_LIMITS },
    lab: { firstPass: 'left-to-right', transferTiming: 'after-row', travel: 'same-stroke' },
  };
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error(`${name} must be an object.`);
  return v as Record<string, unknown>;
}
function int(v: unknown, name: string, low: number, high: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < low || v > high)
    throw new Error(`${name} must be an integer from ${low} to ${high}.`);
  return v;
}
function pick<T extends string>(v: unknown, name: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T))
    throw new Error(`${name} is unsupported.`);
  return v as T;
}
function id(v: unknown, name: string): string {
  if (typeof v !== 'string' || !v.length || v.length > 64)
    throw new Error(`${name} must be a structure id.`);
  return v;
}
const idOrNull = (v: unknown, name: string) => (v === null ? null : id(v, name));
function palette(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_PALETTE)
    throw new Error(`${name} must list 1 to ${MAX_PALETTE} structures.`);
  return v.map((s, i) => id(s, `${name}[${i}]`));
}

function rule(v: unknown): KnitCellRule {
  const r = obj(v, 'cell rule');
  const kind = pick(r.kind, 'cell rule', ['uniform', 'sides', 'coarse', 'alternating'] as const);
  if (kind === 'uniform') return { kind };
  if (kind === 'sides') {
    const by = obj(r.bySides, 'side rule');
    const bySides: Record<string, string> = {};
    for (const [k, s] of Object.entries(by)) {
      pick(k, 'side class', SIDE_CLASSES);
      bySides[k] = id(s, `side ${k} structure`);
    }
    return { kind, bySides };
  }
  return { kind, palette: palette(r.palette, `${kind} palette`) };
}

function popescuOf(value: unknown): NonNullable<KnitSettings['popescu']> {
  const popescu = obj(value, 'Popescu rule settings'),
    angleTolerance = popescu.angleTolerance;
  if (
    typeof angleTolerance !== 'number' ||
    !Number.isFinite(angleTolerance) ||
    angleTolerance < POPESCU_LIMITS.angleTolerance[0] ||
    angleTolerance > POPESCU_LIMITS.angleTolerance[1]
  )
    throw new Error(
      `angle tolerance must be ${POPESCU_LIMITS.angleTolerance[0]}–${POPESCU_LIMITS.angleTolerance[1]} degrees.`
    );
  return {
    resultCount: int(popescu.resultCount, 'result count', ...POPESCU_LIMITS.resultCount),
    angleTolerance,
  };
}
const COURSE_METHODS = ['project-alignment', 'popescu-2019-rules'] as const;
const START_EDGES = ['v0', 'u1', 'v1', 'u0'] as const;
/** Computational patch layout (§6.3.2): bounded split lists and one entry per grid patch. */
function patchLayoutOf(value: unknown): KnitPatchLayout {
  const layout = obj(value, 'patch layout');
  pick(layout.kind, 'patch layout kind', ['chart-grid'] as const);
  const splits = (v: unknown, axis: string) => {
    if (!Array.isArray(v) || v.length > MAX_SPLITS)
      throw new Error(`${axis} splits must be a list of at most ${MAX_SPLITS} values.`);
    const out: number[] = [];
    for (const x of v) {
      const problem = typeof x === 'number' ? splitProblem(out, x) : 'A split must be a number.';
      if (problem) throw new Error(`${axis} splits: ${problem}`);
      if (out.length && x <= out.at(-1)!) throw new Error(`${axis} splits must increase.`);
      out.push(x as number);
    }
    return out;
  };
  const u = splits(layout.u, 'u'),
    v = splits(layout.v, 'v');
  if (!u.length && !v.length) throw new Error('a patch layout needs at least one split.');
  if (!Array.isArray(layout.patches) || layout.patches.length !== patchCount({ u, v }))
    throw new Error('the patch list does not match the split lines.');
  return {
    kind: 'chart-grid',
    u,
    v,
    patches: layout.patches.map((value, i): KnitPatch => {
      const p = obj(value, `patch P${i + 1}`);
      return {
        startEdge: pick(p.startEdge, `patch P${i + 1} start edge`, START_EDGES),
        fill: id(p.fill, `patch P${i + 1} fill`),
        ...(p.courseMethod === undefined
          ? {}
          : {
              courseMethod: pick(p.courseMethod, `patch P${i + 1} course method`, COURSE_METHODS),
            }),
        ...(p.popescu === undefined ? {} : { popescu: popescuOf(p.popescu) }),
        ...(p.graph === undefined ? {} : { graph: validateKnitGraph(p.graph) }),
      };
    }),
    ...(layout.through === undefined ? {} : { through: throughOf(layout.through, { u, v }) }),
  };
}
/** Knitted-through edges: distinct IDs of shared edges of the layout. */
function throughOf(value: unknown, layout: Pick<KnitPatchLayout, 'u' | 'v'>): string[] {
  const edges = new Set(sharedEdges(layout).map((e) => e.id));
  if (!Array.isArray(value)) throw new Error('knitted-through edges must be a list.');
  const out: string[] = [];
  for (const x of value) {
    if (typeof x !== 'string' || !edges.has(x))
      throw new Error(`knitted-through edge ${String(x)} is not a shared edge of the layout.`);
    if (out.includes(x)) throw new Error(`knitted-through edge ${x} is listed twice.`);
    out.push(x);
  }
  return out;
}

/** Validated copy of knit settings; throws a descriptive Error. */
export function validateKnitSettings(value: unknown): KnitSettings {
  const s = obj(value, 'knit settings');
  const keys = s.keys === undefined ? undefined : validateKeys(s.keys);
  const keyId = pick(s.keyId, 'knit key', [
    ...PRESET_KEYS.map((k) => k.id),
    ...(keys ?? []).map((k) => k.id),
  ]);
  const size = obj(s.size, 'program size');
  const source = pick(size.source, 'program size source', ['gauge', 'typed'] as const);
  const cells = obj(s.cells, 'cell assignment');
  const overrides = obj(cells.overrides, 'cell overrides');
  if (Object.keys(overrides).length > MAX_GRAPH_CELLS) throw new Error('too many cell overrides.');
  const edges = obj(s.edges, 'edge lines');
  const nodes = obj(s.nodes, 'node marks');
  const limits = obj(s.limits, 'check limits');
  const lab = obj(s.lab, 'lab rules');
  const cut = s.cut === undefined ? undefined : obj(s.cut, 'cut settings');
  if (cut) {
    if (
      typeof cut.surfaceRevision !== 'string' ||
      !cut.surfaceRevision.length ||
      cut.surfaceRevision.length > 200 ||
      typeof cut.sourceSignature !== 'string' ||
      !/^cut-source-fnv1a32:[0-9a-f]{8}$/.test(cut.sourceSignature)
    )
      throw new Error('cut source revision/signature is invalid.');
    if (
      !Array.isArray(cut.edgeIds) ||
      cut.edgeIds.length > MAX_GRAPH_EDGES ||
      cut.edgeIds.some((v) => typeof v !== 'string' || !v.length || v.length > 400) ||
      new Set(cut.edgeIds).size !== cut.edgeIds.length
    )
      throw new Error('cut edge IDs must be unique bounded source IDs.');
  }
  const popescu = s.popescu === undefined ? undefined : popescuOf(s.popescu);
  if (typeof s.autoTransfers !== 'boolean')
    throw new Error('automatic transfers must be on or off.');
  if (typeof edges.boundary !== 'boolean') throw new Error('boundary lines must be on or off.');
  return {
    mode: pick(s.mode, 'knit mode', ['network', 'shape', 'both'] as const),
    ...(s.startEdge === undefined
      ? {}
      : { startEdge: pick(s.startEdge, 'start edge', ['v0', 'u1', 'v1', 'u0'] as const) }),
    ...(s.newLoop === undefined
      ? {}
      : { newLoop: pick(s.newLoop, 'new loop action', ['knit', 'tuck'] as const) }),
    ...(s.courseMethod === undefined
      ? {}
      : {
          courseMethod: pick(s.courseMethod, 'course method', [
            'project-alignment',
            'popescu-2019-rules',
          ] as const),
        }),
    ...(popescu ? { popescu } : {}),
    ...(s.graph === undefined ? {} : { graph: validateKnitGraph(s.graph) }),
    ...(s.patches === undefined ? {} : { patches: patchLayoutOf(s.patches) }),
    keyId,
    ...(cut
      ? {
          cut: {
            surfaceRevision: cut.surfaceRevision as string,
            sourceSignature: cut.sourceSignature as string,
            preset: pick(cut.preset, 'cut preset', [
              'cube-cross',
              'sphere-meridian',
              'manual',
            ] as const),
            edgeIds: [...(cut.edgeIds as string[])],
          },
        }
      : {}),
    ...(keys === undefined ? {} : { keys }),
    ...(s.tiles === undefined ? {} : { tiles: validateTiles(s.tiles, keys) }),
    size:
      source === 'gauge'
        ? { source }
        : {
            source,
            needles: int(size.needles, 'needles', 1, MAX_SIDE),
            passes: int(size.passes, 'passes', 1, MAX_SIDE),
          },
    cells: {
      fill: id(cells.fill, 'cell fill'),
      rule: rule(cells.rule),
      overrides: Object.fromEntries(
        Object.entries(overrides).map(([cell, st]) => {
          if (!cell.length || cell.length > 200) throw new Error('cell override id is invalid.');
          return [cell, id(st, `override for ${cell}`)];
        })
      ),
    },
    edges: {
      structure: idOrNull(edges.structure, 'edge structure'),
      width: int(edges.width, 'edge width', 1, MAX_LINE_LOOPS),
      boundary: edges.boundary,
    },
    nodes: {
      structure: idOrNull(nodes.structure, 'node structure'),
      size: int(nodes.size, 'node mark size', 1, MAX_LINE_LOOPS),
      extraordinary: idOrNull(nodes.extraordinary, 'extraordinary node structure'),
    },
    autoTransfers: s.autoTransfers,
    limits: {
      float: int(limits.float, 'float limit', 0, MAX_SIDE),
      held: int(limits.held, 'held-loop limit', 0, MAX_SIDE),
      tucks: int(limits.tucks, 'tuck limit', 0, MAX_SIDE),
    },
    lab: {
      firstPass: pick(lab.firstPass, 'first pass', ['left-to-right', 'right-to-left'] as const),
      transferTiming: pick(lab.transferTiming, 'transfer timing', [
        'after-row',
        'per-needle',
      ] as const),
      travel: pick(lab.travel, 'yarn guide travel', ['same-stroke', 'two-strokes'] as const),
    },
  };
}

/**
 * Settings with another key. Cell assignments whose structure is unavailable with that key move to its fill
 * (the current fill if available, otherwise its first structure); edge lines and node marks are switched off.
 * `reset` counts the changed assignments.
 */
export function withKey(s: KnitSettings, keyId: string): { settings: KnitSettings; reset: number } {
  const library = structuresForKey(settingsKey({ keyId, keys: s.keys }), s.tiles, s.keys),
    has = (id: string) => library.some((x) => x.id === id),
    fill = has(s.cells.fill) ? s.cells.fill : library[0]!.id;
  let reset = 0;
  const keep = (id: string) => (has(id) ? id : (reset++, fill));
  const keepOrOff = (id: string | null) => (id === null || has(id) ? id : (reset++, null));
  if (fill !== s.cells.fill) reset++;
  const r = s.cells.rule;
  const rule: KnitCellRule =
    r.kind === 'sides'
      ? {
          kind: r.kind,
          bySides: Object.fromEntries(Object.entries(r.bySides).map(([k, v]) => [k, keep(v)])),
        }
      : r.kind === 'uniform'
        ? r
        : { kind: r.kind, palette: r.palette.map(keep) };
  return {
    settings: {
      ...s,
      keyId,
      cells: {
        fill,
        rule,
        overrides: Object.fromEntries(
          Object.entries(s.cells.overrides).map(([k, v]) => [k, keep(v)])
        ),
      },
      edges: { ...s.edges, structure: keepOrOff(s.edges.structure) },
      nodes: {
        ...s.nodes,
        structure: keepOrOff(s.nodes.structure),
        extraordinary: keepOrOff(s.nodes.extraordinary),
      },
    },
    reset,
  };
}
