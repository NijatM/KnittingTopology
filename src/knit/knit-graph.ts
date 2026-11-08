// Knit graph stages after Popescu (2019), §6.3 (pp. 105–112): the courses stage and the loops stage of a
// measured course layout, saved in the project and as stage files. Fingerprints are noncryptographic
// freshness checks of the stage inputs, not security hashes.
import type {
  KnitCourseEditOp,
  KnitCourseMethod,
  KnitCourseStage,
  KnitGraphStages,
  KnitLoopRole,
  KnitLoopStage,
  KnitSettings,
  KnitStageCourse,
  KnitStagePoint,
  ProjectState,
  SurfaceSpec,
} from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import { gaugeOf, GAUGE_REFERENCE } from './gauge';
import { knitAvailable } from './mapping';
import { shapeCourseLoops, shapeLengths } from './shape-geometry';
import type { ShapeCourse, ShapeGeometry, ShapeNeedles, ShapePoint } from './shape-types';
import { TURN_PAIRING_RULE } from './turn-pairing';

export const COURSE_METHODS: Record<KnitCourseMethod, { label: string; note: string }> = {
  'project-alignment': {
    label: 'Project alignment (default)',
    note: 'Distance contours joined by minimum-cost monotone alignment; a project adaptation of Popescu (2019), §§6.2.2–6.2.3.',
  },
  'popescu-2019-rules': {
    label: 'Popescu connection rules',
    note: 'The connection rules written in Popescu (2019), §§6.2.2–6.2.3, reconstructed from the thesis text, not from compas_knit. Open surfaces only.',
  },
};
/** Thesis minimum of four candidates per side (p. 99) and its 5° example (p. 101). */
export const POPESCU_DEFAULTS = { resultCount: 4, angleTolerance: 5 } as const;
export const POPESCU_LIMITS = { resultCount: [4, 16], angleTolerance: [0, 45] } as const;
/** Stage formats; a change here makes earlier stages stale. */
const STAGE_VERSION: Record<KnitCourseMethod, string> = {
  'project-alignment': 'project-alignment-v3',
  'popescu-2019-rules': 'popescu-2019-rules-v1',
};
export const STAGE_FILE_FORMAT = 'knit-graph-stage';
const MAX_STAGE_ITEMS = 400_000;
export const MAX_STAGE_EDITS = 10_000;
const EDIT_OPS: KnitCourseEditOp[] = [
  'move-vertex',
  'add-vertex',
  'delete-vertex',
  'add-link',
  'delete-link',
  'reattach-link',
  'move-point',
  'insert-point',
  'delete-point',
  'delete-course',
  'add-course',
];

export const courseMethodOf = (settings: Pick<KnitSettings, 'courseMethod'>): KnitCourseMethod =>
  settings.courseMethod ?? 'project-alignment';
export const popescuSettingsOf = (settings: Pick<KnitSettings, 'popescu'>) =>
  settings.popescu ?? { ...POPESCU_DEFAULTS };

function fnv1a(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
const hash = (text: string) => fnv1a(text, 0x811c9dc5) + fnv1a(text, 0x9747b28c);
const contentHashes = new WeakMap<object, string>();
/** JSON with sorted object keys: a stage hashes the same after a project save and reload. */
const canonicalJson = (value: unknown) =>
  JSON.stringify(value, (_, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]])
        )
      : v
  );
/** Hash of a stage's content, without its own fingerprint. */
export function stageContentHash(stage: KnitCourseStage | KnitLoopStage): string {
  let value = contentHashes.get(stage);
  if (!value) {
    value = hash(canonicalJson({ ...stage, fingerprint: '' }));
    contentHashes.set(stage, value);
  }
  return value;
}
const closedSurface = (surface: Pick<SurfaceSpec, 'kind'>) =>
  surface.kind === 'cube' || surface.kind === 'sphere';

/** Fingerprint of the courses-stage inputs: surface and chart, start edge, cut, loop dimensions, method. */
export function courseStageFingerprint(
  surface: SurfaceSpec,
  settings: KnitSettings,
  gauge: { stitchWidth: number; courseHeight: number }
): string {
  const method = courseMethodOf(settings),
    closed = closedSurface(surface);
  return `courses-${hash(
    JSON.stringify([
      STAGE_VERSION[method],
      surface.kind,
      surface.size,
      surface.curvature,
      surface.revision,
      surface.mapping ?? null,
      settings.startEdge ?? 'v0',
      closed ? (settings.cut ?? null) : null,
      gauge.stitchWidth,
      gauge.courseHeight,
      method === 'popescu-2019-rules' ? popescuSettingsOf(settings) : null,
      closed ? settings.lab.firstPass : null,
    ])
  )}`;
}
/** Fingerprint of the loops-stage inputs: the courses stage it was built from and the first pass. */
export function loopStageFingerprint(courses: KnitCourseStage, settings: KnitSettings): string {
  // The project method's loops include the short-row turn pairing rule; a new rule version makes them stale.
  const rule = courseMethodOf(settings) === 'project-alignment' ? [TURN_PAIRING_RULE] : [];
  return `loops-${hash(
    JSON.stringify([
      courses.fingerprint,
      stageContentHash(courses),
      settings.lab.firstPass,
      ...rule,
    ])
  )}`;
}

