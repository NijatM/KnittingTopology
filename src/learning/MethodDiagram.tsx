import { useMemo, useState } from 'react';
import { generatePattern } from '../core/generate';
import { evaluateSurface } from '../core/surfaces';
import type {
  GraphCell,
  GraphEdge,
  GraphNode,
  GuideStroke,
  PatternGraph,
  PatternParameters,
  SurfaceSpec,
  Vec3,
} from '../core/types';
import type { MethodLesson } from './types';

type DiagramGraph = { nodes: GraphNode[]; edges: GraphEdge[]; cells: GraphCell[] };
export interface TeachingFixture {
  base: DiagramGraph;
  result: PatternGraph;
  guides: GuideStroke[];
  caption: string;
  overlayDescription: string;
}
const PATTERNS = new Set(['quad', 'dual', 'ambo', 'kis', 'gyro', 'diagonal']);
const SIZE = 0.12;
const SURFACE: SurfaceSpec = {
  kind: 'plane',
  size: SIZE,
  curvature: 0,
  revision: 'teaching-plane-v1',
};
const PARAMETERS: PatternParameters = {
  strategy: 'patch-grid',
  spacing: 0.03,
  orientation: 0,
  guideStrength: 0,
  relaxation: 0,
  preset: 'regular',
  family: 'quad',
  seed: 17,
  patchSides: 4,
  boundaryCounts: [4, 4, 4, 4],
  variant: 0,
};

/** Small, deterministic examples use the application's actual numerical kernel. */
export function createTeachingFixture(lesson: MethodLesson): TeachingFixture {
  const parameters = { ...PARAMETERS, boundaryCounts: [...PARAMETERS.boundaryCounts] };
  let guides: GuideStroke[] = [];
  let caption =
    'Illustrative plane, 120 mm side. A 4 × 4 quad base is mapped by the selected operator.';
  let overlayDescription = 'Dashed: original edges. Solid: mapped edges.';
  if (PATTERNS.has(lesson.id)) parameters.family = lesson.id as PatternParameters['family'];
  else if (lesson.id.startsWith('preset-')) {
    parameters.preset = lesson.id.replace('preset-', '') as PatternParameters['preset'];
    caption =
      'Illustrative plane, 120 mm side. The recorded coarse topology is subdivided with a 30 mm spacing request.';
    overlayDescription = 'Dashed: actual coarse edges. Solid: subdivided edges.';
  } else if (lesson.id === 'coarse-topology') {
    parameters.preset = 'inset';
    caption =
      'Illustrative plane, 120 mm side. The inset coarse topology and its compatible strip subdivision are generated together.';
    overlayDescription = 'Dashed: actual coarse edges. Solid: subdivided edges.';
  } else if (lesson.id === 'patch-quadrangulation') {
    parameters.strategy = 'n-sided-patch';
    parameters.patchSides = 5;
    parameters.boundaryCounts = [4, 4, 4, 4, 4];
    caption =
      'Illustrative plane patch: 5 sides, 4 boundary edges per side. The supported central-fan template is subdivided by the same kernel.';
    overlayDescription = 'Dashed: actual central-fan coarse edges. Solid: final quads.';
  } else if (lesson.id === 'guides') {
    parameters.guideStrength = 0.9;
    parameters.relaxation = 0.35;
    const samples = Array.from({ length: 9 }, (_, i) => {
      const x = -0.04 + i * 0.01;
      const y = x * Math.tan(Math.PI / 6);
      const uv: [number, number] = [0.5 + x / SIZE, 0.5 + y / SIZE];
      return {
        position: evaluateSurface(SURFACE, 0, ...uv),
        attachment: { surfaceRevision: SURFACE.revision, patch: 0, uv },
      };
    });
    guides = [{ id: 'teaching-guide-30deg', samples, strength: 1 }];
    caption =
      'Illustrative plane, 120 mm side. A 30° guide, 90% guide influence and 35% relaxation fit the same 4 × 4 base; boundary nodes stay pinned.';
    overlayDescription =
      'Dashed: unfitted base. Solid: fitted result. Amber dotted: the actual guide.';
  }
  const generated = generatePattern({ surface: SURFACE, parameters, guides });
  const errors = generated.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) throw new Error(errors.map((d) => d.message).join(' '));
  if (generated.graph.cells.length > 96)
    throw new Error('Teaching fixture exceeded its 96-cell display bound.');
  let base: DiagramGraph;
  if (PATTERNS.has(lesson.id) || lesson.id === 'guides') {
    const original = generatePattern({
      surface: SURFACE,
      parameters: { ...PARAMETERS, boundaryCounts: [...PARAMETERS.boundaryCounts] },
      guides: [],
    });
    if (original.diagnostics.some((d) => d.severity === 'error'))
      throw new Error('The teaching base did not pass its graph checks.');
    base = original.graph;
  } else {
    const coarse = generated.graph.coarseTopology;
    if (!coarse) throw new Error('The generated teaching fixture has no recorded coarse topology.');
    base = coarse;
  }
  return { base, result: generated.graph, guides, caption, overlayDescription };
}

