import { describe, expect, it } from 'vitest';
import bibliography from '../../research/references.bib?raw';
import { LESSONS, getLesson, suggestedLesson } from '../../src/learning/catalog';
import { REFERENCES } from '../../src/learning/references';
import {
  describeMethod,
  formatCitation,
  referenceBibtex,
  referencesBibtex,
  referencesCSL,
  relevantReferenceIds,
} from '../../src/learning/citations';
import { generatePattern } from '../../src/core/generate';
import { evaluateSurface } from '../../src/core/surfaces';
import { DEFAULT_PARAMETERS } from '../../src/app/project';
import type { GenerationInput, PatternFamily, PatternParameters } from '../../src/core/types';
import type { LearningExample, ReferenceId } from '../../src/learning/types';

function input(example: LearningExample): GenerationInput {
  const surface = {
    kind: example.surface,
    size: example.size,
    curvature: 0.3,
    revision: 'learning:test',
  };
  return {
    surface,
    parameters: { ...DEFAULT_PARAMETERS, stripOverrides: { stale: 23 }, ...example.parameters },
    guides: example.addDirectionGuide
      ? [
          {
            id: 'learning:direction',
            strength: 1,
            samples: [
              [0.2, 0.3],
              [0.5, 0.5],
              [0.8, 0.7],
            ].map(([u, v]) => ({
              position: evaluateSurface(surface, 0, u, v),
              attachment: { surfaceRevision: surface.revision, patch: 0, uv: [u, v] },
            })),
          },
        ]
      : [],
  };
}

