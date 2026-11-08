// Feature zones (Popescu 2019, §6.3.2, p. 112; §6.4.1, pp. 113–114): channels, openings, pockets, inlays,
// material regions and colour patterns marked on the surface. As in the thesis, a zone marks where a feature
// goes, not the operations that make it: zones change no operation. The marked bitmap shows each zone's cells in
// its colour, to be filled with feature clusters in the lab software (Fig. 6.19).
import type { KnitZone, KnitZoneKind, SurfaceSpec, Vec2, Vec3 } from '../core/types';
import { evaluateSurface } from '../core/surfaces';
import type { KnitProgram } from './program';
import { hex, type Key, type RGB } from './keys';
import { UNKNOWN, type KnitCells } from './grid';
import { bmpBytes } from './files';
import { originalShapeUV } from './shape-geometry';

/** Project limits. */
export const MAX_ZONES = 32,
  MAX_ZONE_POINTS = 64,
  MIN_ZONE_WIDTH = 0.0001,
  MAX_ZONE_WIDTH = 1;
export const ZONE_MAP_FORMAT = 'knit-zone-map';
/** Kinds marked in the thesis (§6.3.2, p. 112), with their display names. */
export const ZONE_KINDS: Record<KnitZoneKind, string> = {
  channel: 'channel',
  opening: 'opening',
  pocket: 'pocket',
  inlay: 'inlay or insert',
  material: 'material region',
  colour: 'colour pattern',
};
/** Default zone colours (project choice; magenta as in the thesis's Fig. 6.19), skipped when the key or another
 *  zone uses them. */
const ZONE_COLOURS: RGB[] = [
  [255, 0, 255],
  [255, 128, 0],
  [0, 160, 160],
  [128, 0, 128],
  [160, 96, 32],
  [255, 96, 160],
  [96, 96, 0],
  [0, 96, 128],
];

const sameRgb = (a: readonly number[], b: readonly number[]) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The first default colour that neither the key nor another zone uses. */
export function nextZoneColour(zones: readonly KnitZone[], key: Key): RGB {
  const used = [...key.ops.map((o) => o.rgb), ...zones.map((z) => z.rgb)];
  for (const c of ZONE_COLOURS) if (!used.some((u) => sameRgb(u, c))) return [...c] as RGB;
  for (let i = 0; ; i++) {
    const c: RGB = [(37 * i + 200) % 256, (91 * i + 40) % 256, (53 * i + 120) % 256];
    if (!used.some((u) => sameRgb(u, c))) return c;
  }
}
/** The next free zone ID, `Z<n>`. */
export function nextZoneId(zones: readonly KnitZone[]): string {
  let n = zones.length + 1;
  while (zones.some((z) => z.id === `Z${n}`)) n++;
  return `Z${n}`;
}

/** A zone's shape problem, or null. */
export function zoneShapeProblem(shape: KnitZone['shape']): string | null {
  const least = shape.kind === 'stroke' ? 2 : 3;
  if (shape.points.length < least || shape.points.length > MAX_ZONE_POINTS)
    return `A ${shape.kind} needs ${least} to ${MAX_ZONE_POINTS} points.`;
  if (
    shape.points.some(
      (p) => !p.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1)
    )
  )
    return 'Zone points must be chart values from 0 to 1.';
  if (
    shape.kind === 'stroke' &&
    !(
      Number.isFinite(shape.width) &&
      shape.width >= MIN_ZONE_WIDTH &&
      shape.width <= MAX_ZONE_WIDTH
    )
  )
    return `A stroke width must be from ${MIN_ZONE_WIDTH * 1000} to ${MAX_ZONE_WIDTH * 1000} mm.`;
  return null;
}

