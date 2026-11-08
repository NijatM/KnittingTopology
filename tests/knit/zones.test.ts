import { describe, it, expect } from 'vitest';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, validateKnitSettings } from '../../src/knit/settings';
import { knitReport } from '../../src/knit/report';
import { bmpBytes } from '../../src/knit/files';
import { chartMapping } from '../../src/knit/mapping';
import { evaluateSurface } from '../../src/core/surfaces';
import { addSplit, pieceBuild, toggleEdge } from '../../src/knit/patches';
import { loopPatch } from '../../src/knit/patch-join';
import {
  cellLoops,
  markZones,
  markedBmp,
  markedProblems,
  nextZoneColour,
  validateZones,
  zoneMapJson,
  zoneRuns,
} from '../../src/knit/zones';
import type { KnitSettings, KnitZone, SurfaceSpec, Vec3 } from '../../src/core/types';

// Test values (not lab measurements): 6 mm stitch width, 4 mm course height.
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'pt' };
const saddle: SurfaceSpec = { kind: 'saddle', size: 0.1, curvature: 1, revision: 'pt' };
const knit = (extra: Partial<KnitSettings> = {}): KnitSettings => ({
  ...defaultKnitSettings(),
  mode: 'shape',
  ...extra,
});
function build(surface: SurfaceSpec, settings: KnitSettings) {
  const r = buildKnitProgram({ surface, graph: null, swatches, knit: settings });
  if (!r.ok) throw new Error(r.reason);
  return r.program;
}
const stroke = (width: number, points: [number, number][], id = 'Z1'): KnitZone => ({
  id,
  name: 'rod channel',
  kind: 'channel',
  rgb: [255, 0, 255],
  shape: { kind: 'stroke', points, width },
});
const region = (points: [number, number][], id = 'Z2', rgb: KnitZone['rgb'] = [255, 128, 0]) => ({
  id,
  name: '',
  kind: 'pocket' as const,
  rgb,
  shape: { kind: 'region' as const, points },
});
const square = (a: number, b: number): [number, number][] => [
  [a, a],
  [b, a],
  [b, b],
  [a, b],
];
function segmentDistance(p: Vec3, a: Vec3, b: Vec3) {
  const ab = [0, 1, 2].map((d) => b[d]! - a[d]!),
    ap = [0, 1, 2].map((d) => p[d]! - a[d]!);
  const t = Math.max(
    0,
    Math.min(
      1,
      (ap[0]! * ab[0]! + ap[1]! * ab[1]! + ap[2]! * ab[2]!) / ab.reduce((s, x) => s + x * x, 0)
    )
  );
  return Math.hypot(...[0, 1, 2].map((d) => p[d]! - a[d]! - ab[d]! * t));
}

