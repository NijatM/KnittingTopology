// Courses-stage editing on the surface (Popescu 2019, §6.3.2, pp. 111–112): the viewer reports what was
// clicked or dragged, this module turns it into a stage edit, and the stage module applies it.
import { useMemo, useState } from 'react';
import type {
  KnitCourseMethod,
  KnitCourseStage,
  KnitSettings,
  SurfaceSpec,
  SwatchEntry,
  Vec2,
  Vec3,
} from '../../core/types';
import { evaluateSurface } from '../../core/surfaces';
import { knitGraphFreshness } from '../../knit/knit-graph';
import {
  EDIT_TOOLS,
  applyCourseEdit,
  coursePoints,
  editContext,
  type CourseEdit,
  type LinkKind,
} from '../../knit/knit-graph-edit';
import { rotatedShapeUV } from '../../knit/shape-geometry';
import type { ChartWindow } from '../../knit/shape-types';
import type { GraphEditHandles, GraphEditIntent, GraphEditTarget } from '../../viewer/types';

type StartEdge = 'v0' | 'u1' | 'v1' | 'u0';
export type EditTool = CourseEdit['op'];
export const TOOL_TEXT: Record<EditTool, [label: string, hint: string]> = {
  'move-vertex': ['Move vertex', 'Drag a vertex to a new place on the surface.'],
  'add-vertex': [
    'Add vertex',
    'Click the surface; the vertex joins the contour of the nearest vertex.',
  ],
  'delete-vertex': ['Delete vertex', 'Click a vertex; its links are deleted with it.'],
  'add-link': [
    'Add link',
    'Drag from a vertex to a vertex on the next contour (weft) or beside it (warp).',
  ],
  'delete-link': ['Delete link', 'Click a link.'],
  'reattach-link': ['Move link end', 'Drag a link from near one end onto another vertex.'],
  'move-point': [
    'Move point',
    'Drag a course point; a course end moved off a side becomes a turn.',
  ],
  'insert-point': ['Insert point', 'Click a course segment.'],
  'delete-point': ['Delete point', 'Click a course point.'],
  'delete-course': ['Delete course', 'Click a course.'],
  'add-course': ['Add course', 'Click points on the surface, then Add course.'],
};

const at = (surface: SurfaceSpec, uv: Vec2): Vec3 => evaluateSurface(surface, 0, uv[0], uv[1]);
/** Handle ids: `v:i` vertex, `w:i` weft link, `r:i` warp link, `p:k:j` course point, `s:k:j` segment. */
export function editHandles(
  stage: KnitCourseStage,
  method: KnitCourseMethod,
  surface: SurfaceSpec,
  draft: Vec2[] = []
): GraphEditHandles {
  const handles: GraphEditHandles = {
    points: [],
    segments: [],
    draft: draft.map((uv) => at(surface, uv)),
  };
  if (method === 'popescu-2019-rules') {
    const pos = stage.vertices.map((v) => at(surface, v.uv));
    pos.forEach((position, i) => handles.points.push({ id: `v:${i}`, position }));
    stage.links.forEach(([a, b], i) =>
      handles.segments.push({ id: `w:${i}`, a: pos[a]!, b: pos[b]! })
    );
    (stage.warp ?? []).forEach(([a, b], i) =>
      handles.segments.push({ id: `r:${i}`, a: pos[a]!, b: pos[b]! })
    );
    return handles;
  }
  stage.courses.forEach((_, k) => {
    const pos = coursePoints(stage, k).map((p) => at(surface, p.uv));
    pos.forEach((position, j) => {
      handles.points.push({ id: `p:${k}:${j}`, position });
      if (j) handles.segments.push({ id: `s:${k}:${j - 1}`, a: pos[j - 1]!, b: position });
    });
  });
  return handles;
}

export type EditStep = { edit: CourseEdit } | { draft: Vec2[] } | { message: string } | null;
const indices = (id: string | undefined, kind: string) =>
  id?.startsWith(`${kind}:`)
    ? id
        .slice(kind.length + 1)
        .split(':')
        .map(Number)
    : null;
