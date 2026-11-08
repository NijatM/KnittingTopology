import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings } from '../../src/knit/settings';
import { bmpBytes } from '../../src/knit/files';
import {
  checkKnitGraph,
  knitGraphFreshness,
  loadStage,
  parseStageFile,
  stageFileText,
  staleStagesBlocker,
  validateKnitGraph,
} from '../../src/knit/knit-graph';
import {
  SIDE_SNAP,
  applyCourseEdit,
  coursePoints,
  editContext,
  editSummary,
  stagePlacer,
} from '../../src/knit/knit-graph-edit';
import { editFromIntent, editHandles, newCourse } from '../../src/app/knit/graph-edit';
import { rotatedShapeUV } from '../../src/knit/shape-geometry';
import { knitReport } from '../../src/knit/report';
import { historyReducer } from '../../src/app/project';
import type {
  KnitCourseStage,
  KnitGraphStages,
  KnitSettings,
  SurfaceSpec,
  Vec2,
} from '../../src/core/types';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height.
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'kg' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'kg' };
const knit = (extra: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  mode: 'shape',
  ...extra,
});
const popescu = knit({ courseMethod: 'popescu-2019-rules' });
function run(surface: SurfaceSpec, settings: KnitSettings) {
  return buildKnitProgram({ surface, graph: null, swatches, knit: settings });
}
function build(surface: SurfaceSpec, settings: KnitSettings) {
  const r = run(surface, settings);
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const stagesOf = (surface: SurfaceSpec, settings: KnitSettings) =>
  validateKnitGraph(clone(build(surface, settings).shape!.knitGraph!.stages));
const edited = (settings: KnitSettings, courses: KnitCourseStage): KnitSettings => ({
  ...settings,
  graph: { courseMethod: settings.courseMethod ?? 'project-alignment', courses },
});
const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

describe('editing the courses stage', () => {
  it('places edited points by the distance field and puts points near a side on it', () => {
    const place = stagePlacer(plane, 'v0');
    // On the plane the distance from the needle-1 side is linear, so interpolation is exact.
    expect(place([0.3, 0.5]).across).toBeCloseTo(0.03, 9);
    expect(place([SIDE_SNAP / 2, 0.5])).toEqual({ uv: [0, 0.5], across: 0 });
    const far = place([1 - SIDE_SNAP / 2, 0.2]);
    expect(far.uv).toEqual([1, 0.2]);
    expect(far.across).toBeCloseTo(0.1, 9);
    expect(place([2 * SIDE_SNAP, 0.5]).uv[0]).toBe(2 * SIDE_SNAP);
    expect(place([-1, 2]).uv).toEqual([0, 1]);
    // Another start edge rotates the chart: with u1 the needle-1 side is v = 0.
    expect(stagePlacer(plane, 'u1')([0.5, 0.3]).across).toBeCloseTo(0.03, 9);
  });

  it('edits project course polylines and their turns, recording each edit', () => {
    const stages = stagesOf(plane, knit()),
      c = stages.courses,
      ctx = editContext(plane, 'v0');
    expect(c.vertices.length).toBeGreaterThan(0);
    const first = coursePoints(c, 0),
      y = first.at(-1)!.uv[1];
    // Moving the last point inward makes a turn; the points it passes are removed.
    const turned = applyCourseEdit(
      c,
      'project-alignment',
      { op: 'move-point', course: 0, point: first.length - 1, uv: [0.5, y] },
      ctx
    );
    expect(turned.vertices).toEqual([]);
    expect(turned.links).toEqual([]);
    expect(turned.courses).toHaveLength(c.courses.length);
    expect(turned.courses[0]!.rightBoundary).toBe(false);
    expect(turned.courses[0]!.leftBoundary).toBe(true);
    const row = coursePoints(turned, 0);
    expect(row.at(-1)!.across).toBeCloseTo(0.05, 9);
    expect(row.every((p, i) => !i || p.across >= row[i - 1]!.across)).toBe(true);
    expect(row.length).toBeLessThan(first.length);
    // Other courses keep their points.
    expect(coursePoints(turned, 3).map((p) => p.uv)).toEqual(coursePoints(c, 3).map((p) => p.uv));
    expect(turned.edits).toEqual([{ op: 'move-point', target: `course 1, point ${first.length}` }]);
    expect(turned.fingerprint).toBe(c.fingerprint);

    const p2 = coursePoints(turned, 2);
    const mid: Vec2 = [(p2[0]!.uv[0] + p2[1]!.uv[0]) / 2, p2[0]!.uv[1]];
    let s = applyCourseEdit(
      turned,
      'project-alignment',
      { op: 'insert-point', course: 2, after: 0, uv: mid },
      ctx
    );
    expect(coursePoints(s, 2)).toHaveLength(p2.length + 1);
    expect(coursePoints(s, 2)[1]!.uv).toEqual(mid);
    s = applyCourseEdit(s, 'project-alignment', { op: 'delete-point', course: 2, point: 1 }, ctx);
    expect(coursePoints(s, 2).map((p) => p.uv)).toEqual(p2.map((p) => p.uv));
    s = applyCourseEdit(s, 'project-alignment', { op: 'delete-course', course: 4 }, ctx);
    expect(s.courses).toHaveLength(c.courses.length - 1);

    // A new course goes in needle order, after the last course below it along the wales.
    const wale = (k: number) =>
      coursePoints(s, k).reduce((t, p) => t + rotatedShapeUV(p.uv, 'v0')[1], 0) /
      coursePoints(s, k).length;
    const between = (wale(5) + wale(6)) / 2;
    const add = newCourse(
      s,
      [
        [0.8, between],
        [0.2, between],
      ],
      'v0'
    );
    expect(add).toMatchObject({ op: 'add-course', after: 5 });
    s = applyCourseEdit(s, 'project-alignment', add, ctx);
    expect(coursePoints(s, 6).map((p) => p.uv[0])).toEqual([0.2, 0.8]);
    expect(s.courses[6]).toMatchObject({ leftBoundary: false, rightBoundary: false });
    expect(editSummary(s)).toBe(
      '1 move point, 1 insert point, 1 delete point, 1 delete course, 1 add course'
    );

    // Structural errors throw; the stage is unchanged.
    const twoPoints = applyCourseEdit(
      s,
      'project-alignment',
      { op: 'add-course', after: -1, points: [mid, [0.9, mid[1]]] },
      ctx
    );
    expect(() =>
      applyCourseEdit(
        twoPoints,
        'project-alignment',
        { op: 'delete-point', course: 0, point: 0 },
        ctx
      )
    ).toThrow(/at least two points/);
    expect(() =>
      applyCourseEdit(s, 'project-alignment', { op: 'delete-course', course: 99 }, ctx)
    ).toThrow(/no course 100/);
    expect(() =>
      applyCourseEdit(s, 'project-alignment', { op: 'delete-vertex', vertex: 0 }, ctx)
    ).toThrow(/does not edit/);
    // Duplicates are not allowed (§6.3.2): a repeated point is a rule violation, not an error.
    const dup = applyCourseEdit(
      s,
      'project-alignment',
      { op: 'insert-point', course: 1, after: 0, uv: coursePoints(s, 1)[1]!.uv },
      ctx
    );
    const check = checkKnitGraph({ courseMethod: 'project-alignment', courses: dup });
    expect(check.find((x) => x.id === 'duplicate-vertices')?.violations).toBeGreaterThan(0);
  }, 30000);

  it('rebuilds the layout from edited courses', () => {
    const original = build(plane, knit()),
      c = validateKnitGraph(clone(original.shape!.knitGraph!.stages)).courses;
    // Storing the courses as polylines (an edit to the same place) keeps the bitmap.
    const still = applyCourseEdit(
      c,
      'project-alignment',
      { op: 'move-point', course: 0, point: 1, uv: coursePoints(c, 0)[1]!.uv },
      editContext(plane, 'v0')
    );
    const again = build(plane, edited(knit(), still));
    expect(again.shape!.knitGraph!.saved).toEqual({ courses: true, loops: false });
    expect(again.shape!.knitGraph!.stages.courses).toEqual(still);
    expect(same(bmpBytes(again), bmpBytes(original))).toBe(true);
    expect(again.exportBlockers).toEqual([]);
    expect(knitReport(again, 'kg', 0.1)).toContain(
      'Courses stage edited on the surface (§6.3.2, pp. 111–112): 1 edits (1 move point)'
    );
  }, 30000);

  it('moves a short-row turn on the saddle and rebuilds a changed layout', () => {
    // Right to left: this test saddle blocks a left-to-right start at its cast-on.
    const rtl = knit({ lab: { ...defaultKnitSettings().lab, firstPass: 'right-to-left' } }),
      original = build(saddle, rtl),
      c = validateKnitGraph(clone(original.shape!.knitGraph!.stages)).courses;
    const k = c.courses.findIndex((x) => !x.rightBoundary);
    expect(k).toBeGreaterThanOrEqual(0);
    const points = coursePoints(c, k);
    const moved = applyCourseEdit(
      c,
      'project-alignment',
      { op: 'move-point', course: k, point: points.length - 1, uv: points.at(-4)!.uv },
      editContext(saddle, 'v0')
    );
    const again = build(saddle, edited(rtl, moved));
    expect(again.shape!.needles.placements.length).toBeLessThan(
      original.shape!.needles.placements.length
    );
    expect(same(bmpBytes(again), bmpBytes(original))).toBe(false);
    expect(again.exportBlockers).toEqual([]);
  }, 60000);

  it('edits Popescu vertices and links; rule breaks block export', () => {
    const stages = stagesOf(plane, popescu),
      c = stages.courses,
      ctx = editContext(plane, 'v0');
    const at = (s: KnitCourseStage, contour: number) =>
      s.vertices
        .map((v, i) => ({ ...v, i }))
        .filter((v) => v.contour === contour)
        .sort((a, b) => a.position - b.position);
    // Moving a vertex keeps the graph valid here.
    const v = c.vertices[30]!;
    const moved = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'move-vertex', vertex: 30, uv: [v.uv[0] + 0.005, v.uv[1] + 0.01] },
      ctx
    );
    expect(moved.vertices[30]!.uv).toEqual([v.uv[0] + 0.005, v.uv[1] + 0.01]);
    expect(build(plane, edited(popescu, moved)).exportBlockers).toEqual([]);

    // A new vertex joins the contour of the nearest vertex, ordered along it; without links it
    // breaks the course connection rule.
    const added = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'add-vertex', uv: [0.5, 0.51] },
      ctx
    );
    const n = added.vertices.at(-1)!;
    const contour = at(added, n.contour);
    expect(contour.map((x) => x.position)).toEqual(contour.map((_, i) => i));
    const along = contour.map((x) => rotatedShapeUV(x.uv, 'v0')[1]);
    expect(along.every((y, i) => !i || y >= along[i - 1]!)).toBe(true);
    const broken = build(plane, edited(popescu, added));
    expect(broken.exportBlockers.some((b) => b.includes('Course connection rule'))).toBe(true);
    expect(knitReport(broken, 'kg', 0.1)).toContain('1 edits (1 add vertex)');

    // Deleting a leaf vertex removes its links and makes its neighbour the leaf.
    const leaf = at(c, 5)[0]!;
    const del = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'delete-vertex', vertex: leaf.i },
      ctx
    );
    expect(del.vertices).toHaveLength(c.vertices.length - 1);
    expect([...del.links, ...del.warp!].flat().every((i) => i < del.vertices.length)).toBe(true);
    expect(at(del, 5)[0]).toMatchObject({ position: 0, leaf: true });
    // A graph whose faces cannot be read as loops stops the build and says how to fix it.
    const r = run(
      plane,
      edited(
        popescu,
        applyCourseEdit(c, 'popescu-2019-rules', { op: 'delete-vertex', vertex: 40 }, ctx)
      )
    );
    expect(r.ok ? '' : r.reason).toMatch(/edit the courses stage further or undo the last edit/);

    // Links join adjacent contours (weft) or neighbours on a contour (warp).
    const [a, b] = c.links[10]!;
    expect(() =>
      applyCourseEdit(
        c,
        'popescu-2019-rules',
        { op: 'add-link', a: at(c, 2)[3]!.i, b: at(c, 6)[3]!.i },
        ctx
      )
    ).toThrow(/adjacent contours/);
    const linked = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'add-link', a: at(c, 3)[2]!.i, b: at(c, 2)[2]!.i },
      ctx
    );
    expect(linked.links.at(-1)).toEqual([at(c, 2)[2]!.i, at(c, 3)[2]!.i]);
    const unlinked = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'delete-link', kind: 'weft', link: 10 },
      ctx
    );
    expect(unlinked.links).toHaveLength(c.links.length - 1);
    expect(build(plane, edited(popescu, unlinked)).exportBlockers.length).toBeGreaterThan(0);
    const other = at(c, c.vertices[b]!.contour).find((x) => x.i !== b)!;
    const reattached = applyCourseEdit(
      c,
      'popescu-2019-rules',
      { op: 'reattach-link', kind: 'weft', link: 10, end: 1, vertex: other.i },
      ctx
    );
    expect(reattached.links[10]).toEqual([a, other.i]);
    expect(() =>
      applyCourseEdit(
        c,
        'popescu-2019-rules',
        { op: 'reattach-link', kind: 'weft', link: 10, end: 1, vertex: a },
        ctx
      )
    ).toThrow(/two different vertices/);
    expect(() =>
      applyCourseEdit(
        c,
        'popescu-2019-rules',
        { op: 'move-point', course: 0, point: 0, uv: [0, 0] },
        ctx
      )
    ).toThrow(/does not edit/);
  }, 60000);

  it('saves edits with the stage and keeps an edited stale stage until the user discards it', () => {
    const stages = stagesOf(plane, knit()),
      courses = applyCourseEdit(
        stages.courses,
        'project-alignment',
        { op: 'delete-course', course: 3 },
        editContext(plane, 'v0')
      ),
      graph: KnitGraphStages = { courseMethod: 'project-alignment', courses },
      project = { surface: plane, knit: knit({ graph }), swatches };
    expect(validateKnitGraph(clone(graph))).toEqual(graph);
    const file = parseStageFile(stageFileText('project-alignment', courses));
    expect(file.stage).toEqual(courses);
    expect(loadStage({ ...project, knit: knit() }, file)).toEqual(graph);
    const bad = clone(graph);
    (bad.courses.edits![0] as { op: string }).op = 'rotate';
    expect(() => validateKnitGraph(bad)).toThrow();

    expect(knitGraphFreshness(project)).toMatchObject({ courses: 'fresh', loops: 'missing' });
    expect(staleStagesBlocker(project)).toBeNull();
    const changed = { ...project, surface: { ...plane, size: 0.11 } };
    expect(staleStagesBlocker(changed)).toMatch(/edited courses stage is stale.*discard its edits/);
    expect(staleStagesBlocker({ ...changed, knit: knit({ graph: stages }) })).toMatch(
      /Generate to replace them/
    );

    // An edit is an undo step; a build never replaces an edited stage, but may add its loops.
    const present = {
      surface: plane,
      knit: knit({ graph: stages }),
      swatches,
      revision: 1,
    } as unknown as Parameters<typeof historyReducer>[0]['present'];
    let history = historyReducer(
      { past: [], present, future: [] },
      { type: 'commit', next: { ...present, knit: knit({ graph }) } }
    );
    expect(history.past).toHaveLength(1);
    expect(history.present.knit?.graph).toEqual(graph);
    const refused = historyReducer(history, { type: 'accept-knit-graph', graph: stages });
    expect(refused).toBe(history);
    const rebuilt = validateKnitGraph(
      clone(build(plane, knit({ graph })).shape!.knitGraph!.stages)
    );
    expect(rebuilt.courses).toEqual(courses);
    history = historyReducer(history, { type: 'accept-knit-graph', graph: rebuilt });
    expect(history.present.knit?.graph?.loops).toBeDefined();
    expect(history.past).toHaveLength(1);
    const stale = {
      ...history,
      present: { ...history.present, surface: { ...plane, size: 0.11 } },
    };
    const fresh = stagesOf({ ...plane, size: 0.11 }, knit());
    expect(historyReducer(stale, { type: 'accept-knit-graph', graph: fresh })).toBe(stale);
    expect(historyReducer(history, { type: 'undo' }).present.knit?.graph).toEqual(stages);
  }, 60000);

  it('turns clicks and drags on the surface into edits', () => {
    const p = stagesOf(plane, popescu).courses,
      q = stagesOf(plane, knit()).courses;
    const handles = editHandles(p, 'popescu-2019-rules', plane);
    expect(handles.points).toHaveLength(p.vertices.length);
    expect(handles.segments).toHaveLength(p.links.length + p.warp!.length);
    const rows = editHandles(q, 'project-alignment', plane);
    const counts = q.courses.map((_, k) => coursePoints(q, k).length);
    expect(rows.points).toHaveLength(counts.reduce((s, n) => s + n, 0));
    expect(rows.segments).toHaveLength(counts.reduce((s, n) => s + n - 1, 0));

    const hit = (extra: object) => ({ uv: [0.4, 0.4] as Vec2, position: null, ...extra });
    const drop = (extra: object) => ({ drop: hit({ uv: [0.5, 0.5] as Vec2, ...extra }) });
    expect(editFromIntent('move-vertex', hit({ point: 'v:3', ...drop({}) }), p, plane)).toEqual({
      edit: { op: 'move-vertex', vertex: 3, uv: [0.5, 0.5] },
    });
    expect(editFromIntent('move-vertex', hit({ point: 'v:3' }), p, plane)).toHaveProperty(
      'message'
    );
    expect(editFromIntent('move-vertex', hit({}), p, plane)).toBeNull();
    expect(
      editFromIntent('add-link', hit({ point: 'v:3', ...drop({ point: 'v:7' }) }), p, plane)
    ).toEqual({ edit: { op: 'add-link', a: 3, b: 7 } });
    const [a, b] = p.links[0]!,
      near = editHandles(p, 'popescu-2019-rules', plane).points[b]!.position;
    expect(
      editFromIntent(
        'reattach-link',
        { segment: 'w:0', uv: [0, 0], position: near, ...drop({ point: `v:${a + 1}` }) },
        p,
        plane
      )
    ).toEqual({ edit: { op: 'reattach-link', kind: 'weft', link: 0, end: 1, vertex: a + 1 } });
    expect(editFromIntent('delete-link', hit({ segment: 'r:2' }), p, plane)).toEqual({
      edit: { op: 'delete-link', kind: 'warp', link: 2 },
    });
    expect(editFromIntent('insert-point', hit({ segment: 's:2:4' }), q, plane)).toEqual({
      edit: { op: 'insert-point', course: 2, after: 4, uv: [0.4, 0.4] },
    });
    expect(editFromIntent('delete-course', hit({ point: 'p:5:0' }), q, plane)).toEqual({
      edit: { op: 'delete-course', course: 5 },
    });
    expect(editFromIntent('add-course', hit({}), q, plane, [[0.1, 0.4]])).toEqual({
      draft: [
        [0.1, 0.4],
        [0.4, 0.4],
      ],
    });
  }, 30000);
});
