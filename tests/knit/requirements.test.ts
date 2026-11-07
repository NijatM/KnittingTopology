import { describe, expect, it } from 'vitest';
import { createProject } from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { defaultKnitSettings } from '../../src/knit/settings';
import { knitRequirements } from '../../src/knit/requirements';

function project() {
  const p = createProject();
  p.surface = { ...p.surface, kind: 'plane' };
  return { ...p, knit: defaultKnitSettings(), graph: null };
}
// Test values, not measured gauges.
const jersey = { structure: 'jersey', stitchWidth: 0.006, courseHeight: 0.004 };
const ids = (p: Parameters<typeof knitRequirements>[0], matches = true) =>
  knitRequirements(p, matches).map((r) => r.id);

describe('knit generation prerequisites', () => {
  it('reports all missing combined-mode inputs together', () => {
    const p = project();
    p.knit.mode = 'both';
    expect(ids(p)).toEqual(['measurement', 'network']);
    expect(ids({ ...p, swatches: [jersey] })).toEqual(['network']);
  });
  it('does not ask open-surface Shape mode for a network', () => {
    const p = project();
    p.knit.mode = 'shape';
    expect(ids(p)).toEqual(['measurement']);
    expect(ids({ ...p, swatches: [jersey] })).toEqual([]);
  });
  it('permits an unmeasured typed network but still requires its graph', () => {
    const p = project();
    p.knit.size = { source: 'typed', needles: 100, passes: 100 };
    expect(ids(p)).toEqual(['network']);
    const graph = generatePattern(p).graph;
    expect(ids({ ...p, graph })).toEqual([]);
  });
  it('keeps the existing jersey-reference requirement with two-guide fills', () => {
    const p = project();
    p.knit.mode = 'shape';
    p.knit.keyId = '4s52-two';
    p.knit.cells.fill = 'dk-a';
    p.swatches = [{ ...jersey, structure: 'dk-a' }];
    expect(ids(p)).toEqual(['measurement']);
    p.swatches.push(jersey);
    expect(ids(p)).toEqual([]);
  });
  it('requires a network and current cut on closed surfaces, including Shape mode', () => {
    const p = project();
    p.surface.kind = 'cube';
    p.knit.mode = 'shape';
    expect(ids(p)).toEqual(['measurement', 'network', 'cut']);
    const graph = generatePattern(p).graph;
    p.knit.cut = {
      surfaceRevision: p.surface.revision,
      sourceSignature: 'cut-source-fnv1a32:00000000',
      preset: 'manual',
      edgeIds: [graph.edges[0]!.id],
    };
    // Presence/freshness only: these cheap checks do not certify a valid cut disk.
    expect(ids({ ...p, graph, swatches: [jersey] }, false)).toEqual(['cut']);
  });
  it('directs a network from another surface revision back to network generation', () => {
    const p = project();
    p.knit.size = { source: 'typed', needles: 100, passes: 100 };
    const graph = generatePattern(p).graph;
    p.surface = { ...p.surface, revision: 'changed' };
    expect(ids({ ...p, graph })).toEqual(['network']);
  });
});