describe('feature zones (intent only; Popescu 2019, §6.3.2, p. 112)', () => {
  it('validates zones and keeps them through the knit settings round trip', () => {
    const zones = [
      stroke(0.012, [
        [0.5, 0],
        [0.5, 1],
      ]),
      region(square(0.2, 0.4)),
    ];
    expect(validateZones(JSON.parse(JSON.stringify(zones)))).toEqual(zones);
    const settings = knit({ zones });
    expect(validateKnitSettings(JSON.parse(JSON.stringify(settings))).zones).toEqual(zones);
    expect(validateKnitSettings(JSON.parse(JSON.stringify(knit()))).zones).toBeUndefined();
    const bad = (change: Record<string, unknown>) => () =>
      validateZones([
        {
          ...stroke(0.01, [
            [0, 0],
            [1, 1],
          ]),
          ...change,
        },
      ]);
    expect(bad({ kind: 'rib' })).toThrow(/kind must be one of/);
    expect(bad({ rgb: [0, 0, 256] })).toThrow(/colour/);
    expect(bad({ shape: { kind: 'stroke', points: [[0, 0]], width: 0.01 } })).toThrow(
      /2 to 64 points/
    );
    expect(
      bad({
        shape: {
          kind: 'stroke',
          points: [
            [0, 0],
            [1, 1],
          ],
          width: 0,
        },
      })
    ).toThrow(/width/);
    expect(
      bad({
        shape: {
          kind: 'region',
          points: [
            [0, 0],
            [1, 1],
          ],
        },
      })
    ).toThrow(/3 to 64 points/);
    expect(
      bad({
        shape: {
          kind: 'region',
          points: [
            [0, 0],
            [1, 1.2],
            [0, 1],
          ],
        },
      })
    ).toThrow(/0 to 1/);
    expect(() => validateZones([region(square(0, 1), 'Z1'), region(square(0, 1), 'Z1')])).toThrow(
      /unique ID/
    );
    expect(() =>
      validateZones(Array.from({ length: 33 }, (_, i) => region(square(0, 1), `Z${i}`)))
    ).toThrow(/at most 32/);
  });

  it('marks a stroke by 3D distance to its path on the surface and a region by chart position', () => {
    const zones = [
      stroke(0.012, [
        [0.5, 0],
        [0.5, 1],
      ]),
      region(square(0.2, 0.4)),
    ];
    const p = build(plane, knit({ zones }));
    // Zones change no operation.
    expect(p.cells).toEqual(build(plane, knit()).cells);
    const marks = markZones(p, plane, zones);
    const loops = cellLoops(p);
    const a = evaluateSurface(plane, 0, 0.5, 0),
      b = evaluateSurface(plane, 0, 0.5, 1);
    loops.forEach((l, i) => {
      if (!l) return;
      expect(marks.cells[0]!.includes(i)).toBe(segmentDistance(l.position, a, b) <= 0.006);
      const [u, v] = l.uv;
      expect(marks.cells[1]!.includes(i)).toBe(u > 0.2 && u < 0.4 && v > 0.2 && v < 0.4);
    });
    expect(marks.cells[0]!.length).toBeGreaterThan(0);
    expect(marks.cells[1]!.length).toBeGreaterThan(0);
    // The stroke runs along the wales across the whole chart: each marked needle is marked on every pass.
    expect(zoneRuns(marks, 0)).toEqual({ needles: expect.any(Number), passes: p.h });
    expect(marks.overlaps).toBe(0);
  });

  it('draws the zone lower in the list on top and counts overlapping cells', () => {
    const big = region(square(0.1, 0.6), 'Z1', [255, 0, 255]),
      small = region(square(0.3, 0.5), 'Z2');
    const p = build(plane, knit());
    const marks = markZones(p, plane, [big, small]);
    const both = marks.cells[1]!.filter((i) => marks.cells[0]!.includes(i));
    expect(both).toEqual(marks.cells[1]);
    expect(marks.overlaps).toBe(both.length);
    expect(both.every((i) => marks.top[i] === 1)).toBe(true);
    const reversed = markZones(p, plane, [small, big]);
    expect(both.every((i) => reversed.top[i] === 1)).toBe(true);
  });

  it('marks every cell of a rectangular chart layout without shaping at its chart position', () => {
    const settings = knit({ mode: 'network', size: { source: 'typed', needles: 10, passes: 6 } });
    const program = {
      w: 10,
      h: 6,
      shape: undefined,
      mapping: chartMapping(plane, 10, 6),
      settings,
    };
    const flat = markZones(program, plane, [
      region([
        [0, 0.5],
        [0.5, 0.5],
        [1, 0.5],
      ]),
    ]);
    expect(flat.cells[0]).toHaveLength(0); // a region without area marks nothing
    const half = markZones(program, plane, [
      region([
        [0, 0],
        [0.5, 0],
        [0.5, 1],
        [0, 1],
      ]),
    ]);
    // Five of ten needle columns, every pass.
    expect(half.cells[0]).toHaveLength(5 * 6);
    expect(half.cells[0]!.every((i) => i % 10 < 5)).toBe(true);
  });

  it('writes the marked BMP and the zone map; the operation BMP is unchanged', () => {
    const zones = [
      stroke(0.012, [
        [0.5, 0],
        [0.5, 1],
      ]),
    ];
    const p = build(plane, knit({ zones }));
    const marks = markZones(p, plane, zones);
    const ops = bmpBytes(p);
    const marked = markedBmp(p, zones, marks);
    expect(bmpBytes(p)).toEqual(ops);
    const rowBytes = Math.ceil((p.w * 24) / 32) * 4;
    const pixel = (bytes: Uint8Array, i: number) => {
      const x = i % p.w,
        y = Math.floor(i / p.w),
        o = 54 + (p.h - 1 - y) * rowBytes + x * 3;
      return [bytes[o + 2], bytes[o + 1], bytes[o]];
    };
    for (let i = 0; i < p.w * p.h; i++)
      expect(pixel(marked, i)).toEqual(marks.top[i]! >= 0 ? [255, 0, 255] : pixel(ops, i));
    const map = JSON.parse(zoneMapJson(plane, zones, marks, null));
    expect(map).toMatchObject({
      format: 'knit-zone-map',
      version: 1,
      needles: p.w,
      passes: p.h,
      overlapCells: 0,
      zones: [{ id: 'Z1', kind: 'channel', loops: marks.cells[0]!.length }],
    });
    // Cells as 1-based needle and pass (pass 1 = bottom row).
    const first = marks.cells[0]![0]!;
    expect(map.zones[0].cells[0]).toEqual([(first % p.w) + 1, p.h - Math.floor(first / p.w)]);
    expect(zoneMapJson(plane, zones, marks, null)).toMatch(/\[\d+, \d+\]/);
  });

  it('refuses the marked BMP while a zone colour equals a key colour or another zone colour', () => {
    const p = build(plane, knit());
    const clash = { ...region(square(0.2, 0.4)), rgb: [0, 0, 255] as KnitZone['rgb'] };
    expect(markedProblems([clash], p.key)).toEqual([
      "Zone Z2 has the colour of the key's knit front (#0000ff): choose another colour.",
    ]);
    expect(() => markedBmp(p, [clash], markZones(p, plane, [clash]))).toThrow(/knit front/);
    const twins = [region(square(0.1, 0.2), 'Z1'), region(square(0.3, 0.4), 'Z2')];
    expect(markedProblems(twins, p.key)).toEqual([
      'Zones Z1 and Z2 share a colour: choose another.',
    ]);
    // Default colours skip the key's colours and colours already in use.
    const c = nextZoneColour([], p.key);
    expect(p.key.ops.some((o) => o.rgb.every((x, i) => x === c[i]))).toBe(false);
    expect(nextZoneColour([{ ...clash, rgb: c }], p.key)).not.toEqual(c);
  });

  it('lists zones in the report as intent only', () => {
    const zones = [
      stroke(0.012, [
        [0.5, 0],
        [0.5, 1],
      ]),
      region(square(0.95, 0.99)),
    ];
    const p = build(plane, knit({ zones }));
    const marks = markZones(p, plane, zones);
    const report = knitReport(p, 'test', plane.size, { zones, marks });
    expect(report).toContain(
      'Feature zones (intent only; Popescu 2019, §6.3.2, p. 112; §6.4.1, pp. 113–114): they change no operation.'
    );
    expect(report).toMatch(
      /Z1 "rod channel" \(channel, stroke 12 mm wide, #ff00ff\): \d+ loops; about \d+ needles across where it crosses a pass, 25 passes across where it crosses a needle\./
    );
    expect(knitReport(p, 'test', plane.size)).not.toContain('Feature zones');
  });

  it('marks a zone across computational patches: each piece shows its part', () => {
    const zones = [region(square(0.3, 0.7))];
    // Knitted through: one piece holds loops of both patches in the zone.
    const joined = build(saddle, addSplit(knit({ zones }), 'u', 0.5));
    const marks = markZones(joined, saddle, zones);
    expect(
      new Set(
        marks.cells[0]!.map((i) =>
          loopPatch(joined.shape!.needles.placements[joined.shape!.placementAt[i]!]!.loop.id)
        )
      )
    ).toEqual(new Set([0, 1]));
    // A seam: each piece's bitmap marks only its own loops in the zone.
    const split = toggleEdge(addSplit(knit({ zones }), 'u', 0.5), 'u1:1');
    const program = build(saddle, split);
    const counts = [0, 1].map((patch) => {
      const b = pieceBuild(program.patches!, patch);
      if (!b.ok) throw new Error(b.reason);
      return markZones(b.program, saddle, zones).cells[0]!.length;
    });
    expect(counts.every((n) => n > 0)).toBe(true);
  });
});
