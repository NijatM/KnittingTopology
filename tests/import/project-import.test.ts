import { describe, expect, it } from 'vitest';
import { parseMeshFile } from '../../src/import/mesh';
import {
  createProject,
  geometryChange,
  historyReducer,
  parseProject,
  serializeProject,
} from '../../src/app/project';
import { createCitationRecord } from '../../src/adapters/citations';
import { buildSurfaceMesh, evaluateSurface, projectToSurface } from '../../src/core/surfaces';
import { generatePattern } from '../../src/core/generate';
import { acceptsImportResult } from '../../src/workers/import-protocol';
import type { ProjectState, SurfaceSpec } from '../../src/core/types';

function surface(): SurfaceSpec {
  const text = 'v 10 20 30\nv 110 20 30\nv 110 120 30\nv 10 120 30\nf 1 2 3 4\n';
  const { mesh, size } = parseMeshFile(new TextEncoder().encode(text).buffer, {
    name: 'offset.obj',
    format: 'obj',
    unit: 'mm',
  });
  return { kind: 'mesh', mesh, size, curvature: 0, revision: 'import-project-test' };
}
function imported(): ProjectState {
  return { ...createProject(), surface: surface() };
}

describe('imported project boundaries', () => {
  it('round-trips exact mesh identities, source offset and selected units without doubling mesh arrays in metadata', () => {
    const project = imported();
    const saved = serializeProject(project);
    const file = JSON.parse(saved);
    expect(parseProject(saved).surface).toEqual(project.surface);
    expect(file.methodRecord.basis).toContain('inspection');
    expect(file.methodRecord.references).toEqual([]);
    expect(file.methodRecord.implementation.surface.mesh).toBeUndefined();
    expect(file.methodRecord.implementation.surface.source).toEqual(project.surface.mesh!.source);
    expect(createCitationRecord(project).suggestedDescription).not.toMatch(/Takayama|Oval|Hart/);
  });
  it('does not trust saved mesh report values and does not invent an analytic graph or atlas', () => {
    const project = imported();
    const file = JSON.parse(serializeProject(project));
    file.project.diagnostics = [{ severity: 'info', message: 'Certified' }];
    file.project.statistics = { surfaceArea: 999 };
    const restored = parseProject(JSON.stringify(file));
    expect(restored.diagnostics).toEqual([]);
    expect(restored.statistics).toBeNull();
    expect(restored.graph).toBeNull();
    expect(() => generatePattern(restored)).toThrow(/inspection only/);
    expect(() => evaluateSurface(restored.surface, 0, 0.5, 0.5)).toThrow(/mapping/);
    expect(() => projectToSurface(restored.surface, [0, 0, 0])).toThrow(/mapping/);
    expect(() => geometryChange(restored, { size: 0.5 })).toThrow(/extent/);
    expect(() => geometryChange(restored, { curvature: 0.5 })).toThrow(/curvature/);
    expect(buildSurfaceMesh(restored.surface).indices).toEqual(project.surface.mesh!.indices);
  });
  it('rejects tampered geometry, units, size, source payloads and graph attachments on imported surfaces', () => {
    const original = JSON.parse(serializeProject(imported()));
    const analytic = createProject();
    const graph = generatePattern(analytic).graph;
    const corruptions = [
      (p: typeof original.project) => {
        p.surface.mesh.indices[0] = 999;
      },
      (p: typeof original.project) => {
        p.surface.mesh.positions[0] += 1;
      },
      (p: typeof original.project) => {
        p.surface.mesh.source.scaleToMeters = 1;
      },
      (p: typeof original.project) => {
        p.surface.mesh.source.notes = [42];
      },
      (p: typeof original.project) => {
        p.surface.size *= 2;
      },
      (p: typeof original.project) => {
        p.surface.curvature = 1;
      },
      (p: typeof original.project) => {
        p.graph = graph;
      },
      (p: typeof original.project) => {
        p.guides = [{}];
      },
    ];
    for (const corrupt of corruptions) {
      const file = structuredClone(original);
      corrupt(file.project);
      expect(() => parseProject(JSON.stringify(file))).toThrow();
    }
  });
  it('restores analytic geometry and graph with Undo and removes imported payload on a later analytic choice', () => {
    const original = createProject();
    const accepted = { ...original, ...generatePattern(original) };
    const history = historyReducer(
      { past: [], present: accepted, future: [] },
      { type: 'commit', next: imported() }
    );
    const undone = historyReducer(history, { type: 'undo' });
    expect(undone.present.graph).toBe(accepted.graph);
    expect(undone.present.surface).toBe(accepted.surface);
    expect(historyReducer(undone, { type: 'redo' }).present.surface).toEqual(
      history.present.surface
    );
    const switched = geometryChange(history.present, { kind: 'plane' });
    expect(switched.surface.mesh).toBeUndefined();
    expect(() => generatePattern(switched)).not.toThrow();
  });
  it('rejects obsolete, cancelled or superseded import responses by both job and project revision', () => {
    expect(acceptsImportResult(3, 9, { jobId: 3, inputRevision: 9 })).toBe(true);
    expect(acceptsImportResult(null, 9, { jobId: 3, inputRevision: 9 })).toBe(false);
    expect(acceptsImportResult(4, 9, { jobId: 3, inputRevision: 9 })).toBe(false);
    expect(acceptsImportResult(3, 10, { jobId: 3, inputRevision: 9 })).toBe(false);
  });
  it('bounds history memory for distinct imported meshes while retaining ordinary edits of a shared mesh', () => {
    let history = {
      past: [] as ProjectState[],
      present: createProject(),
      future: [] as ProjectState[],
    };
    for (let i = 0; i < 10; i++)
      history = historyReducer(history, { type: 'commit', next: imported() });
    expect(
      new Set(history.past.map((s) => s.surface.mesh).filter(Boolean)).size
    ).toBeLessThanOrEqual(6);
    const mesh = history.present.surface.mesh;
    for (let i = 0; i < 10; i++)
      history = historyReducer(history, {
        type: 'commit',
        next: { ...history.present, name: `Name ${i}` },
      });
    expect(history.past.filter((s) => s.surface.mesh === mesh).length).toBeGreaterThan(6);
  });
});