const vertexOf = (t: GraphEditTarget | undefined) => indices(t?.point, 'v')?.[0];
const linkOf = (t: GraphEditTarget): { kind: LinkKind; link: number } | null => {
  const weft = indices(t.segment, 'w'),
    warp = indices(t.segment, 'r');
  return weft ? { kind: 'weft', link: weft[0]! } : warp ? { kind: 'warp', link: warp[0]! } : null;
};
/** The edit a click or drag makes with a tool; null when it does not apply to what was hit. */
export function editFromIntent(
  tool: EditTool,
  intent: GraphEditIntent,
  stage: KnitCourseStage,
  surface: SurfaceSpec,
  draft: Vec2[] = []
): EditStep {
  const { drop } = intent,
    click = !drop,
    point = indices(intent.point, 'p'),
    segment = indices(intent.segment, 's');
  switch (tool) {
    case 'move-vertex': {
      const vertex = vertexOf(intent);
      if (vertex === undefined) return null;
      if (!drop?.uv) return { message: 'Drag the vertex to a point on the surface.' };
      return { edit: { op: tool, vertex, uv: drop.uv } };
    }
    case 'add-vertex':
      return click && intent.uv ? { edit: { op: tool, uv: intent.uv } } : null;
    case 'delete-vertex': {
      const vertex = vertexOf(intent);
      return click && vertex !== undefined ? { edit: { op: tool, vertex } } : null;
    }
    case 'add-link': {
      const a = vertexOf(intent),
        b = vertexOf(drop);
      if (a === undefined) return null;
      if (b === undefined) return { message: 'Drag from a vertex onto another vertex.' };
      return { edit: { op: tool, a, b } };
    }
    case 'delete-link': {
      const link = linkOf(intent);
      return click && link ? { edit: { op: tool, ...link } } : null;
    }
    case 'reattach-link': {
      const link = linkOf(intent);
      if (!link) return null;
      const vertex = vertexOf(drop);
      if (vertex === undefined || !intent.position)
        return { message: 'Drag the link from near one end onto another vertex.' };
      const ends = (link.kind === 'weft' ? stage.links : stage.warp!)[link.link]!,
        p = intent.position,
        dist = (i: number) =>
          at(surface, stage.vertices[i]!.uv).reduce((s, x, k) => s + (x - p[k]!) ** 2, 0);
      return {
        edit: { op: tool, ...link, end: dist(ends[0]) <= dist(ends[1]) ? 0 : 1, vertex },
      };
    }
    case 'move-point':
      if (!point) return null;
      if (!drop?.uv) return { message: 'Drag the point to a place on the surface.' };
      return { edit: { op: tool, course: point[0]!, point: point[1]!, uv: drop.uv } };
    case 'insert-point':
      return click && segment && intent.uv
        ? { edit: { op: tool, course: segment[0]!, after: segment[1]!, uv: intent.uv } }
        : null;
    case 'delete-point':
      return click && point ? { edit: { op: tool, course: point[0]!, point: point[1]! } } : null;
    case 'delete-course': {
      const course = (point ?? segment)?.[0];
      return click && course !== undefined ? { edit: { op: tool, course } } : null;
    }
    case 'add-course':
      return click && intent.uv ? { draft: [...draft, intent.uv] } : null;
  }
}
/** Project rule: a new course goes after the last course whose mean distance from the start edge
 * (along the wales) does not exceed its own. */
export function newCourse(
  stage: KnitCourseStage,
  points: Vec2[],
  startEdge: StartEdge,
  window?: ChartWindow
): CourseEdit {
  const wale = (uvs: Vec2[]) =>
    uvs.reduce((s, uv) => s + rotatedShapeUV(uv, startEdge, window)[1], 0) / uvs.length;
  const own = wale(points);
  let after = -1;
  stage.courses.forEach((_, k) => {
    if (wale(coursePoints(stage, k).map((p) => p.uv)) <= own) after = k;
  });
  return { op: 'add-course', after, points };
}

/** Editing state for the panel and the viewer; edits are committed as settings (one undo step each).
 * With computational patches, `settings` is the selected patch's view and `window` its rectangle. */
export function useGraphEdit(
  surface: SurfaceSpec,
  settings: KnitSettings,
  swatches: SwatchEntry[],
  onSettings: (next: KnitSettings) => void,
  window?: ChartWindow
) {
  const [on, setOn] = useState(false);
  const [chosen, setTool] = useState<EditTool | null>(null);
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [error, setError] = useState('');
  const state = knitGraphFreshness({ surface, knit: settings, swatches }, window);
  const stage = state?.courses === 'fresh' ? settings.graph?.courses : undefined,
    method = state?.method ?? 'project-alignment',
    startEdge = settings.startEdge ?? 'v0';
  // Cube and sphere stages carry net coordinates; editing is for open surfaces.
  const available = !!stage && surface.kind !== 'cube' && surface.kind !== 'sphere';
  const active = on && available;
  const tools = EDIT_TOOLS[method],
    tool = chosen && tools.includes(chosen) ? chosen : tools[0]!;
  const handles = useMemo(
    () => (active && stage ? editHandles(stage, method, surface, draft) : null),
    [active, stage, method, surface, draft]
  );
  const apply = (edit: CourseEdit) => {
    if (!stage) return false;
    try {
      const courses = applyCourseEdit(stage, method, edit, editContext(surface, startEdge, window));
      onSettings({ ...settings, graph: { courseMethod: method, courses } });
      setError('');
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    }
  };
  return {
    available,
    active,
    on,
    setOn: (next: boolean) => {
      setOn(next);
      setDraft([]);
      setError('');
    },
    tools,
    tool,
    setTool: (next: EditTool) => {
      setTool(next);
      setDraft([]);
      setError('');
    },
    draft,
    error,
    handles,
    onIntent: (intent: GraphEditIntent) => {
      if (!stage) return;
      const step = editFromIntent(tool, intent, stage, surface, draft);
      if (!step) return;
      if ('message' in step) setError(step.message);
      else if ('draft' in step) {
        setDraft(step.draft);
        setError('');
      } else apply(step.edit);
    },
    addCourse: () => {
      if (stage && draft.length >= 2 && apply(newCourse(stage, draft, startEdge, window)))
        setDraft([]);
    },
    clearDraft: () => setDraft([]),
  };
}
export type GraphEditState = ReturnType<typeof useGraphEdit>;
