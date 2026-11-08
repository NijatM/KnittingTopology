// Editing the courses stage on the surface (Popescu 2019, §6.3.2 "Editing patterns", pp. 111–112):
// add or delete objects, change the start and end of lines, move points. Edits are applied even when
// they break a rule; the rule checks and the planner report violations, which block export (thesis:
// a warning at the update step). Where the thesis is silent, the project rules are named below.
import type {
  KnitCourseMethod,
  KnitCourseStage,
  KnitStageCourse,
  KnitStageEdit,
  KnitStagePoint,
  SurfaceSpec,
  Vec2,
} from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import { MAX_STAGE_EDITS } from './knit-graph';
import { rotatedShapeUV, rotatedShapeV, shapeDistanceField } from './shape-geometry';

type StartEdge = 'v0' | 'u1' | 'v1' | 'u0';
export type LinkKind = 'weft' | 'warp';
export type CourseEdit =
  | { op: 'move-vertex'; vertex: number; uv: Vec2 }
  | { op: 'add-vertex'; uv: Vec2 }
  | { op: 'delete-vertex'; vertex: number }
  | { op: 'add-link'; a: number; b: number }
  | { op: 'delete-link'; kind: LinkKind; link: number }
  | { op: 'reattach-link'; kind: LinkKind; link: number; end: 0 | 1; vertex: number }
  | { op: 'move-point'; course: number; point: number; uv: Vec2 }
  | { op: 'insert-point'; course: number; after: number; uv: Vec2 }
  | { op: 'delete-point'; course: number; point: number }
  | { op: 'delete-course'; course: number }
  | { op: 'add-course'; after: number; points: Vec2[] };

/** Thesis objects of each method: her vertices and links, or the project's course polylines. */
export const EDIT_TOOLS: Record<KnitCourseMethod, CourseEdit['op'][]> = {
  'popescu-2019-rules': [
    'move-vertex',
    'add-vertex',
    'delete-vertex',
    'add-link',
    'delete-link',
    'reattach-link',
  ],
  'project-alignment': [
    'move-point',
    'insert-point',
    'delete-point',
    'delete-course',
    'add-course',
  ],
};
/** Project rule: a point this close to the needle-1 side or the opposite side (chart fraction) is put on it. */
export const SIDE_SNAP = 0.005;
const MAX_COURSES = 600,
  MAX_COURSE_POINTS = 2000,
  MAX_CONTOUR = 600;

