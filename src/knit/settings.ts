// Knit program settings: defaults and bounded validation for project files.
import type { KnitCellRule, KnitSettings } from '../core/types';
import { MAX_GRAPH_CELLS } from '../core/limits';
import { PRESET_KEYS } from './keys';
import { DEFAULT_LIMITS } from './checks';
import { MAX_SIDE } from './grid';

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

/** Validated copy of knit settings; throws a descriptive Error. */
export function validateKnitSettings(value: unknown): KnitSettings {
  const s = obj(value, 'knit settings');
  const keyId = pick(
    s.keyId,
    'knit key',
    PRESET_KEYS.map((k) => k.id)
  );
  const size = obj(s.size, 'program size');
  const source = pick(size.source, 'program size source', ['gauge', 'typed'] as const);
  const cells = obj(s.cells, 'cell assignment');
  const overrides = obj(cells.overrides, 'cell overrides');
  if (Object.keys(overrides).length > MAX_GRAPH_CELLS) throw new Error('too many cell overrides.');
  const edges = obj(s.edges, 'edge lines');
  const nodes = obj(s.nodes, 'node marks');
  const limits = obj(s.limits, 'check limits');
  const lab = obj(s.lab, 'lab rules');
  if (typeof s.autoTransfers !== 'boolean')
    throw new Error('automatic transfers must be on or off.');
  if (typeof edges.boundary !== 'boolean') throw new Error('boundary lines must be on or off.');
  return {
    mode: pick(s.mode, 'knit mode', ['network', 'shape', 'both'] as const),
    keyId,
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