export type StageState = 'fresh' | 'stale' | 'missing';
export interface KnitGraphFreshness {
  method: KnitCourseMethod;
  courses: StageState;
  loops: StageState;
  expectedCourses: string;
}
/** Null when the current settings do not use a measured course layout. */
export function knitGraphFreshness(
  project: Pick<ProjectState, 'surface' | 'knit' | 'swatches'>
): KnitGraphFreshness | null {
  const settings = project.knit;
  if (!settings || !knitAvailable(project.surface)) return null;
  if (settings.mode === 'network' && settings.size.source !== 'gauge') return null;
  const swatches = project.swatches ?? [],
    jersey = gaugeOf(GAUGE_REFERENCE, swatches),
    gauge = gaugeOf(settings.cells.fill, swatches);
  if (!jersey || jersey.assumed || !gauge) return null;
  const expectedCourses = courseStageFingerprint(project.surface, settings, gauge),
    graph = settings.graph,
    method = courseMethodOf(settings);
  if (!graph) return { method, courses: 'missing', loops: 'missing', expectedCourses };
  const courses =
    graph.courseMethod === method && graph.courses.fingerprint === expectedCourses
      ? 'fresh'
      : 'stale';
  const loops = !graph.loops
    ? 'missing'
    : courses === 'fresh' &&
        graph.loops.fingerprint === loopStageFingerprint(graph.courses, settings)
      ? 'fresh'
      : 'stale';
  return { method, courses, loops, expectedCourses };
}
/** Saved stages without the stale ones: a stale courses stage also invalidates its loops. */
export function freshStages(
  project: Pick<ProjectState, 'surface' | 'knit' | 'swatches'>
): KnitGraphStages | undefined {
  const state = knitGraphFreshness(project),
    graph = project.knit?.graph;
  if (!state || !graph || state.courses !== 'fresh') return undefined;
  return state.loops === 'fresh'
    ? graph
    : { courseMethod: graph.courseMethod, courses: graph.courses };
}
/** Export blocker for saved stages whose inputs changed. Generate replaces them, except an edited
 * courses stage, which is kept until the user discards its edits. */
export function staleStagesBlocker(
  project: Pick<ProjectState, 'surface' | 'knit' | 'swatches'>
): string | null {
  const state = project.knit?.graph ? knitGraphFreshness(project) : null;
  if (!state || (state.courses !== 'stale' && state.loops !== 'stale')) return null;
  return state.courses === 'stale' && project.knit?.graph?.courses.edits?.length
    ? 'Knit graph: the edited courses stage is stale (its inputs changed); download it or discard its edits.'
    : 'Saved knit graph stages are stale: their inputs changed. Generate to replace them.';
}
/** Identity of the saved courses stage: method, inputs and content (edits change it). */
export function courseStageKey(graph: KnitGraphStages | undefined): string {
  return graph
    ? `${graph.courseMethod}:${graph.courses.fingerprint}:${stageContentHash(graph.courses)}`
    : '';
}
/** Signature of saved stages for preview freshness; content changes are included. */
export function knitGraphSignature(graph: KnitGraphStages | undefined): string {
  if (!graph) return '';
  return [
    graph.courseMethod,
    graph.courses.fingerprint,
    stageContentHash(graph.courses),
    graph.loops?.fingerprint ?? '',
    graph.loops ? stageContentHash(graph.loops) : '',
  ].join(':');
}

