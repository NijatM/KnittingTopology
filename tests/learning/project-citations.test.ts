import { describe, expect, it } from 'vitest';
import {
  createProject,
  parametersMatchGraph,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { createCitationRecord } from '../../src/adapters/citations';
import { LESSONS } from '../../src/learning/catalog';
import { createTeachingFixture } from '../../src/learning/MethodDiagram';

function generated() {
  const input = createProject();
  input.surface.kind = 'sphere';
  input.surface.size = 0.08;
  input.parameters.spacing = 0.02;
  const result = generatePattern(input);
  result.graph.provenance.inputSignature = scientificSignature(input);
  return { ...input, ...result };
}

describe('publication method records', () => {
  it('describes and cites the accepted graph when pending controls request another construction', () => {
    const project = generated();
    project.parameters = {
      ...project.parameters,
      strategy: 'n-sided-patch',
      patchSides: 5,
      boundaryCounts: [6, 6, 6, 6, 6],
      family: 'gyro',
    };
    expect(parametersMatchGraph(project)).toBe(false);
    const record = createCitationRecord(project, true);
    expect(record.basis).toBe('accepted graph');
    expect(record.resultIsStale).toBe(true);
    expect(record.implementation.parameters.strategy).toBe('patch-grid');
    expect(record.implementation.parameters.family).toBe('quad');
    expect(record.implementation.requestedParameters.family).toBe('gyro');
    expect(record.references.map((r) => r.id)).toEqual(['oval2018']);
    expect(record.suggestedDescription).not.toContain('Takayama');
    expect(record.suggestedDescription).not.toContain('Hart');
    expect(record.implementation.guideInputsNote).toContain('may differ');
  });
  it('preserves explicit graph semantics and supplies citation metadata in saved project JSON', () => {
    const project = generated();
    const text = serializeProject(project);
    const file = JSON.parse(text);
    expect(file.methodRecord.format).toBe('knitting-topology-method-record');
    expect(file.methodRecord.software.url).toBe('https://github.com/NijatM/KnittingTopology');
    expect(file.methodRecord.implementation.inputSignature).toBe(
      project.graph.provenance.inputSignature
    );
    expect(file.methodRecord.bibtex).toContain('@inproceedings{oval2018');
    expect(JSON.stringify(parseProject(text).graph)).toBe(JSON.stringify(project.graph));
  });
  it('does not turn requested settings into a claim that a result was generated', () => {
    const project = createProject();
    const record = createCitationRecord(project);
    expect(record.basis).toContain('no generated result');
    expect(record.implementation.algorithmVersion).toBeNull();
    expect(record.software.note).toContain('immutable');
    expect(record.descriptionNote).toContain('work actually performed');
  });
  it.each(['dual', 'ambo', 'kis', 'gyro'] as const)(
    'records operator attribution in %s graph provenance',
    (family) => {
      const input = createProject();
      input.parameters.family = family;
      input.parameters.spacing = 0.04;
      const result = generatePattern(input);
      expect(result.graph.provenance.sources.some((s) => s.includes('Hart'))).toBe(true);
      expect(result.graph.provenance.sources.some((s) => s.includes('Takayama'))).toBe(false);
      expect(createCitationRecord({ ...input, ...result }).references.map((r) => r.id)).toContain(
        'hart'
      );
    }
  );
});

describe('honest interactive teaching fixtures', () => {
  it('renders every lesson from valid bounded graphs and existing edge/cell references', () => {
    for (const lesson of LESSONS) {
      const fixture = createTeachingFixture(lesson);
      expect(fixture.result.cells.length).toBeGreaterThan(0);
      expect(fixture.result.cells.length).toBeLessThanOrEqual(96);
      expect(fixture.caption).toContain('Illustrative');
      const ids = new Set(fixture.result.nodes.map((n) => n.id));
      expect(fixture.result.edges.every((e) => ids.has(e.a) && ids.has(e.b))).toBe(true);
      expect(fixture.result.cells.every((c) => c.nodes.every((id) => ids.has(id)))).toBe(true);
    }
  });
  it('teaches geometric guide fitting without changing connectivity', () => {
    const fixture = createTeachingFixture(LESSONS.find((l) => l.id === 'guides')!);
    expect(fixture.result.cells.map((c) => c.nodes)).toEqual(
      fixture.base.cells.map((c) => c.nodes)
    );
    expect(fixture.guides.length).toBe(1);
    expect(
      fixture.result.nodes.some((n, i) =>
        n.position.some((v, j) => Math.abs(v - fixture.base.nodes[i]!.position[j]!) > 1e-7)
      )
    ).toBe(true);
  });
});