/** Validated copy of `knit.zones`; throws a descriptive Error. */
export function validateZones(value: unknown): KnitZone[] {
  if (!Array.isArray(value) || value.length > MAX_ZONES)
    throw new Error(`feature zones must be a list of at most ${MAX_ZONES}.`);
  const ids = new Set<string>();
  return value.map((raw, i) => {
    const z = raw as Record<string, unknown>,
      at = `feature zone ${i + 1}`;
    if (!z || typeof z !== 'object' || Array.isArray(z))
      throw new Error(`${at} must be an object.`);
    if (typeof z.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(z.id) || ids.has(z.id))
      throw new Error(`${at} needs a unique ID of letters, digits, _ or -.`);
    ids.add(z.id);
    if (typeof z.name !== 'string' || z.name.length > 80)
      throw new Error(`${at} name must be text of at most 80 characters.`);
    if (typeof z.kind !== 'string' || !(z.kind in ZONE_KINDS))
      throw new Error(`${at} kind must be one of ${Object.keys(ZONE_KINDS).join(', ')}.`);
    if (
      !Array.isArray(z.rgb) ||
      z.rgb.length !== 3 ||
      z.rgb.some((c) => typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > 255)
    )
      throw new Error(`${at} colour must be three integers from 0 to 255.`);
    const s = z.shape as Record<string, unknown> | undefined;
    if (!s || typeof s !== 'object' || (s.kind !== 'stroke' && s.kind !== 'region'))
      throw new Error(`${at} shape must be a stroke or a region.`);
    if (!Array.isArray(s.points) || s.points.some((p) => !Array.isArray(p) || p.length !== 2))
      throw new Error(`${at} points must be chart (u, v) pairs.`);
    const points = (s.points as unknown[][]).map((p) => [p[0], p[1]] as Vec2);
    const shape: KnitZone['shape'] =
      s.kind === 'stroke'
        ? { kind: 'stroke', points, width: s.width as number }
        : { kind: 'region', points };
    const problem = zoneShapeProblem(shape);
    if (problem) throw new Error(`${at}: ${problem}`);
    return {
      id: z.id,
      name: z.name,
      kind: z.kind as KnitZoneKind,
      rgb: [...(z.rgb as number[])] as RGB,
      shape,
    };
  });
}

const at = (surface: SurfaceSpec, uv: Vec2): Vec3 => evaluateSurface(surface, 0, uv[0], uv[1]);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Chart samples of a zone's outline: straight chart lines between its points, closed for a region. */
export function zoneChartPath(shape: KnitZone['shape'], perSegment = 16): Vec2[] {
  const pts = shape.kind === 'region' ? [...shape.points, shape.points[0]!] : shape.points;
  const out: Vec2[] = pts.length ? [pts[0]!] : [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!,
      b = pts[i]!;
    for (let t = 1; t <= perSegment; t++)
      out.push([a[0] + ((b[0] - a[0]) * t) / perSegment, a[1] + ((b[1] - a[1]) * t) / perSegment]);
  }
  return out;
}
/** A zone's outline on the surface. */
export function zoneSurfacePath(surface: SurfaceSpec, shape: KnitZone['shape']): Vec3[] {
  return zoneChartPath(shape).map((uv) => at(surface, uv));
}

/** A stroke's path on the surface, sampled finely enough for its width (project rule: subsegments no longer than
 *  half the width, 4 to 512 per chart segment). */
function strokePath(surface: SurfaceSpec, points: readonly Vec2[], width: number): Vec3[] {
  const out: Vec3[] = [at(surface, points[0]!)];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      chord = dist(at(surface, a), at(surface, b));
    const n = Math.min(512, Math.max(4, Math.ceil(chord / (width / 2))));
    for (let t = 1; t <= n; t++)
      out.push(at(surface, [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n]));
  }
  return out;
}
function segmentDistance(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
    ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const len = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2;
  const t =
    len > 0
      ? Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / len))
      : 0;
  return dist(p, [a[0] + ab[0]! * t, a[1] + ab[1]! * t, a[2] + ab[2]! * t]);
}
/** Even-odd point in polygon. */
function insidePolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** The surface loop of each program cell: chart point and 3D centre, or null where the cell has no loop. */
export function cellLoops(
  program: Pick<KnitProgram, 'w' | 'h' | 'shape' | 'mapping' | 'settings'>
) {
  const { w, h, shape } = program,
    out: ({ uv: Vec2; position: Vec3 } | null)[] = new Array(w * h).fill(null);
  if (shape) {
    shape.placementAt.forEach((n, i) => {
      const loop = n < 0 ? undefined : shape.needles.placements[n]?.loop;
      if (loop && loop.position.every(Number.isFinite))
        out[i] = { uv: loop.uv, position: loop.position };
    });
    return out;
  }
  // Rectangular chart layouts without shaping: every cell is a loop at its chart position.
  const edge = program.settings.startEdge ?? 'v0';
  for (let i = 0; i < w * h; i++) {
    const j = i % w,
      k = h - 1 - Math.floor(i / w);
    out[i] = {
      uv: originalShapeUV((j + 0.5) / w, (k + 0.5) / h, edge),
      position: program.mapping.toSurface([j + 0.5, k + 0.5]),
    };
  }
  return out;
}