export function stagePoint(p: ShapePoint): KnitStagePoint {
  return {
    uv: [p.uv[0], p.uv[1]],
    across: p.across,
    ...(p.patch !== undefined ? { patch: p.patch } : {}),
    ...(p.net ? { net: [p.net[0], p.net[1]] as [number, number] } : {}),
  };
}
/** Courses stage of the project method (open surfaces) or of a closed-surface layout. */
export function courseStageFromGeometry(
  fingerprint: string,
  geometry: ShapeGeometry
): KnitCourseStage {
  const g = geometry.graph,
    vertices: KnitCourseStage['vertices'] = [];
  const base = {
    stage: 'courses' as const,
    fingerprint,
    method: geometry.method,
    contourRounding: [...geometry.contourRounding],
    maxLinkOffset: geometry.maxLinkOffset,
    resolution: geometry.resolution,
    issues: [...geometry.issues],
  };
  if (!g)
    return {
      ...base,
      vertices,
      links: [],
      courses: geometry.courses.map((c) => ({
        vertices: [],
        points: c.points.map(stagePoint),
        leftBoundary: c.leftBoundary,
        rightBoundary: c.rightBoundary,
      })),
    };
  const valency = new Map<number, number>();
  for (const [a, b] of g.links) {
    valency.set(a, (valency.get(a) ?? 0) + 1);
    valency.set(b, (valency.get(b) ?? 0) + 1);
  }
  g.samples.forEach((samples, contour) =>
    samples.forEach((p, position) =>
      vertices.push({
        ...stagePoint(p),
        contour,
        position,
        leaf: position === 0 || position === samples.length - 1,
        end:
          contour === 0 ||
          contour === g.samples.length - 1 ||
          (valency.get(vertices.length) ?? 0) > 2,
      })
    )
  );
  return {
    ...base,
    vertices,
    links: g.links.map(([a, b]) => [a, b]),
    courses: geometry.courses.map((c, k) => ({
      vertices: [...g.courses[k]!],
      start: stagePoint(c.points[0]!),
      end: stagePoint(c.points.at(-1)!),
      leftBoundary: c.leftBoundary,
      rightBoundary: c.rightBoundary,
    })),
  };
}
/** Loop roles from a needle layout: operation roles first, then short-row ends. */
function placementRoles(geometry: ShapeGeometry, needles: ShapeNeedles): Map<string, KnitLoopRole> {
  const roles = new Map<string, KnitLoopRole>();
  for (const c of geometry.courses) {
    if (c.turnStart) roles.set(c.loops[0]!.id, 'short-row');
    if (c.turnEnd) roles.set(c.loops.at(-1)!.id, 'short-row');
  }
  for (const p of needles.placements)
    if (p.role === 'increase' || p.role === 'edge increase') roles.set(p.loop.id, 'increase');
    else if (p.role === 'decrease') roles.set(p.loop.id, 'decrease');
  return roles;
}
export function loopStageFromNeedles(
  fingerprint: string,
  geometry: ShapeGeometry,
  needles: ShapeNeedles,
  roles = placementRoles(geometry, needles)
): KnitLoopStage {
  const parents = new Map(needles.placements.map((p) => [p.loop.id, p.parents]));
  return {
    stage: 'loops',
    fingerprint,
    method: geometry.method,
    loops: geometry.courses.flatMap((c) =>
      c.loops.map((loop) => ({
        ...stagePoint(loop),
        id: loop.id,
        course: c.index,
        role: roles.get(loop.id) ?? 'loop',
        parents: [...(parents.get(loop.id) ?? [])],
      }))
    ),
  };
}

/** Open-surface geometry from saved stages: 3D positions are recomputed from chart coordinates. With a
 * loops stage its loops and parent links are used as saved; without one, loops follow the course
 * polylines as in a fresh layout. */
export function geometryFromStages(
  surface: SurfaceSpec,
  courses: KnitCourseStage,
  loops: KnitLoopStage | undefined,
  stitchWidth: number,
  courseHeight: number
): { geometry: ShapeGeometry; fixedParents?: Map<string, string[]> } {
  if (closedSurface(surface)) throw new Error('Closed-surface layouts are rebuilt from their cut.');
  const point = (p: KnitStagePoint): ShapePoint => ({
    uv: [p.uv[0], p.uv[1]],
    position: evaluateSurface(surface, 0, p.uv[0], p.uv[1]),
    across: p.across,
  });
  const source: KnitStageCourse[] = loops?.rows ?? courses.courses;
  if (!source.length) throw new Error('The saved stages have no courses.');
  const byCourse = new Map<number, KnitLoopStage['loops']>();
  for (const l of loops?.loops ?? []) {
    const list = byCourse.get(l.course) ?? [];
    list.push(l);
    byCourse.set(l.course, list);
  }
  const courseRounding: number[] = [];
  const result: ShapeCourse[] = source.map((c, index) => {
    const points = (
      c.points ?? [c.start!, ...c.vertices.map((i) => courses.vertices[i]!), c.end!]
    ).map(point);
    let shaped: ShapeCourse['loops'], length: number;
    if (loops) {
      shaped = (byCourse.get(index) ?? []).map((l) => ({ ...point(l), id: l.id }));
      length = shapeLengths(points).at(-1)!;
      if (!shaped.length) throw new Error(`Saved course ${index + 1} has no loops.`);
    } else ({ loops: shaped, length } = shapeCourseLoops(surface, points, stitchWidth, index));
    courseRounding.push(length - shaped.length * stitchWidth);
    return {
      id: `course:${index}`,
      index,
      points,
      loops: shaped,
      extent: [points[0]!.across, points.at(-1)!.across],
      leftBoundary: c.leftBoundary,
      rightBoundary: c.rightBoundary,
      turnStart: !c.leftBoundary,
      turnEnd: !c.rightBoundary,
      length,
    };
  });
  const geometry: ShapeGeometry = {
    courses: result,
    contours: [],
    courseHeight,
    stitchWidth,
    contourRounding: [...courses.contourRounding],
    courseRounding,
    maxLinkOffset: courses.maxLinkOffset,
    resolution: courses.resolution,
    method: courses.method,
    issues: [...courses.issues],
  };
  return loops
    ? { geometry, fixedParents: new Map(loops.loops.map((l) => [l.id, [...l.parents]])) }
    : { geometry };
}

