import type {
  ProjectState,
  SurfaceSpec,
  PatternParameters,
  PatternGraph,
  Vec3,
  Diagnostic,
} from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import { createCitationRecord } from '../adapters/citations';
import {
  MAX_GRAPH_CELLS,
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  MAX_PROJECT_CHARACTERS,
  MAX_SUBDIVISIONS,
  MAX_PATCH_SIDE_COUNT,
} from '../core/limits';

export const DEFAULT_PARAMETERS: PatternParameters = {
  strategy: 'patch-grid',
  spacing: 0.014,
  orientation: 0,
  guideStrength: 0.65,
  relaxation: 0.35,
  preset: 'regular',
  family: 'quad',
  seed: 17,
  patchSides: 4,
  boundaryCounts: [10, 10, 10, 10],
  variant: 0,
};
export function createProject(): ProjectState {
  return {
    schemaVersion: '1.0.0',
    name: 'Untitled surface',
    surface: { kind: 'sphere', size: 0.18, curvature: 0.45, revision: 'surface-1' },
    parameters: { ...DEFAULT_PARAMETERS, boundaryCounts: [...DEFAULT_PARAMETERS.boundaryCounts] },
    guides: [],
    graph: null,
    diagnostics: [],
    statistics: null,
    revision: 0,
  };
}
export function geometryChange(state: ProjectState, change: Partial<SurfaceSpec>): ProjectState {
  return {
    ...state,
    surface: { ...state.surface, ...change, revision: `surface-${crypto.randomUUID()}` },
    parameters: { ...state.parameters, stripOverrides: undefined },
    guides: [],
    graph: null,
    diagnostics: [],
    statistics: null,
  };
}
export function parametersMatchGraph(state: ProjectState): boolean {
  if (!state.graph || state.graph.provenance.surfaceRevision !== state.surface.revision)
    return false;
  if (state.graph.provenance.inputSignature)
    return state.graph.provenance.inputSignature === scientificSignature(state);
  return JSON.stringify(state.graph.provenance.parameters) === JSON.stringify(state.parameters);
}
export function scientificSignature(
  input: Pick<ProjectState, 'surface' | 'parameters' | 'guides'>
): string {
  const data = JSON.stringify({
    surface: input.surface,
    parameters: input.parameters,
    guides: input.guides,
  });
  let hash = 2166136261;
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${data.length}:${(hash >>> 0).toString(16)}`;
}
export function serializeProject(project: ProjectState): string {
  return JSON.stringify({
    format: 'knitting-topology',
    schemaVersion: '1.0.0',
    units: 'm',
    savedAt: new Date().toISOString(),
    project,
    methodRecord: createCitationRecord(project, !!project.graph && !parametersMatchGraph(project)),
  });
}

function fail(message: string): never {
  throw new Error(`Project file: ${message}`);
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function array(value: unknown, name: string, cap = MAX_GRAPH_NODES): unknown[] {
  if (!Array.isArray(value) || value.length > cap)
    fail(`${name} is missing or exceeds ${cap} entries.`);
  return value;
}
function text(value: unknown, name: string, cap = 1000): string {
  if (typeof value !== 'string' || !value.length || value.length > cap)
    fail(`${name} is not valid text.`);
  return value;
}
function finite(value: unknown, name: string, low = -1e6, high = 1e6): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
    fail(`${name} is outside its finite range.`);
  return value;
}
function vector(value: unknown, name: string, length: number): number[] {
  const v = array(value, name, length);
  if (v.length !== length) fail(`${name} has the wrong dimension.`);
  return v.map((item, i) => finite(item, `${name}[${i}]`));
}
function oneOf(value: unknown, name: string, allowed: string[]): void {
  if (typeof value !== 'string' || !allowed.includes(value)) fail(`${name} is unsupported.`);
}
function validateAttachment(value: unknown, revision: string): void {
  const a = object(value, 'attachment');
  if (a.surfaceRevision !== revision) fail('attachment belongs to another surface revision.');
  if (!Number.isInteger(a.patch) || Number(a.patch) < 0 || Number(a.patch) > 5)
    fail('attachment patch is invalid.');
  const uv = vector(a.uv, 'attachment.uv', 2);
  if (uv.some((n) => n < -1e-6 || n > 1 + 1e-6)) fail('attachment UV lies outside its chart.');
  if (a.faceId !== undefined && (!Number.isInteger(a.faceId) || Number(a.faceId) < 0))
    fail('attachment face ID is invalid.');
  if (a.barycentric !== undefined) {
    const b = vector(a.barycentric, 'barycentric', 3);
    if (
      b.some((n) => n < -1e-5 || n > 1 + 1e-5) ||
      Math.abs(b.reduce((s, n) => s + n, 0) - 1) > 1e-4
    )
      fail('barycentric coordinates are invalid.');
  }
}
function validateParameters(value: unknown): void {
  const p = object(value, 'parameters');
  oneOf(p.strategy, 'strategy', ['patch-grid', 'n-sided-patch']);
  oneOf(p.preset, 'topology preset', ['regular', 'inset', 'alternating', 'radial']);
  oneOf(p.family, 'pattern family', ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal']);
  finite(p.spacing, 'spacing', Number.MIN_VALUE, 10_000);
  finite(p.orientation, 'orientation', -3600, 3600);
  finite(p.guideStrength, 'guide strength', 0, 1);
  finite(p.relaxation, 'relaxation', 0, 1);
  finite(p.seed, 'seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(p.seed)) fail('seed must be a safe integer.');
  finite(p.variant, 'variant', 0, 1);
  if (!Number.isInteger(p.variant)) fail('variant must be an integer.');
  if (p.stripOverrides !== undefined) {
    const overrides = object(p.stripOverrides, 'strip overrides');
    if (Object.keys(overrides).length > 1000) fail('too many strip overrides.');
    for (const [id, count] of Object.entries(overrides)) {
      text(id, 'strip ID', 200);
      finite(count, 'strip subdivision', 1, MAX_SUBDIVISIONS);
      if (!Number.isInteger(count)) fail('strip subdivisions must be integers.');
    }
  }
  const sides = finite(p.patchSides, 'patch sides', 2, 6);
  if (!Number.isInteger(sides)) fail('patch sides must be an integer.');
  const counts = array(p.boundaryCounts, 'boundary counts', 6);
  if (counts.length !== sides) fail('boundary counts must match the number of patch sides.');
  counts.forEach((n) => {
    finite(n, 'boundary count', 1, MAX_PATCH_SIDE_COUNT);
    if (!Number.isInteger(n)) fail('boundary counts must be integers.');
  });
}

export function validateGraphRecord(
  value: unknown,
  surfaceRevision: string
): asserts value is PatternGraph {
  const graph = object(value, 'graph');
  const nodes = array(graph.nodes, 'nodes', MAX_GRAPH_NODES);
  const edges = array(graph.edges, 'edges', MAX_GRAPH_EDGES);
  const cells = array(graph.cells, 'cells', MAX_GRAPH_CELLS);
  const nodeIds = new Set<string>();
  const cellIds = new Set<string>();
  for (const item of nodes) {
    const node = object(item, 'node');
    const id = text(node.id, 'node ID', 180);
    if (nodeIds.has(id)) fail('duplicate node ID.');
    nodeIds.add(id);
    vector(node.position, 'node position', 3);
    validateAttachment(node.attachment, surfaceRevision);
    if (node.feature !== undefined)
      oneOf(node.feature, 'node feature', ['corner', 'crease', 'boundary', 'interior']);
  }
  for (const item of cells) {
    const cell = object(item, 'cell');
    const id = text(cell.id, 'cell ID', 180);
    if (cellIds.has(id)) fail('duplicate cell ID.');
    cellIds.add(id);
    const ids = array(cell.nodes, 'cell boundary', 1024);
    if (ids.length < 3 || new Set(ids).size !== ids.length) fail('cell boundary is degenerate.');
    if (ids.some((id) => typeof id !== 'string' || !nodeIds.has(id)))
      fail('cell references an unknown node.');
    finite(cell.patch, 'cell patch', 0, 5);
    if (!Number.isInteger(cell.patch)) fail('cell patch must be an integer.');
  }
  const edgeIds = new Set<string>();
  for (const item of edges) {
    const edge = object(item, 'edge');
    const id = text(edge.id, 'edge ID', 400);
    if (edgeIds.has(id)) fail('duplicate edge ID.');
    edgeIds.add(id);
    if (
      typeof edge.a !== 'string' ||
      !nodeIds.has(edge.a) ||
      typeof edge.b !== 'string' ||
      !nodeIds.has(edge.b) ||
      edge.a === edge.b
    )
      fail('edge endpoints are invalid.');
    const adjacent = array(edge.cells, 'edge adjacency', 16);
    if (
      new Set(adjacent).size !== adjacent.length ||
      adjacent.some((id) => typeof id !== 'string' || !cellIds.has(id))
    )
      fail('edge adjacency is invalid.');
    if (edge.path !== undefined)
      array(edge.path, 'edge path', 1024).forEach((point) => vector(point, 'edge sample', 3));
    if (edge.feature !== undefined)
      oneOf(edge.feature, 'edge feature', ['crease', 'boundary', 'seam']);
  }
  for (const item of array(graph.coarsePatches, 'coarse patches', 12000)) {
    const patch = object(item, 'coarse patch');
    text(patch.id, 'patch ID', 180);
    array(patch.corners, 'patch corners', 128).forEach((p) => vector(p, 'patch corner', 3));
    array(patch.subdivisions, 'patch subdivisions', 128).forEach((n) =>
      finite(n, 'patch subdivision', 0, 100000)
    );
    text(patch.template, 'patch template');
    finite(patch.patch, 'coarse patch', 0, 5);
    if (!Number.isInteger(patch.patch)) fail('coarse patch index must be an integer.');
  }
  const provenance = object(graph.provenance, 'provenance');
  text(provenance.algorithm, 'algorithm');
  text(provenance.version, 'algorithm version');
  text(provenance.scope, 'algorithm scope', 20000);
  if (provenance.surfaceRevision !== surfaceRevision)
    fail('graph belongs to another surface revision.');
  validateParameters(provenance.parameters);
  array(provenance.sources, 'sources', 100).forEach((s) => text(s, 'source', 5000));
  array(provenance.notes, 'notes', 1000).forEach((s) => text(s, 'note', 20000));
  finite(provenance.seed, 'provenance seed', Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (provenance.inputSignature !== undefined)
    text(provenance.inputSignature, 'input signature', 100);
  if (graph.coarseTopology !== undefined) {
    const coarse = object(graph.coarseTopology, 'coarse topology');
    validateGraphRecord(
      {
        nodes: coarse.nodes,
        edges: coarse.edges,
        cells: coarse.cells,
        coarsePatches: [],
        provenance: graph.provenance,
      },
      surfaceRevision
    );
    const coarseEdgeIds = new Set((coarse.edges as { id: string }[]).map((e) => e.id));
    const seenStrips = new Set<string>();
    for (const item of array(coarse.strips, 'coarse strips', 12000)) {
      const strip = object(item, 'strip');
      const id = text(strip.id, 'strip ID', 200);
      if (seenStrips.has(id)) fail('duplicate strip ID.');
      seenStrips.add(id);
      if (typeof strip.closed !== 'boolean') fail('strip closed flag must be boolean.');
      const count = finite(strip.subdivisions, 'strip subdivisions', 1, MAX_SUBDIVISIONS);
      if (!Number.isInteger(count)) fail('strip subdivisions must be integers.');
      const edgeIds = array(strip.edgeIds, 'strip edges', 12000);
      if (
        new Set(edgeIds).size !== edgeIds.length ||
        edgeIds.some((id) => typeof id !== 'string' || !coarseEdgeIds.has(id))
      )
        fail('strip references invalid coarse edges.');
    }
  }
}

export function parseProject(contents: string): ProjectState {
  if (contents.length > MAX_PROJECT_CHARACTERS) fail('file exceeds the 64 MB text limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    fail('invalid JSON.');
  }
  const file = object(parsed, 'file');
  if (file.format !== 'knitting-topology' || file.schemaVersion !== '1.0.0' || file.units !== 'm')
    fail('unsupported format, schema version, or units.');
  const state = object(file.project, 'project');
  if (state.schemaVersion !== '1.0.0') fail('unsupported project schema version.');
  text(state.name, 'project name', 200);
  const surface = object(state.surface, 'surface');
  oneOf(surface.kind, 'surface kind', ['plane', 'cube', 'sphere', 'saddle']);
  finite(surface.size, 'surface size', 1e-6, 1000);
  finite(surface.curvature, 'surface curvature', -2, 2);
  const revision = text(surface.revision, 'surface revision', 180);
  validateParameters(state.parameters);
  for (const item of array(state.guides, 'guide strokes', 1000)) {
    const guide = object(item, 'guide');
    text(guide.id, 'guide ID', 180);
    finite(guide.strength, 'stroke strength', 0, 1);
    const samples = array(guide.samples, 'guide samples', 10000);
    if (samples.length < 2) fail('guide needs at least two samples.');
    for (const item of samples) {
      const sample = object(item, 'sample');
      vector(sample.position, 'sample position', 3);
      validateAttachment(sample.attachment, revision);
      const attachment = sample.attachment as { patch: number; uv: [number, number] };
      const maxPatch = surface.kind === 'cube' || surface.kind === 'sphere' ? 5 : 0;
      if (attachment.patch > maxPatch) fail('guide patch does not exist on this surface.');
      const expected = evaluateSurface(
        surface as unknown as SurfaceSpec,
        attachment.patch,
        ...attachment.uv
      );
      const position = sample.position as number[];
      if (Math.hypot(...expected.map((n, i) => n - position[i]!)) > Number(surface.size) * 1e-6)
        fail('guide position does not match its surface attachment.');
    }
  }
  if (state.graph !== null) validateGraphRecord(state.graph, revision);
  finite(state.revision, 'project revision', 0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(state.revision)) fail('project revision must be an integer.');
  // Derived diagnostics/statistics from disk are not trusted; the caller recomputes them.
  const project: ProjectState = {
    schemaVersion: '1.0.0',
    name: state.name as string,
    surface: surface as unknown as SurfaceSpec,
    parameters: state.parameters as unknown as PatternParameters,
    guides: state.guides as ProjectState['guides'],
    graph: state.graph as PatternGraph | null,
    revision: state.revision as number,
    diagnostics: [],
    statistics: null,
  };
  // A project may preserve requested settings that the selected generator cannot
  // satisfy yet (e.g. odd boundary counts). Generation checks those preconditions;
  // loading checks data domains and topology without discarding design intent.
  return project;
}

export interface HistoryState {
  past: ProjectState[];
  present: ProjectState;
  future: ProjectState[];
  coalesceKey?: string;
}
export type HistoryAction =
  | { type: 'commit'; next: ProjectState; coalesceKey?: string }
  | { type: 'accept-result'; signature: string; result: import('../core/types').GenerationResult }
  | { type: 'end-coalesce' }
  | { type: 'undo' }
  | { type: 'redo' };
function trimHistory(states: ProjectState[]): ProjectState[] {
  const selected: ProjectState[] = [];
  const graphs = new Set<PatternGraph>();
  let entities = 0;
  for (let i = states.length - 1; i >= 0 && selected.length < 35; i--) {
    const state = states[i]!;
    const graph = state.graph;
    if (graph && !graphs.has(graph)) {
      const cost = graph.nodes.length + graph.edges.length + graph.cells.length;
      if (graphs.size >= 6 || (graphs.size > 0 && entities + cost > 350_000)) break;
      graphs.add(graph);
      entities += cost;
    }
    selected.unshift(state);
  }
  return selected;
}
export function historyReducer(history: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === 'end-coalesce') return { ...history, coalesceKey: undefined };
  if (action.type === 'accept-result') {
    if (scientificSignature(history.present) !== action.signature) return history;
    return {
      past: trimHistory([...history.past, history.present]),
      present: { ...history.present, ...action.result, revision: history.present.revision + 1 },
      future: [],
    };
  }
  if (action.type === 'commit') {
    const coalescing = action.coalesceKey && action.coalesceKey === history.coalesceKey;
    return {
      past: coalescing ? history.past : trimHistory([...history.past, history.present]),
      present: { ...action.next, revision: history.present.revision + 1 },
      future: [],
      coalesceKey: action.coalesceKey,
    };
  }
  if (action.type === 'undo' && history.past.length) {
    return {
      past: history.past.slice(0, -1),
      present: { ...history.past[history.past.length - 1], revision: history.present.revision + 1 },
      future: trimHistory([...history.future].reverse().concat(history.present)).reverse(),
    };
  }
  if (action.type === 'redo' && history.future.length) {
    return {
      past: trimHistory([...history.past, history.present]),
      present: { ...history.future[0], revision: history.present.revision + 1 },
      future: history.future.slice(1),
    };
  }
  return history;
}

export function displayDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.label}: ${diagnostic.message}`;
}
export function midpoint(points: Vec3[]): Vec3 {
  if (!points.length) return [0, 0, 0];
  return points.reduce<Vec3>(
    (s, p) => [
      s[0] + p[0] / points.length,
      s[1] + p[1] / points.length,
      s[2] + p[2] / points.length,
    ],
    [0, 0, 0]
  );
}