/** Places chart points: `across` is interpolated from the distance field (project rule). */
export type StagePlacer = (uv: Vec2) => KnitStagePoint;
export interface EditContext {
  surface: SurfaceSpec;
  startEdge: StartEdge;
  place: StagePlacer;
}
export const editContext = (surface: SurfaceSpec, startEdge: StartEdge): EditContext => ({
  surface,
  startEdge,
  place: stagePlacer(surface, startEdge),
});
const fields = new Map<string, ReturnType<typeof shapeDistanceField>>();
export function stagePlacer(surface: SurfaceSpec, startEdge: StartEdge): StagePlacer {
  const key = JSON.stringify([surface, startEdge]);
  let field = fields.get(key);
  if (!field) {
    // The loop dimensions only enter validation; the distance field depends on the chart alone.
    field = shapeDistanceField(surface, 1, 1, startEdge);
    if (fields.size > 8) fields.clear();
    fields.set(key, field);
  }
  const { n, d } = field,
    side = n + 1;
  return (input) => {
    const clamp = (x: number) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
    let uv: Vec2 = [clamp(input[0]), clamp(input[1])];
    let [x, y] = rotatedShapeUV(uv, startEdge);
    if (x < SIDE_SNAP || x > 1 - SIDE_SNAP) {
      x = x < SIDE_SNAP ? 0 : 1;
      uv = unrotate([x, y], startEdge);
    }
    const gx = Math.min(n - 1, Math.floor(x * n)),
      gy = Math.min(n - 1, Math.floor(y * n)),
      fx = x * n - gx,
      fy = y * n - gy;
    const at = (i: number, j: number) => d[(gy + j) * side + gx + i]!;
    const across =
      (1 - fy) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) + fy * ((1 - fx) * at(0, 1) + fx * at(1, 1));
    if (!evaluateSurface(surface, 0, uv[0], uv[1]).every(Number.isFinite))
      throw new Error('The point is not on the surface chart.');
    return { uv, across: x === 0 ? 0 : across };
  };
}
function unrotate([x, y]: Vec2, edge: StartEdge): Vec2 {
  return edge === 'v0'
    ? [x, y]
    : edge === 'u1'
      ? [1 - y, x]
      : edge === 'v1'
        ? [1 - x, 1 - y]
        : [y, 1 - x];
}
/** Project rule: a course end on the needle-1 side or the opposite side is a boundary end; elsewhere a turn. */
export function onSide(p: KnitStagePoint, startEdge: StartEdge, which: 'near' | 'far'): boolean {
  const x = rotatedShapeUV(p.uv, startEdge)[0];
  return which === 'near' ? x <= 1e-9 : x >= 1 - 1e-9;
}
export function coursePoints(stage: KnitCourseStage, k: number): KnitStagePoint[] {
  const c = stage.courses[k]!;
  return c.points ?? [c.start!, ...c.vertices.map((i) => stage.vertices[i]!), c.end!];
}
const copyPoint = (p: KnitStagePoint): KnitStagePoint => ({
  uv: [p.uv[0], p.uv[1]],
  across: p.across,
  ...(p.patch !== undefined ? { patch: p.patch } : {}),
  ...(p.net ? { net: [p.net[0], p.net[1]] as Vec2 } : {}),
});
function polyline(points: KnitStagePoint[], startEdge: StartEdge): KnitStageCourse {
  return {
    vertices: [],
    points: points.map(copyPoint),
    leftBoundary: onSide(points[0]!, startEdge, 'near'),
    rightBoundary: onSide(points.at(-1)!, startEdge, 'far'),
  };
}
function fail(message: string): never {
  throw new Error(message);
}
const inRange = (i: number, size: number, what: string) => {
  if (!Number.isInteger(i) || i < 0 || i >= size) fail(`There is no ${what} ${i + 1}.`);
};
const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const weftLink = (s: KnitCourseStage, a: number, b: number): [number, number] =>
  s.vertices[a]!.contour < s.vertices[b]!.contour ? [a, b] : [b, a];
/** A link joins vertices on adjacent contours (weft) or neighbours on one contour (warp). */
function linkKind(s: KnitCourseStage, a: number, b: number): LinkKind {
  const va = s.vertices[a]!,
    vb = s.vertices[b]!;
  if (Math.abs(va.contour - vb.contour) === 1) return 'weft';
  if (va.contour === vb.contour && Math.abs(va.position - vb.position) === 1) return 'warp';
  return fail(
    'A link joins vertices on adjacent contours (weft) or neighbouring vertices on one contour (warp).'
  );
}
/** Recomputes `position`, `leaf` and `end` by the generation rules (project choice: the thesis update
 * step is not written out). Leaf: first or last on its contour. End: first or last contour, more than
 * two weft links, or a warp link (§6.2.2, p. 101). */