export interface ZoneMarks {
  w: number;
  h: number;
  /** Per image cell: index of the zone drawn on top (the lowest in the list), or -1. */
  top: Int16Array;
  /** Per zone: its image cells, in image order. */
  cells: number[][];
  /** Cells in more than one zone. */
  overlaps: number;
}

/** Cells of each zone in a program (project rule: a region by chart position, even-odd; a stroke by 3D distance
 *  to its path on the surface, within half its width). */
export function markZones(
  program: Pick<KnitProgram, 'w' | 'h' | 'shape' | 'mapping' | 'settings'>,
  surface: SurfaceSpec,
  zones: readonly KnitZone[]
): ZoneMarks {
  const loops = cellLoops(program),
    top = new Int16Array(program.w * program.h).fill(-1),
    count = new Uint8Array(top.length),
    cells: number[][] = zones.map(() => []);
  zones.forEach((zone, z) => {
    const s = zone.shape;
    let test: (l: { uv: Vec2; position: Vec3 }) => boolean;
    if (s.kind === 'region') test = (l) => insidePolygon(l.uv, s.points);
    else {
      const path = strokePath(surface, s.points, s.width),
        r = s.width / 2,
        lo = [0, 1, 2].map((d) => Math.min(...path.map((p) => p[d]!)) - r),
        hi = [0, 1, 2].map((d) => Math.max(...path.map((p) => p[d]!)) + r);
      test = (l) => {
        const p = l.position;
        if ([0, 1, 2].some((d) => p[d]! < lo[d]! || p[d]! > hi[d]!)) return false;
        for (let i = 1; i < path.length; i++)
          if (segmentDistance(p, path[i - 1]!, path[i]!) <= r) return true;
        return false;
      };
    }
    loops.forEach((l, i) => {
      if (!l || !test(l)) return;
      cells[z]!.push(i);
      top[i] = z;
      count[i]!++;
    });
  });
  return { w: program.w, h: program.h, top, cells, overlaps: count.filter((c) => c > 1).length };
}

/** Median run of marked cells along passes (needles across) and along needles (passes across). */
export function zoneRuns(marks: ZoneMarks, z: number): { needles: number; passes: number } | null {
  const { w, h } = marks,
    set = new Set(marks.cells[z]);
  if (!set.size) return null;
  const runs = (outer: number, inner: number, index: (o: number, i: number) => number) => {
    const out: number[] = [];
    for (let o = 0; o < outer; o++) {
      let run = 0;
      for (let i = 0; i <= inner; i++) {
        if (i < inner && set.has(index(o, i))) run++;
        else if (run) {
          out.push(run);
          run = 0;
        }
      }
    }
    out.sort((a, b) => a - b);
    return out[Math.floor((out.length - 1) / 2)]!;
  };
  return {
    needles: runs(h, w, (y, x) => y * w + x),
    passes: runs(w, h, (x, y) => y * w + x),
  };
}

/** Why the marked bitmap cannot be written, or an empty list. */
export function markedProblems(zones: readonly KnitZone[], key: Key): string[] {
  const out: string[] = [];
  zones.forEach((z, i) => {
    const op = key.ops.find((o) => sameRgb(o.rgb, z.rgb));
    if (op)
      out.push(
        `Zone ${z.id} has the colour of the key's ${op.name} (${hex(z.rgb as RGB)}): choose another colour.`
      );
    const twin = zones.findIndex((o) => sameRgb(o.rgb, z.rgb));
    if (twin < i) out.push(`Zones ${zones[twin]!.id} and ${z.id} share a colour: choose another.`);
  });
  return out;
}

