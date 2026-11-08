import { describe, expect, it } from 'vitest';
import {
  createProject,
  historyReducer,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { TWO } from '../../src/knit/keys';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { buildKnitProgram, type KnitProgram } from '../../src/knit/program';
import { withMappings, withoutMappings } from '../../src/knit/client';
import { bmpBytes, grammarJson } from '../../src/knit/files';
import { courseStageFingerprint } from '../../src/knit/knit-graph';
import { addSplit } from '../../src/knit/patches';
import { recipeJsonData } from '../../src/knit/recipes';
import { fillCluster, lowerSequence, programSequence, sequenceJson } from '../../src/knit/sequence';
import type { KnitZone, ProjectState } from '../../src/core/types';

// Synthetic test values, not measured gauges or a lab machine specification.
function project(): ProjectState {
  const knit = withKey({ ...defaultKnitSettings(), mode: 'shape' }, TWO.id).settings;
  const zone: KnitZone = {
    id: 'Z1',
    name: 'test pocket',
    kind: 'pocket',
    rgb: [255, 0, 255],
    shape: {
      kind: 'region',
      points: [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.75, 1],
        [0.25, 1],
      ],
    },
  };
  return {
    ...createProject(),
    surface: { kind: 'plane', size: 0.12, curvature: 0, revision: 'recipe-integration-test' },
    graph: null,
    knit: {
      ...knit,
      zones: [zone],
      recipes: [{ zone: zone.id, kind: 'pocket', opening: 'last-pass', joinBand: 1 }],
    },
    swatches: [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }],
  };
}
function build(p: ProjectState): KnitProgram {
  const result = buildKnitProgram(p);
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

describe('recipe persistence, worker transport and export integration', () => {
  it('keeps recipe assignments through project save/load and undo without changing graph/stage inputs', () => {
    const p = project();
    const before = { ...p, knit: { ...p.knit!, recipes: undefined } };
    expect(scientificSignature(p)).toBe(scientificSignature(before));
    const gauge = { stitchWidth: 0.006, courseHeight: 0.004 };
    expect(courseStageFingerprint(p.surface, p.knit!, gauge)).toBe(
      courseStageFingerprint(before.surface, before.knit!, gauge)
    );
    expect(parseProject(serializeProject(p)).knit?.recipes).toEqual(p.knit?.recipes);
    let history = historyReducer(
      { past: [], present: before, future: [] },
      { type: 'commit', next: p }
    );
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.knit?.recipes).toBeUndefined();
    history = historyReducer(history, { type: 'redo' });
    expect(history.present.knit?.recipes).toEqual(p.knit?.recipes);
    const file = JSON.parse(serializeProject(p));
    file.project.knit.recipes[0].joinBand = 0;
    expect(() => parseProject(JSON.stringify(file))).toThrow(/join band/);
  });

  it('transports the actual expanded sequence and role arrays through worker cloning and both writers', () => {
    const p = project(),
      base = build(p);
    const transported = withMappings(
      structuredClone(withoutMappings({ ok: true, program: base })),
      p
    );
    if (!transported.ok) throw new Error('worker transport unexpectedly failed');
    const result = transported.program;
    expect(result.recipeResult?.applied).toBe(true);
    expect(result.recipeResult?.roles).toBeInstanceOf(Uint8Array);
    expect(result.recipeResult?.owner).toBeInstanceOf(Int16Array);
    expect(result.operations?.rows).toBeInstanceOf(Uint16Array);
    expect(result.operations?.fills.length).toBeGreaterThan(0);
    expect(result.exportBlockers).toEqual([]);
    expect(bmpBytes(result)).toEqual(bmpBytes(base));
    expect(JSON.parse(grammarJson({ ...result, name: 'test', note: '' })).cells).toBe(
      JSON.parse(grammarJson({ ...base, name: 'test', note: '' })).cells
    );
    const json = JSON.parse(
      sequenceJson(result.operations!, result.sequence!, {
        key: result.key,
        piece: null,
        blockers: result.exportBlockers,
        recipes: recipeJsonData(result.recipeResult!, result.w, result.h),
      })
    );
    expect(json.recipes.method).toBe('guide-swap-bands-v1');
    expect(json.recipes.patches[0].access[0].side).toBe('last-pass');
    expect(json.clusters.length).toBeGreaterThan(0);
    expect(json.passes[0].symbols).toEqual(
      Array.from(result.operations!.rows.subarray(0, result.w))
    );
    const lowered = lowerSequence(result.operations!, result.key);
    expect(lowered.ok && lowered.cells).toEqual(result.cells);
  });

  it('keeps unsupported patched recipes blocked when selecting an individual piece', () => {
    const p = project();
    const split = addSplit(p.knit!, 'u', 0.5);
    p.knit = split;
    const result = build(p);
    expect(result.exportBlockers.join(' ')).toContain('unpatched');
    expect(result.patches?.pieces.length).toBeGreaterThan(0);
    for (const piece of result.patches!.pieces) {
      if (!piece.build.ok) continue;
      expect(piece.build.program.exportBlockers.join(' ')).toContain('unpatched');
      expect(() => bmpBytes(piece.build.ok ? piece.build.program : result)).toThrow(/blocked/);
    }
  });

  it('refuses stale key provenance when a retained symbol has gained an unsupported action', () => {
    const p = build(project());
    const seq = programSequence(p);
    const i = seq.rows[0]!;
    seq.symbols[i] = {
      ...seq.symbols[i]!,
      steps: [...seq.symbols[i]!.steps, { kind: 'drop', bed: 'front' }],
    };
    const lowering = lowerSequence(seq, p.key);
    expect(lowering.ok).toBe(false);
    if (!lowering.ok) expect(lowering.problems[0]).toContain('drop front');
  });

  it('rejects a recipe cluster that reuses a symbol ID with a different meaning', () => {
    const p = build(project());
    const seq = p.operations!;
    const old = seq.symbols[0]!;
    expect(() =>
      fillCluster(
        seq,
        {
          id: 'collision-test',
          w: 1,
          h: 1,
          symbols: [{ id: old.id, steps: [{ kind: 'drop', bed: 'front' }] }],
        },
        [[0, 0]]
      )
    ).toThrow(/different meaning/);
  });
});