describe('learning examples execute the documented methods', () => {
  it('provides thirteen distinct topics and prefers the N-sided strategy topic', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(13);
    for (const lesson of LESSONS) expect(getLesson(lesson.id)).toBe(lesson);
    expect(
      suggestedLesson({ ...DEFAULT_PARAMETERS, strategy: 'n-sided-patch', family: 'gyro' })
    ).toBe('patch-quadrangulation');
    expect(suggestedLesson({ ...DEFAULT_PARAMETERS, family: 'ambo', preset: 'radial' })).toBe(
      'ambo'
    );
  });
  for (const lesson of LESSONS)
    it(`${lesson.id} example remains valid after incompatible previous settings`, () => {
      const x = input(lesson.experiment.example);
      const result = generatePattern(x);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(result.statistics.components).toBe(1);
      expect(result.statistics.euler).toBe(
        x.surface.kind === 'sphere' || x.surface.kind === 'cube' ? 2 : 1
      );
      expect(result.graph.provenance.parameters.family).toBe(x.parameters.family);
      for (const use of lesson.references) expect(REFERENCES[use.id]).toBeDefined();
    });
  it('the baseline and diagonal experiments have the stated count relationships', () => {
    const quad = generatePattern(input(getLesson('quad').experiment.example));
    const diagonal = generatePattern(input(getLesson('diagonal').experiment.example));
    expect([quad.statistics.vertices, quad.statistics.edges, quad.statistics.cells]).toEqual([
      25, 40, 16,
    ]);
    expect(diagonal.statistics.vertices).toBe(quad.statistics.vertices);
    expect(diagonal.statistics.cells).toBe(2 * quad.statistics.cells);
    expect(diagonal.graph.cells.every((c) => c.nodes.length === 3)).toBe(true);
    const x = input(getLesson('quad').experiment.example);
    expect(
      generatePattern({ ...x, parameters: { ...x.parameters, spacing: 0.015 } }).statistics.cells
    ).toBe(64);
  });
  it('closed operators demonstrate the stated face/vertex/edge transformations', () => {
    const x = input(getLesson('dual').experiment.example);
    const base = generatePattern({ ...x, parameters: { ...x.parameters, family: 'quad' } });
    const dual = generatePattern(x);
    expect(dual.statistics.vertices).toBe(base.statistics.cells);
    expect(dual.statistics.cells).toBe(base.statistics.vertices);
    const ambo = generatePattern({ ...x, parameters: { ...x.parameters, family: 'ambo' } });
    expect(ambo.statistics.vertices).toBe(base.statistics.edges);
    expect(ambo.statistics.cells).toBe(base.statistics.vertices + base.statistics.cells);
    const kis = generatePattern({ ...x, parameters: { ...x.parameters, family: 'kis' } });
    expect(kis.statistics.vertices).toBe(base.statistics.vertices + base.statistics.cells);
    expect(kis.statistics.cells).toBe(4 * base.statistics.cells);
    const gyro = generatePattern({ ...x, parameters: { ...x.parameters, family: 'gyro' } });
    expect(gyro.graph.cells.every((c) => c.nodes.length === 5)).toBe(true);
  });
  it('coarse preset examples distinguish coarse connectivity from density', () => {
    const counts = { regular: 1, inset: 5, alternating: 12, radial: 9 } as const;
    for (const [preset, count] of Object.entries(counts)) {
      const x = input(getLesson(`preset-${preset}` as 'preset-regular').experiment.example);
      const initial = generatePattern(x);
      const refined = generatePattern({
        ...x,
        parameters: { ...x.parameters, spacing: x.parameters.spacing / 2 },
      });
      expect(initial.graph.coarseTopology?.cells).toHaveLength(count);
      expect(refined.graph.coarseTopology?.cells).toHaveLength(count);
      expect(refined.statistics.cells).toBeGreaterThan(initial.statistics.cells);
    }
  });
  it('alternating and nested presets have their documented spatial structure', () => {
    for (const preset of ['alternating', 'radial'] as const) {
      const x = input(getLesson(`preset-${preset}`).experiment.example);
      const coarse = generatePattern(x).graph.coarseTopology!;
      const boundary = new Set(
        coarse.edges.filter((e) => e.cells.length === 1).flatMap((e) => [e.a, e.b])
      );
      const nodes = new Map(coarse.nodes.map((n) => [n.id, n.position]));
      const inside = coarse.cells.filter((c) => c.nodes.every((id) => !boundary.has(id)));
      const centers = inside.map((c) =>
        [0, 1].map(
          (axis) => c.nodes.reduce((sum, id) => sum + nodes.get(id)![axis]!, 0) / c.nodes.length
        )
      );
      if (preset === 'alternating') {
        expect(inside).toHaveLength(2);
        expect(centers[0]![0]! * centers[1]![0]!).toBeLessThan(0);
        expect(centers[0]![1]! * centers[1]![1]!).toBeLessThan(0);
      } else {
        expect(inside).toHaveLength(5);
        expect(
          centers.filter(([cx, cy]) => Math.hypot(cx!, cy!) < 1e-9 * x.surface.size)
        ).toHaveLength(1);
      }
    }
  });
  it('the patch experiment demonstrates exact boundary count and rejects its odd-total edit', () => {
    const x = input(getLesson('patch-quadrangulation').experiment.example);
    const result = generatePattern(x);
    expect(result.statistics.boundaryEdges).toBe(30);
    // Geometry fitting may move the center; its interior valence is the invariant.
    const boundaryNodes = new Set(
      result.graph.edges
        .filter((edge) => edge.cells.length === 1)
        .flatMap((edge) => [edge.a, edge.b])
    );
    const interiorValences = result.graph.nodes
      .filter((node) => !boundaryNodes.has(node.id))
      .map(
        (node) =>
          result.graph.edges.filter((edge) => edge.a === node.id || edge.b === node.id).length
      );
    expect(interiorValences.filter((degree) => degree === 5)).toHaveLength(1);
    expect(() =>
      generatePattern({ ...x, parameters: { ...x.parameters, boundaryCounts: [5, 6, 6, 6, 6] } })
    ).toThrow();
  });
  it('the guide experiment preserves connectivity when guide influence is removed', () => {
    const x = input(getLesson('guides').experiment.example);
    const guided = generatePattern(x);
    const unguided = generatePattern({ ...x, parameters: { ...x.parameters, guideStrength: 0 } });
    expect(guided.graph.cells.map((c) => c.nodes)).toEqual(
      unguided.graph.cells.map((c) => c.nodes)
    );
    expect(guided.graph.edges.map((e) => [e.a, e.b])).toEqual(
      unguided.graph.edges.map((e) => [e.a, e.b])
    );
    const boundary = new Set(
      guided.graph.edges.filter((e) => e.cells.length === 1).flatMap((e) => [e.a, e.b])
    );
    const old = new Map(unguided.graph.nodes.map((n) => [n.id, n.position]));
    for (const n of guided.graph.nodes.filter((n) => boundary.has(n.id)))
      expect(n.position).toEqual(old.get(n.id));
    expect(
      guided.graph.nodes.some(
        (n) =>
          !boundary.has(n.id) && n.position.some((v, i) => Math.abs(v - old.get(n.id)![i]!) > 1e-7)
      )
    ).toBe(true);
    expect(
      guided.graph.provenance.notes.some((n) =>
        n.startsWith('Input guides: 1 stroke(s), 3 sample(s), 2 nonzero')
      )
    ).toBe(true);
  });
});

