import { describe, expect, it } from 'vitest';
import { generatePattern } from '../../src/core/generate';
import {
  createProject,
  geometryChange,
  historyReducer,
  parametersMatchGraph,
  parseProject,
  scientificSignature,
  serializeProject,
} from '../../src/app/project';
import { acceptsResult } from '../../src/workers/protocol';
import { graphToOBJ, graphToSVG } from '../../src/adapters/export';
import type { ProjectState } from '../../src/core/types';

function generated(): ProjectState {
  const base = createProject();
  base.surface.kind = 'cube';
  base.surface.size = 0.08;
  base.parameters.spacing = 0.02;
  const result = generatePattern(base);
  result.graph.provenance.inputSignature = scientificSignature(base);
  return { ...base, ...result };
}
describe('project semantics', () => {
  it('round-trips explicit identities, coarse strips, guide state and provenance', () => {
    const state = generated();
    state.guides = [
      {
        id: 'guide-A',
        strength: 1,
        samples: [
          {
            position: [0.04, -0.02, 0],
            attachment: { surfaceRevision: state.surface.revision, patch: 0, uv: [0.25, 0.5] },
          },
          {
            position: [0.04, 0.02, 0],
            attachment: { surfaceRevision: state.surface.revision, patch: 0, uv: [0.75, 0.5] },
          },
        ],
      },
    ];
    const restored = parseProject(serializeProject(state));
    // JSON canonicalizes -0 to 0; geometric coordinates and all graph identities are preserved.
    expect(JSON.stringify(restored.graph)).toBe(JSON.stringify(state.graph));
    expect(restored.surface).toEqual(state.surface);
    expect(restored.guides).toEqual(state.guides);
    expect(restored.parameters).toEqual(state.parameters);
    expect(restored.statistics).toBeNull(); // Derived results from disk are recomputed by the caller.
  });
  it('does not reuse worker output after edits, undo or supersession', () => {
    expect(acceptsResult(12, 3, { jobId: 12, inputRevision: 3 })).toBe(true);
    expect(acceptsResult(12, 4, { jobId: 12, inputRevision: 3 })).toBe(false);
    expect(acceptsResult(13, 3, { jobId: 12, inputRevision: 3 })).toBe(false);
    expect(acceptsResult(null, 3, { jobId: 12, inputRevision: 3 })).toBe(false);
  });
  it('undo/redo restores graph and coarse strip identities with a fresh revision', () => {
    const original = generated();
    const changed = { ...original, parameters: { ...original.parameters, spacing: 0.03 } };
    let history = { past: [] as ProjectState[], present: original, future: [] as ProjectState[] };
    history = historyReducer(history, { type: 'commit', next: changed });
    history = historyReducer(history, { type: 'undo' });
    expect(history.present.graph).toBe(original.graph);
    expect(history.present.parameters.spacing).toBe(0.02);
    expect(history.present.revision).toBe(2);
    history = historyReducer(history, { type: 'redo' });
    expect(history.present.parameters.spacing).toBe(0.03);
    expect(history.present.graph).toBe(original.graph);
    expect(history.present.revision).toBe(3);
  });
  it('freshness includes drawn guides, not just parameter values', () => {
    const state = generated();
    expect(parametersMatchGraph(state)).toBe(true);
    const moved = { ...state, guides: [{ id: 'g', strength: 1, samples: [] }] };
    expect(parametersMatchGraph(moved)).toBe(false);
  });
  it('geometry edits invalidate attachments and previous graph state', () => {
    const state = generated();
    const changed = geometryChange(state, { kind: 'sphere' });
    expect(changed.graph).toBeNull();
    expect(changed.surface.revision).not.toBe(state.surface.revision);
    expect(changed.guides).toEqual([]);
    expect(changed.statistics).toBeNull();
  });
  it('clears density overrides when scientific geometry changes', () => {
    const state = generated();
    state.parameters.stripOverrides = { 'strip:old': 3 };
    expect(geometryChange(state, { size: 0.1 }).parameters.stripOverrides).toBeUndefined();
  });
  it('round-trips every surface/preset coarse topology, including nested IDs', () => {
    for (const kind of ['plane', 'cube', 'sphere', 'saddle'] as const) {
      for (const preset of ['regular', 'inset', 'alternating', 'radial'] as const) {
        const state = createProject();
        state.surface.kind = kind;
        state.surface.size = 0.08;
        state.parameters = { ...state.parameters, spacing: 0.025, preset };
        const project = { ...state, ...generatePattern(state) };
        const parsed = parseProject(serializeProject(project));
        expect(JSON.stringify(parsed.graph)).toBe(JSON.stringify(project.graph));
      }
    }
  });
  it('retains a negative saddle curvature and safe negative seed', () => {
    const state = createProject();
    state.surface.kind = 'saddle';
    state.surface.curvature = -0.3;
    state.parameters.seed = -1;
    const parsed = parseProject(serializeProject({ ...state, ...generatePattern(state) }));
    expect(parsed.surface.curvature).toBe(-0.3);
    expect(parsed.parameters.seed).toBe(-1);
  });
});