function graphPaths(graph: DiagramGraph, point: (p: Vec3) => string) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return graph.edges.map((edge) => {
    const path = edge.path?.length
      ? edge.path
      : [nodes.get(edge.a), nodes.get(edge.b)].filter((p): p is Vec3 => !!p);
    return { id: edge.id, path: path.map((p, i) => `${i ? 'L' : 'M'}${point(p)}`).join(' ') };
  });
}

export default function MethodDiagram({ lesson }: { lesson: MethodLesson }) {
  const [stage, setStage] = useState<'base' | 'overlay' | 'result'>('overlay');
  const fixture = useMemo(() => {
    try {
      return { data: createTeachingFixture(lesson), error: '' };
    } catch (cause) {
      return { data: null, error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [lesson]);
  if (!fixture.data)
    return (
      <div className="learning-diagram-error" role="alert">
        Teaching diagram unavailable: {fixture.error}
      </div>
    );
  const { base, result, guides, caption, overlayDescription } = fixture.data;
  const positions = [...base.nodes, ...result.nodes].map((node) => node.position);
  const minX = Math.min(...positions.map((p) => p[0])),
    maxX = Math.max(...positions.map((p) => p[0]));
  const minY = Math.min(...positions.map((p) => p[1])),
    maxY = Math.max(...positions.map((p) => p[1]));
  const extent = Math.max(maxX - minX, maxY - minY, 1e-9);
  const point = (p: Vec3) =>
    `${140 + ((p[0] - (minX + maxX) / 2) * 226) / extent},${122 - ((p[1] - (minY + maxY) / 2) * 226) / extent}`;
  const originals = graphPaths(base, point),
    mapped = graphPaths(result, point);
  const current = stage === 'base' ? base : result;
  const nodeMap = new Map(current.nodes.map((node) => [node.id, node.position]));
  return (
    <figure className="learning-diagram">
      <div className="learning-diagram-controls" role="group" aria-label="Construction steps">
        {(['base', 'overlay', 'result'] as const).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={stage === value}
            onClick={() => setStage(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 280 250" role="img" aria-label="Construction diagram">
        <title>
          {lesson.title}: {stage} of an illustrative plane example
        </title>
        <desc>
          {caption}{' '}
          {stage === 'overlay'
            ? overlayDescription
            : stage === 'base'
              ? 'Original network.'
              : 'Generated result network.'}
        </desc>
        <g className="learning-diagram-faces">
          {current.cells.map((cell) => (
            <polygon
              key={cell.id}
              points={cell.nodes
                .map((id) => nodeMap.get(id))
                .filter((p): p is Vec3 => !!p)
                .map(point)
                .join(' ')}
            />
          ))}
        </g>
        {stage !== 'result' && (
          <g
            className={
              stage === 'overlay'
                ? 'learning-diagram-base learning-diagram-dashed'
                : 'learning-diagram-base'
            }
          >
            {originals.map((edge) => (
              <path key={edge.id} d={edge.path} />
            ))}
          </g>
        )}
        {stage !== 'base' && (
          <g className="learning-diagram-result">
            {mapped.map((edge) => (
              <path key={edge.id} d={edge.path} />
            ))}
          </g>
        )}
        {stage !== 'base' && (
          <g className="learning-diagram-guide">
            {guides.map((guide) => (
              <polyline
                key={guide.id}
                points={guide.samples.map((sample) => point(sample.position)).join(' ')}
              />
            ))}
          </g>
        )}
        <g className="learning-diagram-nodes">
          {current.nodes.map((node) => {
            const [cx, cy] = point(node.position).split(',');
            return <circle key={node.id} cx={cx} cy={cy} r="1.1" />;
          })}
        </g>
      </svg>
      <div className="learning-diagram-counts">
        <span>
          Base{' '}
          <b>
            {base.nodes.length} V · {base.edges.length} E · {base.cells.length} F
          </b>
        </span>
        <span>
          Result{' '}
          <b>
            {result.nodes.length} V · {result.edges.length} E · {result.cells.length} F
          </b>
        </span>
      </div>
      <figcaption>
        {caption}
        <span>
          {stage === 'overlay'
            ? overlayDescription
            : stage === 'base'
              ? 'Showing the original network.'
              : 'Showing the generated result.'}
        </span>
        <strong>Teaching fixture · independent of the current viewport</strong>
      </figcaption>
    </figure>
  );
}