/** The marked bitmap: the operation cells with each zone's cells in the zone's colour (not a Knit Grammar
 *  program). Zone z is written as the unknown colour UNKNOWN + z. */
export function markedCells(
  program: KnitCells,
  zones: readonly KnitZone[],
  marks: ZoneMarks
): { cells: KnitCells; colours: RGB[] } {
  const cells = Uint8Array.from(program.cells);
  marks.top.forEach((z, i) => {
    if (z >= 0) cells[i] = UNKNOWN + z;
  });
  return {
    cells: { ...program, cells },
    colours: zones.map((z) => [...z.rgb] as RGB),
  };
}
/** Marked BMP bytes; throws when a zone colour clashes or the program cannot be exported. */
export function markedBmp(program: KnitCells, zones: readonly KnitZone[], marks: ZoneMarks) {
  const problems = markedProblems(zones, program.key);
  if (problems.length) throw new Error(problems.join(' '));
  const { cells, colours } = markedCells(program, zones, marks);
  return bmpBytes(cells, colours);
}

/** `knit-zone-map` JSON (version 1): each zone with its cells as 1-based needle and pass. */
export function zoneMapJson(
  surface: SurfaceSpec,
  zones: readonly KnitZone[],
  marks: ZoneMarks,
  piece: string | null
): string {
  const { w, h } = marks;
  return JSON.stringify(
    {
      format: ZONE_MAP_FORMAT,
      version: 1,
      units: 'm',
      method:
        'Feature zones (Popescu 2019, §6.3.2, p. 112): a region marks the loops whose chart position is inside it (even-odd rule); a stroke marks the loops whose 3D centre is within half its width of its path on the surface (project rule).',
      note: 'Feature intent only: no operation is changed. Fill the zones with feature clusters in the lab software (§6.4.1, pp. 113–114).',
      surface: {
        kind: surface.kind,
        size: surface.size,
        curvature: surface.curvature,
        revision: surface.revision,
        mapping: surface.mapping ?? null,
      },
      piece,
      needles: w,
      passes: h,
      overlapCells: marks.overlaps,
      zones: zones.map((z, i) => ({
        id: z.id,
        name: z.name,
        kind: z.kind,
        rgb: z.rgb,
        shape: z.shape,
        loops: marks.cells[i]!.length,
        cells: marks.cells[i]!.map((c) => [(c % w) + 1, h - Math.floor(c / w)]),
      })),
    },
    null,
    2
  ).replace(/\[\s+(\d+),\s+(\d+)\s+\]/g, '[$1, $2]');
}

/** Report lines for the zones of the program shown. */
export function zoneLines(zones: readonly KnitZone[], marks: ZoneMarks): string[] {
  if (!zones.length) return [];
  const lines = [
    'Feature zones (intent only; Popescu 2019, §6.3.2, p. 112; §6.4.1, pp. 113–114): they change no operation. Fill them with feature clusters in the lab software, using the zone map and the marked BMP. A region marks the loops whose chart position is inside it; a stroke marks the loops within half its width of its path on the surface (project rule).',
  ];
  zones.forEach((z, i) => {
    const n = marks.cells[i]!.length,
      shape =
        z.shape.kind === 'stroke'
          ? `stroke ${+(z.shape.width * 1000).toFixed(2)} mm wide`
          : `region of ${z.shape.points.length} points`,
      runs = z.shape.kind === 'stroke' ? zoneRuns(marks, i) : null;
    lines.push(
      `  ${z.id} ${z.name ? `"${z.name}" ` : ''}(${ZONE_KINDS[z.kind]}, ${shape}, ${hex(z.rgb as RGB)}): ${
        n ? `${n} loops` : 'no loops in this bitmap'
      }${runs ? `; about ${runs.needles} needles across where it crosses a pass, ${runs.passes} passes across where it crosses a needle` : ''}.`
    );
  });
  if (marks.overlaps)
    lines.push(
      `  ${marks.overlaps} cells lie in more than one zone; the zone lower in the list is drawn on top.`
    );
  return lines;
}