describe('project input validation', () => {
  const mutate = (fn: (file: any) => void) => {
    const f = JSON.parse(serializeProject(generated()));
    fn(f);
    return JSON.stringify(f);
  };
  it.each([
    (f: any) => {
      f.units = 'mm';
    },
    (f: any) => {
      f.schemaVersion = '9';
    },
    (f: any) => {
      f.project.surface.size = 0;
    },
    (f: any) => {
      f.project.graph.nodes[0].position[0] = null;
    },
    (f: any) => {
      f.project.graph.nodes[0].attachment.surfaceRevision = 'stale';
    },
    (f: any) => {
      f.project.graph.nodes[1].id = f.project.graph.nodes[0].id;
    },
    (f: any) => {
      f.project.graph.cells[0].nodes[0] = 'missing';
    },
    (f: any) => {
      f.project.graph.edges[0].cells = ['missing'];
    },
    (f: any) => {
      f.project.graph.coarseTopology.strips[0].edgeIds = ['missing'];
    },
    (f: any) => {
      f.project.parameters.stripOverrides = { 'strip-A': 2.5 };
    },
  ])('rejects malformed scientific or connectivity records (%#)', (fn) =>
    expect(() => parseProject(mutate(fn))).toThrow()
  );
  it('rejects guides which claim attachment to a different location', () => {
    const input = mutate((f) => {
      f.project.guides = [
        {
          id: 'bad',
          strength: 1,
          samples: [0, 1].map(() => ({
            position: [0, 0, 0],
            attachment: { surfaceRevision: f.project.surface.revision, patch: 0, uv: [0.5, 0.5] },
          })),
        },
      ];
    });
    expect(() => parseProject(input)).toThrow(/attachment/);
  });
  it('rejects invalid JSON and unbounded text', () => {
    expect(() => parseProject('{')).toThrow(/JSON/);
    expect(() => parseProject(' '.repeat(64_000_001))).toThrow(/limit/);
  });
});
describe('geometry exports', () => {
  it('OBJ face references recover the saved graph connectivity in meter coordinates', () => {
    const graph = generated().graph!;
    const obj = graphToOBJ(graph);
    const vertices = obj.split('\n').filter((l) => l.startsWith('v '));
    const faces = obj.split('\n').filter((l) => l.startsWith('f '));
    expect(vertices.length).toBe(graph.nodes.length);
    expect(faces.length).toBe(graph.cells.length);
    expect(vertices[0]!.split(' ').slice(1).map(Number)).toEqual(graph.nodes[0]!.position);
    expect(
      faces[0]!
        .split(' ')
        .slice(1)
        .map((n) => graph.nodes[Number(n) - 1]!.id)
    ).toEqual(graph.cells[0]!.nodes);
  });
  it('SVG declares projection semantics and preserves one path per graph edge', () => {
    const graph = generated().graph!;
    const svg = graphToSVG(graph);
    expect(svg).toContain('not imply graph adjacency');
    expect(svg.match(/<polyline /g)?.length).toBe(graph.edges.length);
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });
});