// ---- validation of saved records -------------------------------------------------------------
function fail(message: string): never {
  throw new Error(`knit graph: ${message}`);
}
function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${name} must be an object.`);
  return value as Record<string, unknown>;
}
function list(value: unknown, name: string, max = MAX_STAGE_ITEMS): unknown[] {
  if (!Array.isArray(value) || value.length > max)
    fail(`${name} must be a list of at most ${max}.`);
  return value;
}
function num(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6)
    fail(`${name} must be a finite number.`);
  return value;
}
function index(value: unknown, name: string, size: number): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= size)
    fail(`${name} is out of range.`);
  return value as number;
}
function str(value: unknown, name: string, max = 400): string {
  if (typeof value !== 'string' || value.length > max) fail(`${name} must be text.`);
  return value;
}
function bool(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') fail(`${name} must be true or false.`);
  return value;
}
function pointOf(value: unknown, name: string): KnitStagePoint {
  const p = record(value, name),
    uv = list(p.uv, `${name} uv`, 2);
  if (uv.length !== 2) fail(`${name} uv needs two coordinates.`);
  const out: KnitStagePoint = {
    uv: [num(uv[0], `${name} u`), num(uv[1], `${name} v`)],
    across: num(p.across, `${name} across`),
  };
  if (out.uv.some((x) => x < -1e-9 || x > 1 + 1e-9)) fail(`${name} lies outside the chart.`);
  if (p.patch !== undefined) out.patch = index(p.patch, `${name} patch`, 64);
  if (p.net !== undefined) {
    const net = list(p.net, `${name} net`, 2);
    out.net = [num(net[0], `${name} net`), num(net[1], `${name} net`)];
  }
  return out;
}
function pairs(value: unknown, name: string, size: number): [number, number][] {
  return list(value, name).map((x) => {
    const pair = list(x, name, 2);
    return [index(pair[0], name, size), index(pair[1], name, size)];
  });
}
function courseOf(value: unknown, name: string, size: number): KnitStageCourse {
  const c = record(value, name);
  const out: KnitStageCourse = {
    vertices: list(c.vertices, `${name} vertices`, 600).map((i) => index(i, name, size)),
    leftBoundary: bool(c.leftBoundary, `${name} left boundary`),
    rightBoundary: bool(c.rightBoundary, `${name} right boundary`),
  };
  if (c.start !== undefined) out.start = pointOf(c.start, `${name} start`);
  if (c.end !== undefined) out.end = pointOf(c.end, `${name} end`);
  if (c.points !== undefined)
    out.points = list(c.points, `${name} points`, 2000).map((p) => pointOf(p, `${name} point`));
  if (!out.points && (!out.start || !out.end)) fail(`${name} needs its end points or a polyline.`);
  if (out.points && out.points.length < 2) fail(`${name} polyline needs two points.`);
  return out;
}
function summaryOf(s: Record<string, unknown>) {
  return {
    fingerprint: str(s.fingerprint, 'fingerprint', 80),
    method: str(s.method, 'method'),
  };
}
export function validateCourseStage(value: unknown): KnitCourseStage {
  const s = record(value, 'courses stage');
  if (s.stage !== 'courses') fail('courses stage has the wrong stage name.');
  const vertices = list(s.vertices, 'vertices').map((v, i) => {
    const r = record(v, `vertex ${i + 1}`);
    return {
      ...pointOf(r, `vertex ${i + 1}`),
      contour: index(r.contour, `vertex ${i + 1} contour`, 601),
      position: index(r.position, `vertex ${i + 1} position`, 601),
      leaf: bool(r.leaf, `vertex ${i + 1} leaf`),
      end: bool(r.end, `vertex ${i + 1} end`),
    };
  });
  const out: KnitCourseStage = {
    stage: 'courses',
    ...summaryOf(s),
    vertices,
    links: pairs(s.links, 'links', vertices.length),
    courses: list(s.courses, 'courses', 600).map((c, i) =>
      courseOf(c, `course ${i + 1}`, vertices.length)
    ),
    contourRounding: list(s.contourRounding, 'contour rounding', 601).map((x) =>
      num(x, 'contour rounding')
    ),
    maxLinkOffset: num(s.maxLinkOffset, 'maximum link offset'),
    resolution: index(s.resolution, 'resolution', 257),
    issues: list(s.issues, 'issues', 40).map((x) => str(x, 'issue', 600)),
  };
  if (s.warp !== undefined) out.warp = pairs(s.warp, 'warp links', vertices.length);
  if (s.edits !== undefined)
    out.edits = list(s.edits, 'edits', MAX_STAGE_EDITS).map((e, i) => {
      const r = record(e, `edit ${i + 1}`);
      if (!EDIT_OPS.includes(r.op as KnitCourseEditOp))
        fail(`edit ${i + 1} has an unknown operation.`);
      return { op: r.op as KnitCourseEditOp, target: str(r.target, `edit ${i + 1} target`, 200) };
    });
  return out;
}
const ROLES: KnitLoopRole[] = ['loop', 'short-row', 'increase', 'decrease'];
const FACE_KINDS = ['quad', 'short-row', 'increase', 'decrease', 'other'] as const;
export function validateLoopStage(value: unknown): KnitLoopStage {
  const s = record(value, 'loops stage');
  if (s.stage !== 'loops') fail('loops stage has the wrong stage name.');
  const rows =
    s.rows === undefined
      ? undefined
      : list(s.rows, 'rows', 600).map((c, i) => courseOf(c, `row ${i + 1}`, 0));
  const loops = list(s.loops, 'loops').map((v, i) => {
    const r = record(v, `loop ${i + 1}`),
      role = r.role as KnitLoopRole;
    if (!ROLES.includes(role)) fail(`loop ${i + 1} has an unknown role.`);
    return {
      ...pointOf(r, `loop ${i + 1}`),
      id: str(r.id, `loop ${i + 1} id`, 64),
      course: index(r.course, `loop ${i + 1} course`, 600),
      role,
      parents: list(r.parents, `loop ${i + 1} parents`, 8).map((x) => str(x, 'parent', 64)),
    };
  });
  const out: KnitLoopStage = { stage: 'loops', ...summaryOf(s), loops };
  if (rows) out.rows = rows;
  if (s.primal !== undefined) {
    const p = record(s.primal, 'primal graph');
    const vertices = list(p.vertices, 'primal vertices').map((v, i) => {
      const r = record(v, `primal vertex ${i + 1}`);
      return {
        ...pointOf(r, `primal vertex ${i + 1}`),
        leaf: bool(r.leaf, 'leaf'),
        end: bool(r.end, 'end'),
        ...(r.contour !== undefined ? { contour: index(r.contour, 'contour', 601) } : {}),
      };
    });
    out.primal = {
      vertices,
      edges: list(p.edges, 'primal edges').map((e) => {
        const r = record(e, 'primal edge');
        if (r.kind !== 'weft' && r.kind !== 'warp') fail('primal edge kind must be weft or warp.');
        return {
          a: index(r.a, 'primal edge', vertices.length),
          b: index(r.b, 'primal edge', vertices.length),
          kind: r.kind,
        };
      }),
      faces: list(p.faces, 'primal faces').map((f) => {
        const r = record(f, 'primal face'),
          kind = r.kind as (typeof FACE_KINDS)[number];
        if (!FACE_KINDS.includes(kind)) fail('primal face has an unknown kind.');
        return {
          vertices: list(r.vertices, 'face vertices', 64).map((i) =>
            index(i, 'face vertex', vertices.length)
          ),
          kind,
          ...(r.loop !== undefined ? { loop: str(r.loop, 'face loop', 64) } : {}),
        };
      }),
    };
  }
  return out;
}
export function validateKnitGraph(value: unknown): KnitGraphStages {
  const g = record(value, 'stages');
  const courseMethod = g.courseMethod as KnitCourseMethod;
  if (typeof courseMethod !== 'string' || !Object.hasOwn(COURSE_METHODS, courseMethod))
    fail('unknown course method.');
  const out: KnitGraphStages = { courseMethod, courses: validateCourseStage(g.courses) };
  if (g.loops !== undefined) out.loops = validateLoopStage(g.loops);
  return out;
}

// ---- stage files -----------------------------------------------------------------------------
export function stageFileText(
  courseMethod: KnitCourseMethod,
  stage: KnitCourseStage | KnitLoopStage
): string {
  return JSON.stringify({
    format: STAGE_FILE_FORMAT,
    version: 1,
    stage: stage.stage,
    courseMethod,
    fingerprint: stage.fingerprint,
    note: 'Knit graph stage (Popescu 2019, §6.3). Design-level graph data, not machine code.',
    data: stage,
  });
}
export function parseStageFile(text: string): {
  courseMethod: KnitCourseMethod;
  stage: KnitCourseStage | KnitLoopStage;
} {
  if (text.length > 64 * 1024 * 1024) fail('stage file exceeds the 64 MB text limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail('stage file is not valid JSON.');
  }
  const f = record(parsed, 'stage file');
  if (f.format !== STAGE_FILE_FORMAT || f.version !== 1)
    fail('not a knit-graph-stage file, version 1.');
  const courseMethod = f.courseMethod as KnitCourseMethod;
  if (typeof courseMethod !== 'string' || !Object.hasOwn(COURSE_METHODS, courseMethod))
    fail('unknown course method.');
  const stage =
    f.stage === 'courses'
      ? validateCourseStage(f.data)
      : f.stage === 'loops'
        ? validateLoopStage(f.data)
        : fail('unknown stage.');
  if (stage.fingerprint !== f.fingerprint) fail('file fingerprint does not match its stage.');
  return { courseMethod, stage };
}
/** Replace one saved stage with a loaded one; it must match the current inputs. */
export function loadStage(
  project: Pick<ProjectState, 'surface' | 'knit' | 'swatches'>,
  loaded: ReturnType<typeof parseStageFile>
): KnitGraphStages {
  const state = knitGraphFreshness(project),
    settings = project.knit;
  if (!state || !settings) fail('the current settings do not use a measured course layout.');
  if (loaded.courseMethod !== state.method) fail('the file was made with another course method.');
  const graph = settings.graph;
  if (loaded.stage.stage === 'courses') {
    if (loaded.stage.fingerprint !== state.expectedCourses)
      fail(
        'the courses stage was made from other inputs (surface, start edge, cut, measurements or method).'
      );
    return {
      courseMethod: state.method,
      courses: loaded.stage,
      ...(graph?.loops && graph.courseMethod === state.method ? { loops: graph.loops } : {}),
    };
  }
  if (!graph || state.courses !== 'fresh')
    fail('load or generate the matching courses stage first.');
  if (loaded.stage.fingerprint !== loopStageFingerprint(graph.courses, settings))
    fail('the loops stage was made from another courses stage or first pass.');
  return { ...graph, loops: loaded.stage };
}

// ---- rule checks -----------------------------------------------------------------------------
export interface KnitGraphCheck {
  id: string;
  label: string;
  source: string;
  violations: number;
  examples: string[];
}
const uvKey = (p: KnitStagePoint) =>
  `${p.patch ?? 0}:${Math.round(p.uv[0] * 1e12)}:${Math.round(p.uv[1] * 1e12)}`;
function check(id: string, label: string, source: string, found: string[]): KnitGraphCheck {
  return { id, label, source, violations: found.length, examples: found.slice(0, 5) };
}
/** Chart segments pq and ru cross, overlap or touch away from a shared endpoint (project planarity rule). */
export function segmentsConflict(
  p: readonly number[],
  q: readonly number[],
  r: readonly number[],
  u: readonly number[]
): boolean {
  const orient = (a: readonly number[], b: readonly number[], c: readonly number[]) =>
    (b[0]! - a[0]!) * (c[1]! - a[1]!) - (b[1]! - a[1]!) * (c[0]! - a[0]!);
  const same = (a: readonly number[], b: readonly number[]) =>
    Math.abs(a[0]! - b[0]!) <= 1e-12 && Math.abs(a[1]! - b[1]!) <= 1e-12;
  const tol = 1e-14;
  const d1 = orient(p, q, r),
    d2 = orient(p, q, u),
    d3 = orient(r, u, p),
    d4 = orient(r, u, q);
  if (
    ((d1 > tol && d2 < -tol) || (d1 < -tol && d2 > tol)) &&
    ((d3 > tol && d4 < -tol) || (d3 < -tol && d4 > tol))
  )
    return true;
  // A point lying on the other segment, other than a shared endpoint.
  const on = (a: readonly number[], b: readonly number[], c: readonly number[], d: number) => {
    if (Math.abs(d) > tol || same(c, a) || same(c, b)) return false;
    const t = (c[0]! - a[0]!) * (b[0]! - a[0]!) + (c[1]! - a[1]!) * (b[1]! - a[1]!),
      l = (b[0]! - a[0]!) ** 2 + (b[1]! - a[1]!) ** 2;
    return t > 0 && t < l;
  };
  return on(p, q, r, d1) || on(p, q, u, d2) || on(r, u, p, d3) || on(r, u, q, d4);
}
/** Conflicting segment pairs in the chart, found with a uniform bucket grid. */
export function crossingPairs(
  points: readonly KnitStagePoint[],
  segments: readonly [number, number][],
  limit = 50
): [number, number][] {
  const found: [number, number][] = [],
    cells = new Map<string, number[]>();
  const size = Math.max(1, Math.ceil(Math.sqrt(segments.length)));
  const cell = (x: number) => Math.max(0, Math.min(size - 1, Math.floor(x * size)));
  segments.forEach(([a, b], s) => {
    const p = points[a]!.uv,
      q = points[b]!.uv;
    for (let x = cell(Math.min(p[0], q[0])); x <= cell(Math.max(p[0], q[0])); x++)
      for (let y = cell(Math.min(p[1], q[1])); y <= cell(Math.max(p[1], q[1])); y++) {
        const key = `${points[a]!.patch ?? 0}:${x}:${y}`,
          bucket = cells.get(key) ?? [];
        bucket.push(s);
        cells.set(key, bucket);
      }
  });
  const seen = new Set<string>();
  for (const bucket of cells.values())
    for (let i = 0; i < bucket.length; i++)
      for (let j = i + 1; j < bucket.length; j++) {
        const s = bucket[i]!,
          t = bucket[j]!,
          [a, b] = segments[s]!,
          [c, d] = segments[t]!;
        if ((a === c && b === d) || (a === d && b === c)) continue;
        const key = s < t ? `${s}:${t}` : `${t}:${s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (segmentsConflict(points[a]!.uv, points[b]!.uv, points[c]!.uv, points[d]!.uv)) {
          found.push([s, t]);
          if (found.length >= limit) return found;
        }
      }
  return found;
}
/** Every stage: duplicates and consistent parent links. Popescu rules: the thesis connection rules
 * (§6.2.2, p. 101; Fig. 6.17, pp. 111–112) and the project rules for crossings and faces. */
