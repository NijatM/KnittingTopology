import { describe, expect, it } from 'vitest';
import { parseMeshFile, validateImportedMesh } from '../../src/import/mesh';
import { checkRectangularUV } from '../../src/import/uv-mapping';
import {
  createProject,
  parseProject,
  serializeProject,
  scientificSignature,
  freezeImportedMesh,
  parametersMatchGraph,
} from '../../src/app/project';
import { generatePattern } from '../../src/core/generate';
import { createCitationRecord } from '../../src/adapters/citations';
import type { SurfaceSpec } from '../../src/core/types';
import example from '../../public/examples/bent-rectangle-uv.obj?raw';

function mesh(text = example) {
  return parseMeshFile(new TextEncoder().encode(text).buffer, {
    format: 'obj',
    unit: 'mm',
    name: 'uv.obj',
  });
}
function input() {
  const m = mesh();
  return {
    ...createProject(),
    surface: {
      kind: 'mesh',
      mesh: m.mesh,
      size: m.size,
      curvature: 0,
      revision: 'uv-project',
      mapping: 'rectangular-obj-uv-v1',
    } as SurfaceSpec,
    parameters: { ...createProject().parameters, spacing: 0.02, relaxation: 0 },
  };
}
describe('OBJ chart preservation and project records', () => {
  it('retains normalized-compatible raw UVs including negative texture indices and validates saved arrays', () => {
    const source = example.replace(/1\/1/g, '1/-6').replace(/2\/2/g, '2/-5');
    const parsed = mesh(source).mesh;
    expect(parsed.uvs).toEqual([2, 10, 5, 10, 8, 10, 2, 12, 5, 12, 8, 12]);
    expect(checkRectangularUV(parsed).status).toBe('ready');
    expect(validateImportedMesh(parsed).uvs).toEqual(parsed.uvs);
    expect(() => validateImportedMesh({ ...parsed, uvs: [1] })).toThrow(/UV/);
    expect(() =>
      validateImportedMesh({ ...parsed, uvs: parsed.uvs!.map((v, i) => (i === 0 ? NaN : v)) })
    ).toThrow(/UV/);
  });
  it.each([
    ['missing', example.replace('f 1/1 2/2 5/5', 'f 1 2/2 5/5')],
    ['range', example.replace('f 1/1 2/2 5/5', 'f 1/99 2/2 5/5')],
    ['seam', example.replace('f 1/1 5/5 4/4', 'f 1/2 5/5 4/4')],
    ['invalid', example.replace('vt 2 10', 'vt NaN 10')],
  ])('keeps %s UV input inspectable without silently inventing a chart', (_, source) => {
    const parsed = mesh(source).mesh;
    expect(parsed.indices).toHaveLength(12);
    expect(parsed.uvs).toBeUndefined();
    expect(checkRectangularUV(parsed).status).toBe('unavailable');
  });
  it('round-trips a real mapped graph with its raw UVs, path samples, citation roles and freshness signature', () => {
    const x = input();
    const result = generatePattern(x);
    result.graph.provenance.inputSignature = scientificSignature(x);
    const accepted = { ...x, ...result };
    const restored = parseProject(serializeProject(accepted));
    expect(restored.surface.mesh!.uvs).toEqual(x.surface.mesh!.uvs);
    expect(restored.graph).toEqual(accepted.graph);
    expect(parametersMatchGraph(restored)).toBe(true);
    const record = createCitationRecord(accepted);
    expect(record.basis).toBe('accepted graph');
    expect(record.references.map((r) => r.id)).toEqual(['oval2018', 'lipman2014']);
    expect(record.suggestedDescription).toContain('normalized UV');
    expect(record.suggestedDescription).not.toContain('No generated cell network');
  });
  it('uses the same signature for immutable browser data and structured-cloned worker data while mutable edits remain detectable', () => {
    const x = input();
    const original = scientificSignature(x);
    freezeImportedMesh(x.surface.mesh!);
    expect(scientificSignature(x)).toBe(original);
    expect(scientificSignature(structuredClone(x))).toBe(original);
    const copy = structuredClone(x);
    copy.surface.mesh!.uvs![0] += 0.1;
    expect(scientificSignature(copy)).not.toBe(original);
    const shallow = structuredClone(x);
    Object.freeze(shallow.surface.mesh!.positions);
    Object.freeze(shallow.surface.mesh!.indices);
    Object.freeze(shallow.surface.mesh!.uvs);
    Object.freeze(shallow.surface.mesh);
    const before = scientificSignature(shallow);
    shallow.surface.mesh!.source.name = 'renamed.obj';
    expect(scientificSignature(shallow)).not.toBe(before);
  });
  it('rejects tampered mappings and picked guide triangle attachments on load', () => {
    const x = input();
    const bad = JSON.parse(serializeProject(x));
    bad.project.surface.mesh.uvs[0] += 1;
    expect(() => parseProject(JSON.stringify(bad))).toThrow();
    const file = JSON.parse(serializeProject(x));
    file.project.guides = [
      {
        id: 'bad-guide',
        strength: 1,
        samples: [
          {
            position: [-0.06, -0.03, -0.01],
            attachment: {
              surfaceRevision: 'uv-project',
              patch: 0,
              uv: [0, 0],
              faceId: 2,
              barycentric: [1, 0, 0],
            },
          },
          {
            position: [-0.06, 0.03, -0.01],
            attachment: {
              surfaceRevision: 'uv-project',
              patch: 0,
              uv: [0, 1],
              faceId: 1,
              barycentric: [0, 0, 1],
            },
          },
        ],
      },
    ];
    expect(() => parseProject(JSON.stringify(file))).toThrow(/mapped guide/);
  });
});