describe('method-appropriate references and citation export', () => {
  it('selects source roles without assigning a Conway source to diagonal', () => {
    const families: PatternFamily[] = ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'];
    for (const strategy of ['patch-grid', 'n-sided-patch'] as const)
      for (const family of families) {
        const p: PatternParameters = { ...DEFAULT_PARAMETERS, strategy, family };
        const ids = relevantReferenceIds(p);
        expect(ids.includes('oval2018')).toBe(true);
        expect(ids.includes('takayama2014')).toBe(strategy === 'n-sided-patch');
        expect(ids.includes('hart')).toBe(['dual', 'ambo', 'kis', 'gyro'].includes(family));
        const text = describeMethod(p, 'plane');
        expect(text.includes('Takayama et al. (2014)')).toBe(ids.includes('takayama2014'));
        expect(text.includes('Hart (n.d.)')).toBe(ids.includes('hart'));
      }
    expect(getLesson('diagonal').references).toEqual([]);
    expect(getLesson('guides').references).toEqual([]);
  });
  it('exports independently verified metadata without manufacturing unknown dates or DOI values', () => {
    expect(REFERENCES.takayama2014.doi).toBe('10.1111/cgf.12443');
    expect(REFERENCES.oval2018.pages).toBe('342–363');
    expect(REFERENCES.oval2018.doi).toBeUndefined();
    expect(REFERENCES.hart.year).toBeUndefined();
    const hart = referenceBibtex(REFERENCES.hart);
    expect(hart).not.toMatch(/^\s*year\s*=/m);
    expect(hart).not.toMatch(/^\s*doi\s*=/m);
    expect(referenceBibtex(REFERENCES.oval2018)).not.toMatch(/^\s*doi\s*=/m);
    expect(formatCitation(REFERENCES.hart)).toContain('(n.d.)');
    const csl = referencesCSL(['oval2018', 'hart', 'takayama2014', 'hart']);
    expect(csl).toHaveLength(3);
    expect(csl[0].author).toContainEqual({ given: 'Tom', family: 'Van Mele' });
    expect(csl[1]).not.toHaveProperty('issued');
    expect(csl[0]).not.toHaveProperty('DOI');
    expect(csl[2].DOI).toBe('10.1111/cgf.12443');
    expect(JSON.parse(JSON.stringify(csl))).toEqual(csl);
  });
  it('the checked-in bibliography matches the same records used for downloads', () => {
    const ids: ReferenceId[] = [
      'takayama2014',
      'oval2018',
      'hart',
      'lipman2014',
      'popescu2019knitcrete',
      'popescu2018automated',
    ];
    expect(bibliography.trim()).toBe(referencesBibtex(ids).trim());
  });
  it('distinguishes the read thesis from metadata-only related work', () => {
    const thesis = REFERENCES.popescu2019knitcrete;
    expect(formatCitation(thesis)).toContain('Doctoral thesis, ETH Zurich');
    expect(referenceBibtex(thesis)).toContain('@phdthesis{popescu2019knitcrete');
    expect(referencesCSL([thesis.id])[0]).toMatchObject({
      type: 'thesis',
      publisher: 'ETH Zurich',
      DOI: '10.3929/ethz-b-000408640',
    });
    expect(referenceBibtex(REFERENCES.popescu2018automated)).toContain('Full text not read');
    expect(relevantReferenceIds(DEFAULT_PARAMETERS)).not.toContain(thesis.id);
  });
});
