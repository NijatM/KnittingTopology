import { describe, expect, it } from 'vitest';
import { generatePattern } from '../../src/core/generate';
import { analyzeGraph, mappedAttachmentMatches } from '../../src/core/diagnostics';
import { parseMeshFile } from '../../src/import/mesh';
import { evaluateMappedSurface, mappedUVPath } from '../../src/import/uv-mapping';
import { createProject, parseProject, serializeProject } from '../../src/app/project';
import type { GenerationInput, PatternFamily, TopologyPreset } from '../../src/core/types';

function input(bent = false, rawScale = 1, rightAngle = false): GenerationInput {
  const obj = [
    'v 0 0 0',
    'v 60 0 0',
    `v ${rightAngle ? 60 : 120} 0 ${rightAngle ? 60 : bent ? 20 : 0}`,
    'v 0 60 0',
    'v 60 60 0',
    `v ${rightAngle ? 60 : 120} 60 ${rightAngle ? 60 : bent ? 20 : 0}`,
    ...[
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, 1],
      [0.5, 1],
      [1, 1],
    ].map(([u, v]) => `vt ${2 + u! * rawScale} ${-3 + v! * rawScale * 4}`),
    'f 1/1 2/2 5/5',
    'f 1/1 5/5 4/4',
    'f 2/2 3/3 6/6',
    'f 2/2 6/6 5/5',
  ].join('\n');
  const parsed = parseMeshFile(new TextEncoder().encode(obj).buffer, {
    name: 'rectangle.obj',
    format: 'obj',
    unit: 'mm',
  });
  return {
    surface: {
      kind: 'mesh',
      mesh: parsed.mesh,
      size: parsed.size,
      curvature: 0,
      revision: 'mapped:test',
      mapping: 'rectangular-obj-uv-v1',
    },
    parameters: {
      strategy: 'patch-grid',
      preset: 'regular',
      family: 'quad',
      spacing: 0.02,
      orientation: 0,
      guideStrength: 0.8,
      relaxation: 0,
      seed: 7,
      patchSides: 4,
      boundaryCounts: [4, 4, 4, 4],
      variant: 0,
    },
    guides: [],
  };
}

