import { describe, it, expect } from 'vitest';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import type { KnitSettings, SurfaceSpec } from '../../src/core/types';
import { buildKnitProgram } from '../../src/knit/program';
import { defaultKnitSettings, withKey } from '../../src/knit/settings';
import { assignedLoopCoverage, inspectKnitProgram } from '../../src/knit/inspection';
import { SOURCE } from '../../src/knit/rasterize';
import { shapeOverlay, inspectShapeOverlay } from '../../src/app/knit/provenance';
import { DEFAULT_KNIT_LAYERS } from '../../src/app/knit/KnitInspection';
import { mappedChart } from './shape-fixtures';

// Test values, not measured gauges.
const swatches = [{ structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 }];
const plane: SurfaceSpec = { kind: 'plane', size: 0.1, curvature: 0, revision: 'inspection' };
function program(mode: KnitSettings['mode'], surface = plane, two = false) {
  const project = { ...createProject(), surface };
  const graph = mode === 'shape' ? null : generatePattern(project).graph;
  const settings = { ...defaultKnitSettings(), mode };
  const knit = two ? withKey(settings, '4s52-two').settings : settings;
  if (two && mode !== 'shape') knit.edges.structure = 'dk-b';
  const result = buildKnitProgram({ surface, graph, knit, swatches });
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

describe('read-only knit interpretation', () => {
  it('does not classify a stale-export gate as an unresolved shaping operation', () => {
    const p = program('shape');
    const stale = { ...p, exportBlockers: ['Program preview is stale.'] };
    expect(inspectKnitProgram(stale)).toMatchObject({
      title: inspectKnitProgram(p).title,
      blockers: 1,
    });
  });
  it('labels a measured network as unshaped even though it contains reference courses', () => {
    const p = program('network');
    expect(p.shape).toBeDefined();
    expect(p.rectification).toBeDefined();
    expect(inspectKnitProgram(p)).toMatchObject({
      shaping: false,
      title: 'Pattern only — shaping not applied',
    });
  });
  it('distinguishes short-row shaping from bed-transfer counts', () => {
    const sector = mappedChart((u, v) => {
      const r = 0.06 + 0.04 * u,
        a = 0.8 * v;
      return [r * Math.cos(a), r * Math.sin(a), 0];
    }, 24);
    const p = program('shape', sector, true);
    expect(p.transfers).toHaveLength(0);
    expect(p.exportBlockers).toHaveLength(0);
    expect(inspectKnitProgram(p).turnPasses).toBeGreaterThan(0);
    expect(inspectKnitProgram(p).title).toBe('Shaping operations encoded');
  });
  it('reports unresolved two-guide shaping as a preview, not successful encoding', () => {
    const narrowing = mappedChart((u, v) => [u * (0.08 + 0.04 * (1 - v)), 0.1 * v, 0], 1);
    const p = program('shape', narrowing, true);
    expect(p.exportBlockers.length).toBeGreaterThan(0);
    expect(inspectKnitProgram(p).title).toBe('Shaping unresolved — preview only');
  });
  it('identifies the unmeasured double-knit structures using the jersey fallback', () => {
    const s = inspectKnitProgram(program('network', plane, true));
    expect(s.assumedStructures).toEqual(['double knit, YG1 face', 'double knit, YG2 face']);
    expect(s.assigned).toBeGreaterThan(0);
    expect(s.edges).toBeGreaterThan(0);
  });
  it('excludes held and background positions from shaping coverage', () => {
    const kind = new Uint8Array([SOURCE.edge, SOURCE.cell, SOURCE.edge, SOURCE.background]);
    expect(assignedLoopCoverage(kind)).toEqual({ assigned: 3, edges: 2, edgeShare: 2 / 3 });
    expect(assignedLoopCoverage(kind, new Int32Array([-1, 0, 1, -1]))).toEqual({
      assigned: 2,
      edges: 1,
      edgeShare: 0.5,
    });
  });
  it('filters layers independently and does not expose unapplied reference marks', () => {
    const p = program('shape');
    const overlay = shapeOverlay(p)!;
    // A hand-marked operation tests selection filtering independently of the shaping algorithm.
    const marked = {
      ...overlay,
      marks: [{ position: [0, 0, 0] as [number, number, number], index: 0, role: 'turn' as const }],
    };
    expect(
      inspectShapeOverlay(marked, DEFAULT_KNIT_LAYERS, true, null, null, undefined)!.marks
    ).toEqual([]);
    const selected = inspectShapeOverlay(
      marked,
      { ...DEFAULT_KNIT_LAYERS, courses: false },
      true,
      null,
      0,
      0
    )!;
    expect(selected.courses).toEqual([]);
    expect(selected.highlightedCourses).toEqual([]);
    expect(selected.marks).toHaveLength(1);
    expect(
      inspectShapeOverlay(marked, { ...DEFAULT_KNIT_LAYERS, shaping: 'all' }, false, null, 0, 0)!
        .marks
    ).toEqual([]);
    expect(marked.marks).toHaveLength(1);
    expect(overlay.courses.length).toBeGreaterThan(0);
  });
});
