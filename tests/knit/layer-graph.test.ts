import { describe, expect, it } from 'vitest';
import type { ProjectState, SurfaceSpec } from '../../src/core/types';
import {
  createProject,
  historyReducer,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { TWO } from '../../src/knit/keys';
import { buildKnitProgram, type KnitProgram } from '../../src/knit/program';
import {
  applyLayerModel,
  inspectLayerGraph,
  layerGraphJson,
  layerLoopId,
} from '../../src/knit/layer-graph';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { programSequence } from '../../src/knit/sequence';
import { imageIndex } from '../../src/knit/grid';
import { courseStageFingerprint } from '../../src/knit/knit-graph';
import { withoutMappings, withMappings } from '../../src/knit/client';
import { knitReport } from '../../src/knit/report';
import { mappedChart } from './shape-fixtures';
import { addSplit } from '../../src/knit/patches';

// Synthetic test values, not measured gauges or machine specifications.
const gauge = { stitchWidth: 0.006, courseHeight: 0.004 };
function input(
  surface: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'layer-test' }
): ProjectState {
  return {
    ...createProject(),
    surface,
    graph: null,
    swatches: [{ structure: 'jersey', ...gauge }],
    knit: {
      ...withKey({ ...defaultKnitSettings(), mode: 'shape' }, TWO.id).settings,
      layerModel: 'shared-reference-v1',
    },
  };
}
function build(p = input()): KnitProgram {
  const b = buildKnitProgram(p);
  if (!b.ok) throw new Error(b.reason);
  return b.program;
}
const swapAt = (p: KnitProgram, j: number, k: number) => {
  const operations = programSequence(p),
    index = operations.symbols.length;
  operations.symbols.push({
    id: 'analytic-swap',
    steps: [
      { kind: 'knit', guide: 1, bed: 'front' },
      { kind: 'knit', guide: 2, bed: 'back' },
      { kind: 'transfer', bed: 'front', offset: 0 },
      { kind: 'transfer', bed: 'back', offset: 0 },
    ],
  });
  operations.rows[k * p.w + j] = index;
  return { ...p, operations };
};