export function recomputeAttributes(s: KnitCourseStage): KnitCourseStage {
  const vertices = s.vertices.map((v) => ({ ...v }));
  const contours = new Map<number, number[]>();
  vertices.forEach((v, i) => {
    const list = contours.get(v.contour) ?? [];
    list.push(i);
    contours.set(v.contour, list);
  });
  for (const list of contours.values()) {
    list.sort((a, b) => vertices[a]!.position - vertices[b]!.position || a - b);
    list.forEach((i, position) => {
      vertices[i]!.position = position;
      vertices[i]!.leaf = position === 0 || position === list.length - 1;
    });
  }
  const last = Math.max(0, ...vertices.map((v) => v.contour)),
    valency = new Uint32Array(vertices.length),
    warped = new Uint8Array(vertices.length);
  for (const [a, b] of s.links) {
    valency[a]!++;
    valency[b]!++;
  }
  for (const [a, b] of s.warp ?? []) warped[a] = warped[b] = 1;
  vertices.forEach((v, i) => {
    v.end = v.contour === 0 || v.contour === last || valency[i]! > 2 || warped[i] === 1;
  });
  return { ...s, vertices };
}
/** Applies one edit; the result records it. Structurally impossible edits throw; rule breaks do not. */
export function applyCourseEdit(
  stage: KnitCourseStage,
  method: KnitCourseMethod,
  edit: CourseEdit,
  { surface, startEdge, place }: EditContext
): KnitCourseStage {
  if (!EDIT_TOOLS[method].includes(edit.op))
    fail(`This course method does not edit ${edit.op.replace('-', ' ')}s.`);
  if ((stage.edits?.length ?? 0) >= MAX_STAGE_EDITS)
    fail(`A stage records at most ${MAX_STAGE_EDITS} edits; download it and discard the edits.`);
  const s: KnitCourseStage = {
    ...stage,
    vertices: stage.vertices.map((v) => ({ ...v })),
    links: stage.links.map(([a, b]) => [a, b]),
    ...(stage.warp ? { warp: stage.warp.map(([a, b]) => [a, b] as [number, number]) } : {}),
    courses: [...stage.courses],
  };
  // Project method: the first edit stores every course as a polyline; the contour vertices and links
  // the courses were read from would no longer match them, so they are dropped.
  if (method === 'project-alignment' && s.vertices.length) {
    s.courses = stage.courses.map((c, k) => ({
      vertices: [],
      points: coursePoints(stage, k).map(copyPoint),
      leftBoundary: c.leftBoundary,
      rightBoundary: c.rightBoundary,
    }));
    s.vertices = [];
    s.links = [];
    delete s.warp;
  }
  const V = s.vertices.length;
  let target: string;
  switch (edit.op) {
    case 'move-vertex': {
      inRange(edit.vertex, V, 'vertex');
      Object.assign(s.vertices[edit.vertex]!, place(edit.uv));
      target = `vertex ${edit.vertex + 1}`;
      break;
    }
    case 'add-vertex': {
      if (!V) fail('There is no contour to add a vertex to.');
      const p = place(edit.uv),
        here = evaluateSurface(surface, 0, p.uv[0], p.uv[1]);
      // Project rule: a new vertex joins the contour of the nearest vertex, ordered along it.
      let nearest = 0,
        best = Infinity;
      s.vertices.forEach((v, i) => {
        const q = evaluateSurface(surface, 0, v.uv[0], v.uv[1]),
          dist = (q[0] - here[0]) ** 2 + (q[1] - here[1]) ** 2 + (q[2] - here[2]) ** 2;
        if (dist < best) [best, nearest] = [dist, i];
      });
      const contour = s.vertices[nearest]!.contour,
        along = rotatedShapeV(p.uv, startEdge);
      const before = s.vertices.filter(
        (v) => v.contour === contour && rotatedShapeV(v.uv, startEdge) < along
      ).length;
      for (const v of s.vertices) if (v.contour === contour && v.position >= before) v.position++;
      if (s.vertices.filter((v) => v.contour === contour).length >= MAX_CONTOUR)
        fail('A contour holds at most 600 vertices.');
      s.vertices.push({ ...p, contour, position: before, leaf: false, end: false });
      target = `vertex ${V + 1} (contour ${contour + 1})`;
      break;
    }
    case 'delete-vertex': {
      inRange(edit.vertex, V, 'vertex');
      const v = edit.vertex,
        shift = (i: number) => (i > v ? i - 1 : i);
      const keep = (l: [number, number][]) =>
        l
          .filter(([a, b]) => a !== v && b !== v)
          .map(([a, b]) => [shift(a), shift(b)] as [number, number]);
      const removed = s.vertices[v]!;
      s.vertices.splice(v, 1);
      for (const w of s.vertices)
        if (w.contour === removed.contour && w.position > removed.position) w.position--;
      s.links = keep(s.links);
      if (s.warp) s.warp = keep(s.warp);
      target = `vertex ${v + 1}`;
      break;
    }
    case 'add-link': {
      inRange(edit.a, V, 'vertex');
      inRange(edit.b, V, 'vertex');
      if (edit.a === edit.b) fail('A link needs two different vertices.');
      const kind = linkKind(s, edit.a, edit.b);
      if (kind === 'weft') s.links.push(weftLink(s, edit.a, edit.b));
      else (s.warp ??= []).push(edit.a < edit.b ? [edit.a, edit.b] : [edit.b, edit.a]);
      target = `${kind} link ${(kind === 'weft' ? s.links : s.warp!).length} (vertices ${edit.a + 1}–${edit.b + 1})`;
      break;
    }
    case 'delete-link':
    case 'reattach-link': {
      const list = edit.kind === 'weft' ? s.links : (s.warp ?? []);
      inRange(edit.link, list.length, `${edit.kind} link`);
      if (edit.op === 'delete-link') {
        list.splice(edit.link, 1);
        target = `${edit.kind} link ${edit.link + 1}`;
        break;
      }
      inRange(edit.vertex, V, 'vertex');
      const ends = [...list[edit.link]!] as [number, number];
      ends[edit.end] = edit.vertex;
      if (ends[0] === ends[1]) fail('A link needs two different vertices.');
      if (linkKind(s, ends[0], ends[1]) !== edit.kind)
        fail(`The reattached link would no longer be a ${edit.kind} link.`);
      list[edit.link] =
        edit.kind === 'weft'
          ? weftLink(s, ends[0], ends[1])
          : ends[0] < ends[1]
            ? ends
            : [ends[1], ends[0]];
      target = `${edit.kind} link ${edit.link + 1}, to vertex ${edit.vertex + 1}`;
      break;
    }
    case 'move-point':
    case 'insert-point':
    case 'delete-point': {
      inRange(edit.course, s.courses.length, 'course');
      let points = coursePoints(s, edit.course).map(copyPoint);
      const last = points.length - 1,
        fewer = 'A course keeps at least two points; delete the course instead.';
      if (edit.op === 'insert-point') {
        if (!Number.isInteger(edit.after) || edit.after < -1 || edit.after > last)
          fail(`There is no point ${edit.after + 1} on course ${edit.course + 1}.`);
        if (points.length >= MAX_COURSE_POINTS) fail('A course holds at most 2000 points.');
        points.splice(edit.after + 1, 0, place(edit.uv));
        target = `course ${edit.course + 1}, point ${edit.after + 2}`;
      } else {
        if (!Number.isInteger(edit.point) || edit.point < 0 || edit.point > last)
          fail(`There is no point ${edit.point + 1} on course ${edit.course + 1}.`);
        if (edit.op === 'move-point') {
          const p = place(edit.uv);
          // Project rule: a course end moved past other points removes them, so it stays the end
          // and the turn moves.
          if (edit.point === last)
            points = [...points.slice(0, last).filter((q) => q.across < p.across), p];
          else if (edit.point === 0)
            points = [p, ...points.slice(1).filter((q) => q.across > p.across)];
          else points[edit.point] = p;
          if (points.length < 2) fail(fewer);
        } else {
          if (points.length <= 2) fail(fewer);
          points.splice(edit.point, 1);
        }
        target = `course ${edit.course + 1}, point ${edit.point + 1}`;
      }
      // Project rule: the points of a course are kept in needle order (the layout needs it).
      points.sort((a, b) => a.across - b.across);
      s.courses[edit.course] = polyline(points, startEdge);
      break;
    }
    case 'delete-course': {
      inRange(edit.course, s.courses.length, 'course');
      if (s.courses.length <= 1) fail('The stage keeps at least one course.');
      s.courses.splice(edit.course, 1);
      target = `course ${edit.course + 1}`;
      break;
    }
    case 'add-course': {
      if (!Number.isInteger(edit.after) || edit.after < -1 || edit.after >= s.courses.length)
        fail(`There is no course ${edit.after + 1} to add after.`);
      if (s.courses.length >= MAX_COURSES) fail('The stage holds at most 600 courses.');
      if (edit.points.length < 2 || edit.points.length > MAX_COURSE_POINTS)
        fail('A new course needs 2 to 2000 points.');
      // Project rule: the points of a new course are put in needle order.
      const points = edit.points.map(place).sort((a, b) => a.across - b.across);
      s.courses.splice(edit.after + 1, 0, polyline(points, startEdge));
      target = `course ${edit.after + 2} (${points.length} points)`;
      break;
    }
  }
  const out = method === 'popescu-2019-rules' ? recomputeAttributes(s) : s;
  const record: KnitStageEdit = { op: edit.op, target };
  return { ...out, edits: [...(stage.edits ?? []), record] };
}
/** Counts of each edit operation, for the panel and the report. */
export function editSummary(stage: KnitCourseStage): string {
  const counts = new Map<string, number>();
  for (const e of stage.edits ?? []) counts.set(e.op, (counts.get(e.op) ?? 0) + 1);
  return [...counts].map(([op, n]) => `${n} ${op.replace('-', ' ')}`).join(', ');
}
