import type {
  GenerationContext,
  GenerationInput,
  GenerationResult,
  GraphEdge,
  GraphNode,
  PatternGraph,
  Vec2,
  Vec3,
} from '../core/types';
import { analyzeGraph, polygonArea } from '../core/diagnostics';
import { norm, sub } from '../core/math';
import { MAX_SUBDIVISIONS } from '../core/limits';
import { formatCitation, relevantReferenceIds } from '../learning/citations';
import { REFERENCES } from '../learning/references';
import {
  checkRectangularUV,
  evaluateMappedSurface,
  mappedUVPath,
  MAPPED_PATH_METHOD_VERSION,
  requireRectangularUV,
} from './uv-mapping';

const MAX_MAPPED_PATH_POINTS = 2_000_000;
function checkpoint(context: GenerationContext | undefined, fraction: number, stage: string) {
  if (context?.cancelled?.()) {
    const error = new Error('Generation cancelled.');
    error.name = 'AbortError';
    throw error;
  }
  context?.progress?.(fraction, stage);
}
function boundedPath(surface: GenerationInput['surface'], a: Vec2, b: Vec2): Vec3[] {
  const path = mappedUVPath(surface, a, b);
  if (path.length > 1024)
    throw new Error(
      'Mapped edge exceeds the 1024-sample project path limit; simplify the support chart.'
    );
  return path;
}
function pathLength(path: Vec3[]): number {
  let length = 0;
  for (let i = 1; i < path.length; i++) length += norm(sub(path[i]!, path[i - 1]!));
  return length;
}
/** Fit and transform in normalized UV, then embed without changing graph identities. */
export function generateMappedPattern(
  input: GenerationInput,
  context: GenerationContext | undefined,
  analyticGenerate: (input: GenerationInput, context?: GenerationContext) => GenerationResult
): GenerationResult {
  const surface = input.surface;
  if (surface.kind !== 'mesh' || surface.mapping !== 'rectangular-obj-uv-v1' || !surface.mesh)
    throw new Error('Mapped generation requires a selected rectangular OBJ UV chart.');
  requireRectangularUV(surface.mesh, context);
  if (input.parameters.strategy !== 'patch-grid')
    throw new Error(
      'Mapped OBJ generation supports patch-grid only; the N-sided patch subset is plane-only.'
    );
  checkpoint(context, 0.02, 'Preparing normalized rectangular UV topology');
  // The unit square is a dimensionless computation chart. Physical spacing is computed below.
  const plane = { kind: 'plane' as const, size: 1, curvature: 0, revision: surface.revision };
  const probeInput: GenerationInput = {
    surface: plane,
    parameters: {
      ...input.parameters,
      spacing: 1,
      family: 'quad',
      orientation: 0,
      guideStrength: 0,
      relaxation: 0,
      stripOverrides: {},
    },
    guides: [],
  };
  const probe = analyticGenerate(probeInput, { cancelled: context?.cancelled });
  const coarse = probe.graph.coarseTopology!;
  const coarseNodes = new Map(coarse.nodes.map((node) => [node.id, node]));
  const lengths = new Map<string, number>();
  for (let i = 0; i < coarse.edges.length; i++) {
    if (i % 32 === 0)
      checkpoint(
        context,
        0.04 + (0.06 * i) / coarse.edges.length,
        'Measuring mapped coarse strips in meters'
      );
    const edge = coarse.edges[i]!;
    lengths.set(
      edge.id,
      pathLength(
        boundedPath(
          surface,
          coarseNodes.get(edge.a)!.attachment.uv,
          coarseNodes.get(edge.b)!.attachment.uv
        )
      )
    );
  }
  const overrides: Record<string, number> = {};
  const requested = input.parameters.stripOverrides ?? {};
  for (const strip of coarse.strips) {
    const meanLength =
      strip.edgeIds.reduce((sum, id) => sum + lengths.get(id)!, 0) / strip.edgeIds.length;
    const count =
      requested[strip.id] ?? Math.max(1, Math.round(meanLength / input.parameters.spacing));
    if (!Number.isInteger(count) || count < 1 || count > MAX_SUBDIVISIONS)
      throw new Error(
        `Strip ${strip.id} requires an integer subdivision count from 1 to 128; increase physical target spacing or reduce its override.`
      );
    overrides[strip.id] = count;
  }
  for (const id of Object.keys(requested))
    if (!(id in overrides))
      throw new Error(
        `Unknown coarse strip override ${id}; regenerate topology before editing its strips.`
      );
  const chartInput: GenerationInput = {
    surface: plane,
    parameters: { ...input.parameters, spacing: 1, stripOverrides: overrides },
    guides: input.guides.map((guide) => ({
      ...guide,
      samples: guide.samples.map((sample) => ({
        position: [sample.attachment.uv[0] - 0.5, sample.attachment.uv[1] - 0.5, 0] as Vec3,
        attachment: {
          surfaceRevision: plane.revision,
          patch: 0,
          uv: [...sample.attachment.uv] as Vec2,
        },
      })),
    })),
  };
  const chart = analyticGenerate(chartInput, {
    cancelled: context?.cancelled,
    progress: (fraction, stage) => checkpoint(context, 0.1 + fraction * 0.57, `UV chart: ${stage}`),
  });
  const graph = chart.graph;
  let pathPoints = 0,
    work = 0;
  const mapNodes = (nodes: GraphNode[]): GraphNode[] =>
    nodes.map((node) => {
      if (work++ % 128 === 0) checkpoint(context, 0.7, 'Embedding chart nodes on source triangles');
      return { ...node, ...evaluateMappedSurface(surface, ...node.attachment.uv) };
    });
  const mapEdges = (edges: GraphEdge[], sourceNodes: GraphNode[]): GraphEdge[] => {
    const nodes = new Map(sourceNodes.map((node) => [node.id, node]));
    return edges.map((edge) => {
      if (work++ % 64 === 0)
        checkpoint(context, 0.78, 'Tracing UV edges across every source triangle');
      const path = boundedPath(
        surface,
        nodes.get(edge.a)!.attachment.uv,
        nodes.get(edge.b)!.attachment.uv
      );
      pathPoints += path.length;
      if (pathPoints > MAX_MAPPED_PATH_POINTS)
        throw new Error(
          'Mapped paths exceed the two-million-point interactive limit; increase target spacing or simplify the support mesh.'
        );
      return { ...edge, path };
    });
  };
  const finalNodes = mapNodes(graph.nodes);
  const mappedCoarseNodes = graph.coarseTopology && mapNodes(graph.coarseTopology.nodes);
  const mapped: PatternGraph = {
    ...graph,
    nodes: finalNodes,
    edges: mapEdges(graph.edges, graph.nodes),
    coarsePatches: graph.coarsePatches.map((patch) => ({
      ...patch,
      corners: patch.corners.map(
        (point) => evaluateMappedSurface(surface, point[0] + 0.5, point[1] + 0.5).position
      ),
    })),
    coarseTopology: graph.coarseTopology && {
      ...graph.coarseTopology,
      nodes: mappedCoarseNodes!,
      edges: mapEdges(graph.coarseTopology.edges, graph.coarseTopology.nodes),
    },
    provenance: {
      ...graph.provenance,
      algorithm: `Rectangular supplied-OBJ UV chart quadrangulation with ${input.parameters.family} graph mapping`,
      version: '1.0.0',
      parameters: structuredClone(input.parameters),
      sources: relevantReferenceIds(input.parameters, surface).map((id) =>
        formatCitation(REFERENCES[id])
      ),
      scope:
        'Engineering extension: existing coarse quad templates, opposite-edge strip subdivision and six graph transformations fitted in a supplied rectangular OBJ UV chart, then barycentrically embedded. Orientation, guide fitting and relaxation are UV heuristics, not an intrinsic surface field. Density uses physical coarse-edge polyline lengths with integer strip counts; chart distortion and transformations change final physical spacing. Not a full reproduction of the cited papers, a geodesic algorithm, a global 3D intersection certificate, or a fabrication/structural assessment.',
      notes: [
        ...graph.provenance.notes.map((note) => `UV chart computation: ${note}`),
        'Input parameters above are the original user parameters; the internal plane has unit chart size and unit reference spacing, with subdivisions measured from physical mapped coarse strips. Raw OBJ texture-coordinate units never determine physical spacing.',
        `Mapped path method: ${MAPPED_PATH_METHOD_VERSION}; canonical paths are recomputed when validating saved graphs.`,
        'World units: meters. Normalized UV is dimensionless. Node attachments retain normalized UV, original triangle ID and barycentric coordinates. Paths insert every crossed source-triangle edge; lengths are measured piecewise-linear UV-path lengths subject to floating-point thresholds, not shortest geodesics.',
        'Local 3D polygon orientation and quad corner checks can conservatively reject strongly folded valid charts. No global 3D self-intersection test is performed.',
        'Bounded mapped output: at most 1024 samples per edge and two million path points across final and coarse graphs; shared graph IDs and ordered boundaries are retained.',
      ],
    },
  };
  checkpoint(context, 0.87, 'Checking mapped incidence, membership and physical geometry');
  const result = analyzeGraph(mapped, surface, input.parameters.spacing);
  const report = checkRectangularUV(surface.mesh, context);
  result.diagnostics.push(
    {
      id: 'spacing',
      severity: result.statistics.spacingRmsRelative > 0.25 ? 'warning' : 'info',
      label: 'Achieved physical edge spacing',
      message: `Physical UV-path edge-length relative RMS deviation is ${(result.statistics.spacingRmsRelative * 100).toFixed(1)}%. Integer strips, chart distortion and graph transformations affect the result.`,
      value: result.statistics.spacingRmsRelative,
      units: 'relative RMS',
      method:
        'sqrt(mean((sum of source-triangle path segment lengths in meters / requested spacing in meters − 1)²)); not geodesic distance.',
    },
    {
      id: 'support-area',
      severity: 'info',
      label: 'Imported support area',
      message: 'Sum of input triangle areas, including all supplied support faces.',
      value: result.statistics.surfaceArea,
      units: 'm²',
      method: 'Σ 0.5 × |cross(p1 − p0, p2 − p0)| for indexed source triangles.',
    },
    {
      id: 'polygon-area',
      severity: 'info',
      label: 'Graph chord polygon area',
      message:
        'Chord polygon area approximates the bent cells; support area and boundary path lengths are measured separately.',
      value: polygonArea(mapped),
      units: 'm²',
      method:
        'Σ |½ Σ cross(p_i,p_(i+1))|; no mesh-clipped cell area integration or crossing certificate.',
    },
    {
      id: 'chart-distortion',
      severity: 'info',
      label: 'Supplied chart local distortion',
      message: `Source triangle singular scales span ${report.minScaleM}–${report.maxScaleM} meters per normalized UV; maximum condition number ${report.maxCondition}.`,
      value: report.maxCondition,
      units: 'ratio',
      method:
        'Per-source-triangle singular values of the affine map from independently normalized rectangular UV to 3D; max(scale_max / scale_min).',
    },
    {
      id: 'paper-scope',
      severity: 'info',
      label: 'Mapped method scope',
      message: mapped.provenance.scope,
      method:
        'Explicit supplied-chart engineering extension; primary citations retained in provenance.',
    }
  );
  for (const diagnostic of chart.diagnostics)
    if (diagnostic.id === 'embedding-displacement' || diagnostic.id === 'guide-alignment')
      result.diagnostics.push({
        ...diagnostic,
        id: `uv-${diagnostic.id}`,
        label: `UV chart ${diagnostic.label.toLowerCase()}`,
        message: `Dimensionless unit-square chart measurement before physical embedding: ${diagnostic.message}`,
        units: diagnostic.id === 'embedding-displacement' ? 'normalized UV' : diagnostic.units,
        method: `Measured on the unit-square UV graph only. ${diagnostic.method}`,
      });
  const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length)
    throw new Error(
      `Mapped graph failed validation: ${errors.map((diagnostic) => `${diagnostic.label}: ${diagnostic.message}`).join('; ')}`
    );
  checkpoint(context, 1, 'Validated mapped graph ready');
  return { graph: mapped, ...result };
}