describe('supplied rectangular OBJ mapped generation', () => {
  it('uses physical non-square dimensions and original parameters, independent of texture units', () => {
    const source = input(),
      a = generatePattern(source),
      b = generatePattern(input(false, 13));
    expect(a.graph.cells).toHaveLength(18);
    expect(a.graph.coarsePatches[0]!.subdivisions).toEqual([6, 3, 6, 3]);
    expect(a.statistics.meanEdgeLength).toBeCloseTo(0.02, 12);
    expect(a.statistics.spacingRmsRelative).toBeLessThan(1e-12);
    expect(a.statistics.surfaceArea).toBeCloseTo(0.12 * 0.06, 12);
    expect(a.graph.nodes.map((n) => n.position)).toEqual(b.graph.nodes.map((n) => n.position));
    expect(a.graph.provenance.parameters).toEqual(source.parameters);
    expect(a.graph.provenance.parameters.spacing).toBe(0.02);
    expect(a.graph.provenance.algorithm).toContain('OBJ');
    expect(a.diagnostics.find((d) => d.id === 'chart-distortion')!.value).toBeCloseTo(2, 12);
    expect(a.diagnostics.find((d) => d.id === 'uv-embedding-displacement')!.units).toBe(
      'normalized UV'
    );
  });

  for (const family of ['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal'] as PatternFamily[])
    for (const preset of ['regular', 'inset', 'alternating', 'radial'] as TopologyPreset[])
      it(`${preset}/${family} ${family === 'ambo' && preset === 'radial' ? 'rejects its known invalid mixed-strip configuration' : 'retains valid connected chart topology and mapped paths'}`, () => {
        const source = input(true);
        source.parameters.family = family;
        source.parameters.preset = preset;
        source.parameters.spacing = 0.03;
        if (family === 'ambo' && preset === 'radial') {
          const quad = generatePattern({
            ...source,
            parameters: { ...source.parameters, family: 'quad' },
          });
          expect(quad.graph.coarseTopology!.strips.map((strip) => strip.subdivisions)).toEqual([
            3, 1, 1, 1,
          ]);
          const planar = {
            ...source,
            surface: {
              kind: 'plane' as const,
              size: 1,
              curvature: 0,
              revision: source.surface.revision,
            },
            parameters: {
              ...source.parameters,
              spacing: 1,
              stripOverrides: Object.fromEntries(
                quad.graph.coarseTopology!.strips.map((strip) => [strip.id, strip.subdivisions])
              ),
            },
          };
          expect(() => generatePattern(planar)).toThrow(/inverted cells/i);
          expect(() => generatePattern(source)).toThrow(/inverted cells/i);
          return;
        }
        const result = generatePattern(source);
        expect(result.statistics.components).toBe(1);
        expect(result.statistics.euler).toBe(1);
        expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        expect(
          result.graph.nodes.every((n) =>
            mappedAttachmentMatches(source.surface, n.position, n.attachment)
          )
        ).toBe(true);
        expect(result.graph.edges.every((e) => e.path && e.path.length >= 2)).toBe(true);
        expect(result.graph.provenance.parameters).toEqual(source.parameters);
      });

  it('inserts every bend crossing and measures polyline rather than endpoint chord lengths', () => {
    const source = input(true);
    source.parameters.spacing = 0.2;
    const result = generatePattern(source);
    const horizontal = result.graph.edges.filter((e) => e.path!.length > 2);
    expect(horizontal.length).toBeGreaterThan(0);
    const width = 0.06 + Math.hypot(0.06, 0.02);
    expect(result.statistics.maxEdgeLength).toBeCloseTo(width, 12);
    expect(result.statistics.surfaceArea).toBeCloseTo(width * 0.06, 12);
    const nodes = new Map(result.graph.nodes.map((n) => [n.id, n]));
    for (const e of horizontal)
      expect(e.path).toEqual(
        mappedUVPath(source.surface, nodes.get(e.a)!.attachment.uv, nodes.get(e.b)!.attachment.uv)
      );
  });

  it('supports a ninety-degree bent rectangular patch with cells spanning the crease', () => {
    const source = input(false, 1, true);
    source.parameters.spacing = 0.2;
    const result = generatePattern(source);
    expect(result.graph.cells).toHaveLength(1);
    expect(result.statistics.maxEdgeLength).toBeCloseTo(0.12, 12);
    expect(result.statistics.surfaceArea).toBeCloseTo(0.12 * 0.06, 12);
    expect(result.graph.edges.filter((edge) => edge.path!.length > 2)).toHaveLength(2);
    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
  });

  it('checks normalized UV corner Jacobians and full rectangular boundary coverage independently', () => {
    const source = input();
    source.parameters.spacing = 0.2;
    const result = generatePattern(source);
    for (const mode of ['inset-boundary', 'concave-quad']) {
      const graph = structuredClone(result.graph);
      graph.nodes = graph.nodes.map((node, i) => ({
        ...node,
        ...evaluateMappedSurface(
          source.surface,
          mode === 'inset-boundary'
            ? 0.1 + 0.8 * node.attachment.uv[0]
            : i === 2
              ? 0.2
              : node.attachment.uv[0],
          mode === 'inset-boundary'
            ? 0.1 + 0.8 * node.attachment.uv[1]
            : i === 2
              ? 0.2
              : node.attachment.uv[1]
        ),
      }));
      const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
      for (const edge of graph.edges)
        edge.path = mappedUVPath(
          source.surface,
          nodes.get(edge.a)!.attachment.uv,
          nodes.get(edge.b)!.attachment.uv
        );
      const diagnostics = analyzeGraph(graph, source.surface).diagnostics;
      expect(
        diagnostics.some(
          (diagnostic) =>
            diagnostic.id === (mode === 'inset-boundary' ? 'chart-boundary' : 'inverted-cells')
        )
      ).toBe(true);
    }
  });

  it('rejects a chart whose coarse edge needs more than the 1024-sample project path limit', () => {
    const source = input();
    const divisions = 1025;
    const lines: string[] = [];
    for (let row = 0; row < 2; row++)
      for (let col = 0; col <= divisions; col++)
        lines.push(`v ${(120 * col) / divisions} ${row * 60} 0`);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col <= divisions; col++) lines.push(`vt ${col / divisions} ${row}`);
    for (let col = 0; col < divisions; col++) {
      const a = col + 1,
        b = a + 1,
        c = b + divisions + 1,
        d = a + divisions + 1;
      lines.push(`f ${a}/${a} ${b}/${b} ${c}/${c}`, `f ${a}/${a} ${c}/${c} ${d}/${d}`);
    }
    const parsed = parseMeshFile(new TextEncoder().encode(lines.join('\n')).buffer, {
      name: 'dense-chart.obj',
      format: 'obj',
      unit: 'mm',
    });
    source.surface = { ...source.surface, mesh: parsed.mesh, size: parsed.size };
    expect(() => generatePattern(source)).toThrow(/1024.sample/);
  });

  it('preserves valid strip overrides and rejects unknown or excessive overrides', () => {
    const source = input(),
      probe = generatePattern(source);
    const strip = probe.graph.coarseTopology!.strips[0]!.id;
    source.parameters.stripOverrides = { [strip]: 5 };
    const result = generatePattern(source);
    expect(result.graph.coarseTopology!.strips.find((s) => s.id === strip)!.subdivisions).toBe(5);
    expect(result.graph.provenance.parameters.stripOverrides).toEqual({ [strip]: 5 });
    source.parameters.stripOverrides = { missing: 4 };
    expect(() => generatePattern(source)).toThrow(/unknown coarse strip/i);
    source.parameters.stripOverrides = { [strip]: 129 };
    expect(() => generatePattern(source)).toThrow(/1 to 128/);
    source.parameters.stripOverrides = {};
    source.parameters.spacing = 1e-8;
    expect(() => generatePattern(source)).toThrow(/1 to 128/);
  });

  it('fits guides in UV without changing connectivity or pinned boundary positions', () => {
    const source = input(true),
      original = generatePattern(source);
    source.parameters.orientation = 19;
    source.parameters.relaxation = 0.3;
    source.guides = [
      {
        id: 'diagonal',
        strength: 0.9,
        samples: [
          [0.1, 0.2],
          [0.9, 0.8],
        ].map(([u, v]) => evaluateMappedSurface(source.surface, u!, v!)),
      },
    ];
    const result = generatePattern(source);
    expect(result.graph.edges.map((e) => [e.id, e.a, e.b, e.cells])).toEqual(
      original.graph.edges.map((e) => [e.id, e.a, e.b, e.cells])
    );
    const originalNodes = new Map(original.graph.nodes.map((n) => [n.id, n]));
    const boundary = new Set(
      result.graph.edges.filter((e) => e.cells.length === 1).flatMap((e) => [e.a, e.b])
    );
    for (const node of result.graph.nodes)
      if (boundary.has(node.id))
        expect(node.position).toEqual(originalNodes.get(node.id)!.position);
    expect(result.diagnostics.find((d) => d.id === 'uv-guide-alignment')!.units).toBe('degrees');
    expect(result.graph.provenance.parameters).toEqual(source.parameters);
  });

  it('accepts a legitimate alternate triangle at a shared chart edge', () => {
    const source = input(true);
    const sample = evaluateMappedSurface(source.surface, 0.25, 0.5);
    sample.attachment.faceId = 1;
    sample.attachment.barycentric = [0.5, 0.5, 0];
    expect(mappedAttachmentMatches(source.surface, sample.position, sample.attachment)).toBe(true);
    source.guides = [
      {
        id: 'alternate-face',
        strength: 1,
        samples: [sample, evaluateMappedSurface(source.surface, 0.4, 0.7)],
      },
    ];
    expect(generatePattern(source).statistics.components).toBe(1);
  });

  it('keeps the existing forty-thousand base-cell bound for mapped overrides', () => {
    const source = input();
    source.parameters.preset = 'radial';
    const probe = generatePattern(source);
    source.parameters.stripOverrides = Object.fromEntries(
      probe.graph.coarseTopology!.strips.map((strip) => [strip.id, 128])
    );
    expect(() => generatePattern(source)).toThrow(/40000|40,000/);
  });

  it('rejects unselected, missing, reversed and invalid charts and unsupported N-sided input', () => {
    const unselected = input();
    delete unselected.surface.mapping;
    expect(() => generatePattern(unselected)).toThrow(/mapping/i);
    const missing = input();
    delete missing.surface.mesh!.uvs;
    expect(() => generatePattern(missing)).toThrow(/UV|chart/i);
    const reversed = input();
    reversed.surface.mesh!.uvs = reversed.surface.mesh!.uvs!.map((x, i) => (i % 2 === 0 ? -x : x));
    expect(() => generatePattern(reversed)).toThrow(/orient|revers|positive|UV/i);
    const invalid = input();
    invalid.surface.mesh!.uvs![0] = NaN;
    expect(() => generatePattern(invalid)).toThrow();
    const unsupported = input();
    unsupported.parameters.strategy = 'n-sided-patch';
    expect(() => generatePattern(unsupported)).toThrow(/plane.only/i);
  });

  it('rejects missing, shortened or displaced path samples and mismatched triangle attachments', () => {
    const source = input(true);
    source.parameters.spacing = 0.2;
    const result = generatePattern(source);
    for (const mode of ['missing', 'shortened', 'displaced', 'attachment']) {
      const graph = structuredClone(result.graph);
      const edge = graph.edges.find((e) => e.path!.length > 2)!;
      if (mode === 'missing') delete edge.path;
      if (mode === 'shortened') edge.path = [edge.path![0]!, edge.path!.at(-1)!];
      if (mode === 'displaced') edge.path![1]![2] += 0.002;
      if (mode === 'attachment') graph.nodes[0]!.attachment.barycentric = [0.2, 0.3, 0.5];
      expect(
        analyzeGraph(graph, source.surface).diagnostics.some((d) => d.severity === 'error')
      ).toBe(true);
    }
  });

  it('revalidates serialized coarse node attachments, canonical paths and ordered patch corners on load', () => {
    const source = input(true),
      result = generatePattern(source);
    const saved = serializeProject({ ...createProject(), ...source, ...result });
    const valid = parseProject(saved);
    expect(
      analyzeGraph(valid.graph!, valid.surface).diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error'
      )
    ).toEqual([]);
    for (const mode of [
      'node-position',
      'node-attachment',
      'edge-path',
      'missing-path',
      'patch-corner',
      'support-corner',
      'corner-order',
      'missing-topology',
    ]) {
      const file = JSON.parse(saved);
      const graph = file.project.graph;
      if (mode === 'node-position') graph.coarseTopology.nodes[0].position[2] += 0.002;
      if (mode === 'node-attachment') graph.coarseTopology.nodes[0].attachment.uv = [0.2, 0.2];
      if (mode === 'edge-path') graph.coarseTopology.edges[0].path[1][2] += 0.002;
      if (mode === 'missing-path') delete graph.coarseTopology.edges[0].path;
      if (mode === 'patch-corner') graph.coarsePatches[0].corners[0][2] += 0.002;
      if (mode === 'support-corner')
        graph.coarsePatches[0].corners[0] = evaluateMappedSurface(
          source.surface,
          0.1,
          0.1
        ).position;
      if (mode === 'corner-order') graph.coarsePatches[0].corners.reverse();
      if (mode === 'missing-topology') delete graph.coarseTopology;
      const restored = parseProject(JSON.stringify(file));
      const errors = analyzeGraph(restored.graph!, restored.surface).diagnostics.filter(
        (diagnostic) => diagnostic.severity === 'error'
      );
      expect(errors.some((diagnostic) => diagnostic.id.startsWith('coarse-'))).toBe(true);
      if (mode === 'missing-path' || mode === 'edge-path')
        expect(
          errors.some((diagnostic) =>
            /regenerate.*current mapping convention/i.test(diagnostic.message)
          )
        ).toBe(true);
    }
  });

  it('reports an actionable regeneration message for canonical mapped path convention mismatch', () => {
    const source = input(true),
      result = generatePattern(source),
      graph = structuredClone(result.graph);
    const edge = graph.edges.find((edge) => edge.path!.length > 2)!;
    edge.path = [edge.path![0]!, edge.path!.at(-1)!];
    expect(
      analyzeGraph(graph, source.surface).diagnostics.some(
        (diagnostic) =>
          diagnostic.id === 'mapped-path-convention' &&
          /regenerate.*current mapping convention/i.test(diagnostic.message)
      )
    ).toBe(true);
  });

  it('accepts picked attachments within the documented barycentric rounding tolerance', () => {
    const source = input(true),
      sample = evaluateMappedSurface(source.surface, 0.25, 0.5);
    sample.attachment.faceId = 0;
    sample.attachment.barycentric = [0.5 + 1e-12, -1e-12, 0.5 + 1e-12];
    expect(mappedAttachmentMatches(source.surface, sample.position, sample.attachment)).toBe(true);
  });

  it('cancels during generation before accepting a mapped result', () => {
    const source = input();
    let cancelled = false;
    expect(() =>
      generatePattern(source, {
        cancelled: () => cancelled,
        progress: (_fraction, stage) => {
          if (stage.includes('Embedding chart nodes')) cancelled = true;
        },
      })
    ).toThrowError(expect.objectContaining({ name: 'AbortError' }));
  });
});