export function checkKnitGraph(stages: KnitGraphStages): KnitGraphCheck[] {
  const { courses, loops } = stages,
    checks: KnitGraphCheck[] = [];
  const project = 'Project invariant';
  const duplicates = (points: readonly KnitStagePoint[], what: string) => {
    const seen = new Map<string, number>(),
      found: string[] = [];
    points.forEach((p, i) => {
      const key = uvKey(p),
        first = seen.get(key);
      if (first !== undefined) found.push(`${what} ${i + 1} repeats ${what} ${first + 1}`);
      else seen.set(key, i);
    });
    return found;
  };
  const repeated = (edges: readonly [number, number][], what: string) => {
    const seen = new Set<string>(),
      found: string[] = [];
    edges.forEach(([a, b], i) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (a === b) found.push(`${what} ${i + 1} joins a vertex to itself`);
      else if (seen.has(key)) found.push(`${what} ${i + 1} repeats vertices ${a + 1}–${b + 1}`);
      seen.add(key);
    });
    return found;
  };
  checks.push(
    check(
      'duplicate-vertices',
      'No duplicate vertices or links',
      'Popescu (2019), p. 112; project invariant',
      [
        ...duplicates(courses.vertices, 'vertex'),
        ...repeated([...courses.links, ...(courses.warp ?? [])], 'link'),
        // Edited course polylines (§6.3.2: duplicates are not allowed): no point repeats on a course.
        ...(courses.edits?.length
          ? courses.courses.flatMap((c, k) =>
              c.points ? duplicates(c.points, `course ${k + 1} point`) : []
            )
          : []),
        ...(loops?.primal
          ? [
              ...duplicates(loops.primal.vertices, 'primal vertex'),
              ...repeated(
                loops.primal.edges.map((e) => [e.a, e.b]),
                'primal edge'
              ),
            ]
          : []),
      ]
    )
  );
  if (loops) {
    const byId = new Map<string, (typeof loops.loops)[number]>(),
      found: string[] = [];
    for (const l of loops.loops) {
      if (byId.has(l.id)) found.push(`loop ${l.id} appears twice`);
      byId.set(l.id, l);
    }
    found.push(...duplicates(loops.loops, 'loop'));
    const consumed = new Map<string, string>();
    for (const l of loops.loops) {
      if (l.parents.length > 2) found.push(`loop ${l.id} has ${l.parents.length} parents`);
      for (const id of l.parents) {
        const p = byId.get(id);
        if (!p) found.push(`loop ${l.id} names missing parent ${id}`);
        else if (p.course >= l.course)
          found.push(`loop ${l.id} names parent ${id} from a later course`);
        const other = consumed.get(id);
        if (other && other !== l.id) found.push(`parent ${id} is used by ${other} and ${l.id}`);
        consumed.set(id, l.id);
      }
    }
    checks.push(check('parent-links', 'Consistent parent links', project, found));
  }
  if (stages.courseMethod !== 'popescu-2019-rules') return checks;
  // §6.2.2, p. 101: an 'end' vertex needs one weft edge, others two (project: one per adjacent contour).
  const contours = Math.max(0, ...courses.vertices.map((v) => v.contour)) + 1;
  const back = new Uint16Array(courses.vertices.length),
    forward = new Uint16Array(courses.vertices.length);
  for (const [a, b] of courses.links) {
    const [lo, hi] = courses.vertices[a]!.contour < courses.vertices[b]!.contour ? [a, b] : [b, a];
    forward[lo]!++;
    back[hi]!++;
  }
  const courseRule: string[] = [];
  courses.vertices.forEach((v, i) => {
    const total = back[i]! + forward[i]!;
    const ok = v.end
      ? total >= 1
      : (v.contour === 0 || back[i]! >= 1) && (v.contour === contours - 1 || forward[i]! >= 1);
    if (!ok)
      courseRule.push(
        `vertex ${i + 1} (contour ${v.contour + 1}, position ${v.position + 1}) has ${total} weft edge${total === 1 ? '' : 's'}`
      );
  });
  const linkCrossings: string[] = [];
  const byPair = new Map<number, [number, number][]>();
  for (const [a, b] of courses.links) {
    const [lo, hi] = courses.vertices[a]!.contour < courses.vertices[b]!.contour ? [a, b] : [b, a];
    const key = courses.vertices[lo]!.contour,
      entry = byPair.get(key) ?? [];
    entry.push([courses.vertices[lo]!.position, courses.vertices[hi]!.position]);
    byPair.set(key, entry);
  }
  for (const [contour, links] of byPair) {
    links.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    let high = -1;
    for (const [a, b] of links) {
      if (b < high)
        linkCrossings.push(
          `weft link from contour ${contour + 1}, position ${a + 1} crosses another`
        );
      high = Math.max(high, b);
    }
  }
  checks.push(
    check('course-rule', 'Course connection rule', 'Popescu (2019), §6.2.2, p. 101', courseRule)
  );
  const fig: string[] = [],
    faces: string[] = [],
    crossings: string[] = [...linkCrossings];
  if (loops?.primal) {
    const { vertices, edges } = loops.primal;
    const weft = new Uint16Array(vertices.length),
      warp = new Uint16Array(vertices.length);
    for (const e of edges) {
      const count = e.kind === 'weft' ? weft : warp;
      count[e.a]!++;
      count[e.b]!++;
    }
    vertices.forEach((v, i) => {
      // Fig. 6.17: leaf and end ≥1 weft and ≥1 warp; end ≥1 weft and ≥2 warp; others ≥2 and ≥2.
      // A leaf vertex that is not an end lies on the first or last course: project reading ≥2 weft, ≥1 warp.
      const need: [number, number] =
        v.leaf && v.end ? [1, 1] : v.end ? [1, 2] : v.leaf ? [2, 1] : [2, 2];
      if (weft[i]! < need[0] || warp[i]! < need[1])
        fig.push(
          `${v.leaf && v.end ? 'leaf and end' : v.end ? 'end' : v.leaf ? 'leaf' : 'interior'} vertex ${i + 1} has ${weft[i]} weft and ${warp[i]} warp edges`
        );
    });
    for (const [s, t] of crossingPairs(
      vertices,
      edges.map((e) => [e.a, e.b])
    ))
      crossings.push(`primal edges ${s + 1} and ${t + 1} cross`);
    loops.primal.faces.forEach((f, i) => {
      if (f.kind === 'other')
        faces.push(
          `face ${i + 1} has ${f.vertices.length} vertices and is not a loop or a shaping triangle`
        );
    });
  } else fig.push('the loops stage has no primal graph');
  checks.push(
    check(
      'connectivity-rule',
      'Knit topology connectivity rules',
      'Popescu (2019), Fig. 6.17, pp. 111–112',
      fig
    ),
    check('crossings', 'No crossing edges', 'Project rule', crossings),
    check(
      'faces',
      'Faces are loops or shaping triangles',
      'Popescu (2019), §6.2.3, p. 103; project rule',
      faces
    )
  );
  return checks;
}
export const checkBlockers = (checks: readonly KnitGraphCheck[]) =>
  checks
    .filter((c) => c.violations)
    .map(
      (c) =>
        `Knit graph: ${c.label} (${c.source}): ${c.violations} violation${c.violations === 1 ? '' : 's'}${c.examples.length ? `, e.g. ${c.examples[0]}` : ''}.`
    );