describe('shared geometry with distinct logical layer histories', () => {
  it('copies each geometric reference with disjoint layer IDs and expected parent histories', () => {
    const p = build(),
      g = p.layerGraph!;
    expect(g.supported).toBe(true);
    expect(g.blockers).toEqual([]);
    expect(g.nodes.length).toBe(2 * p.shape!.needles.placements.length);
    expect(g.counts.failed).toBe(0);
    expect(new Set(g.nodes.map((n) => n.id)).size).toBe(g.nodes.length);
    for (const n of g.nodes) {
      expect(n.id).toBe(layerLoopId(n.layer, n.source));
      expect(n.actualParents).toEqual(n.parents);
      expect(n.parents.every((id) => id.startsWith(n.layer + ':'))).toBe(true);
    }
    expect(g.nodes[0]!.position).toEqual(g.nodes[1]!.position);
    expect(g.nodes[0]!.uv).toEqual(g.nodes[1]!.uv);
    expect(g.nodes[0]!.id).not.toBe(g.nodes[1]!.id);
  });
  it('leaves bitmap bytes and all default output semantics unchanged when the model is absent', () => {
    const p = input(),
      plain = { ...p, knit: { ...p.knit!, layerModel: undefined } };
    const a = build(p),
      b = build(plain);
    expect(b.layerGraph).toBeUndefined();
    expect(a.cells).toEqual(b.cells);
    expect(bmpBytes(a)).toEqual(bmpBytes(b));
    expect(grammarJson({ ...a, name: 'test', note: '' })).toBe(
      grammarJson({ ...b, name: 'test', note: '' })
    );
    expect(a.shape).toEqual(b.shape);
  });
  it('detects a bed swap even when both incoming histories have the same unqualified source ID', () => {
    const p = build(),
      j = 3,
      g = inspectLayerGraph(swapAt(p, j, 0), input().surface);
    const targets = g.nodes.filter((n) => n.pass === 1 && n.needle === j);
    expect(targets).toHaveLength(2);
    for (const n of targets) {
      expect(n.matched).toBe(false);
      expect(n.parents).toHaveLength(1);
      expect(n.actualParents).toHaveLength(1);
      expect(n.parents[0]!.split(':').slice(1).join(':')).toBe(
        n.actualParents![0]!.split(':').slice(1).join(':')
      );
      expect(n.parents[0]).not.toBe(n.actualParents![0]);
    }
    expect(g.findings.some((f) => f.title === 'wrong logical layer arrived')).toBe(true);
    const bad = applyLayerModel(swapAt(p, j, 0), input().surface);
    expect(() => bmpBytes(bad)).toThrow(/blocked/);
    expect(() => grammarJson({ ...bad, name: 'invalid', note: '' })).toThrow(/blocked/);
    expect(() => layerGraphJson(g, p.w, p.h)).not.toThrow();
  });
  it('records missing stitches and extras without confusing a tuck with consuming a parent', () => {
    const p = build(),
      operations = programSequence(p),
      at = operations.rows[p.w + 3]!;
    operations.symbols.push({
      id: 'analytic-tuck',
      steps: [{ kind: 'tuck', guide: 1, bed: 'front' }],
    });
    operations.rows[p.w + 3] = operations.symbols.length - 1;
    expect(at).toBeLessThan(operations.symbols.length);
    const g = inspectLayerGraph({ ...p, operations }, input().surface);
    const pair = g.nodes.filter((n) => n.pass === 1 && n.needle === 3);
    expect(pair.find((n) => n.layer === 'front-layer')!.actualParents).toEqual([]);
    expect(pair.find((n) => n.layer === 'back-layer')!.actualParents).toBeNull();
    expect(g.findings.some((f) => f.title === 'required layer stitch missing')).toBe(true);
    expect(g.blockers.length).toBeGreaterThan(0);
  });
  it('rejects duplicate yarn-fed bed actions rather than inheriting the legacy one-stitch exception', () => {
    const p = build(),
      operations = programSequence(p);
    operations.symbols.push({
      id: 'same-bed',
      steps: [
        { kind: 'knit', guide: 1, bed: 'front' },
        { kind: 'knit', guide: 2, bed: 'front' },
      ],
    });
    operations.rows[0] = operations.symbols.length - 1;
    const g = inspectLayerGraph({ ...p, operations }, input().surface);
    expect(g.findings.some((f) => f.title === 'unsupported stitch multiplicity')).toBe(true);
  });
  it('rejects repeated/nonchronological reference parents rather than silently certifying the input', () => {
    const p = build(),
      shape = structuredClone(p.shape!);
    const child = shape.needles.placements.find((x) => x.course === 1)!;
    child.parents = [child.loop.id, child.loop.id];
    const g = inspectLayerGraph({ ...p, shape }, input().surface);
    expect(g.findings.some((f) => f.title === 'invalid reference ancestry')).toBe(true);
    expect(g.findings.some((f) => f.title === 'repeated reference parent')).toBe(true);
  });
  it.each(['network', 'shape', 'both'] as const)(
    'gates an unsupported enabled %s model when inputs do not declare two guides',
    (mode) => {
      const p = build(),
        knit = { ...p.settings, mode, keyId: '4s52-basic' };
      const g = inspectLayerGraph(
        { ...p, settings: knit, key: { ...p.key, mode: 1 } },
        input().surface
      );
      expect(g.supported).toBe(false);
      expect(g.blockers.join(' ')).toContain('Requires two guides');
    }
  );
  it('accepts existing held/turn histories in a supported curved reference without merging sheet IDs', () => {
    const surface = mappedChart((u, v) => {
      const r = 0.06 + 0.04 * u,
        a = 0.8 * v;
      return [r * Math.cos(a), r * Math.sin(a), 0];
    }, 24);
    const p = build(input(surface));
    expect(p.layerGraph!.supported).toBe(true);
    expect(p.layerGraph!.blockers).toEqual([]);
    expect(p.layerGraph!.nodes.every((n) => n.matched)).toBe(true);
  });
  it('reports separate demands for each sheet without bypassing unsupported strong-saddle transfers', () => {
    const p = input({ kind: 'saddle', size: 0.18, curvature: 1.5, revision: 'layer-strong' });
    p.swatches = [{ structure: 'jersey', stitchWidth: 0.005, courseHeight: 0.005 }];
    const built = build(p);
    expect(built.layerGraph!.requests.length).toBe(2 * built.shape!.needles.moves.length);
    expect(built.layerGraph!.requests.length).toBeGreaterThan(0);
    expect(built.exportBlockers.length).toBeGreaterThan(0);
    expect(() => bmpBytes(built)).toThrow(/blocked/);
  });
  it('persists the option and undo while retaining topology/course fingerprints', () => {
    const p = input(),
      plain = { ...p, knit: { ...p.knit!, layerModel: undefined } };
    expect(scientificSignature(p)).toBe(scientificSignature(plain));
    expect(courseStageFingerprint(p.surface, p.knit!, gauge)).toBe(
      courseStageFingerprint(plain.surface, plain.knit!, gauge)
    );
    expect(parseProject(serializeProject(p)).knit!.layerModel).toBe('shared-reference-v1');
    let h = historyReducer({ past: [], present: plain, future: [] }, { type: 'commit', next: p });
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.knit!.layerModel).toBeUndefined();
    const raw = JSON.parse(serializeProject(p));
    raw.project.knit.layerModel = 'native';
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/layer model/);
  });
  it('round-trips worker data and JSON histories using one-based artifact coordinates', () => {
    const p = input(),
      a = build(p),
      wire = structuredClone(withoutMappings({ ok: true, program: a })),
      restored = withMappings(wire, p);
    if (!restored.ok) throw new Error(restored.reason);
    const g = restored.program.layerGraph!,
      json = JSON.parse(layerGraphJson(g, a.w, a.h, ['test blocker']));
    expect(json).toMatchObject({
      format: 'knit-layer-graph',
      version: 1,
      units: 'm',
      programBlockers: ['test blocker'],
    });
    expect(json.nodes[0]).toMatchObject({ needle: 1, pass: 1 });
    expect(g).toEqual(a.layerGraph);
    expect(knitReport(restored.program, 'test', 0.1)).toContain('Shared-reference two-layer graph');
  });
  it('honours cancellation during actual parent replay', () => {
    expect(() => inspectLayerGraph(build(), input().surface, { cancelled: () => true })).toThrow(
      /cancelled/
    );
  });
  it('keeps enabled-model failures and the unsupported artifact on every selected patch piece', () => {
    const p = input();
    p.knit = addSplit(p.knit!, 'u', 0.5);
    const built = build(p);
    expect(built.layerGraph!.supported).toBe(false);
    for (const piece of built.patches!.pieces) {
      if (!piece.build.ok) continue;
      expect(piece.build.program.layerGraph!.supported).toBe(false);
      expect(() => bmpBytes(piece.build.ok ? piece.build.program : built)).toThrow(/blocked/);
    }
  });
});
