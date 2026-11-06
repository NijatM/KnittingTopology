/** Scientific state is in meters; renderer/UI classes must not enter this contract. */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type SurfaceKind = 'plane' | 'cube' | 'sphere' | 'saddle';
export type TopologyPreset = 'regular' | 'inset' | 'alternating' | 'radial';
export type PatternFamily = 'quad' | 'dual' | 'ambo' | 'kis' | 'gyro' | 'diagonal';
export type StrategyKind = 'patch-grid' | 'n-sided-patch';

export interface SurfaceSpec {
  kind: SurfaceKind;
  size: number;
  /** Dimensionless saddle rise; ignored by other surfaces. */
  curvature: number;
  revision: string;
}

export interface SurfaceAttachment {
  surfaceRevision: string;
  patch: number;
  uv: Vec2;
  /** Picking mesh revision and triangle/barycentrics preserve drawn attachments. */
  faceId?: number;
  barycentric?: Vec3;
}

export interface GuideSample {
  position: Vec3;
  attachment: SurfaceAttachment;
}
export interface GuideStroke {
  id: string;
  samples: GuideSample[];
  strength: number;
  sampling?: { originalCount: number; retainedCount: number; method: 'uniform-index-subsample-v1' };
}

export interface PatternParameters {
  strategy: StrategyKind;
  spacing: number;
  orientation: number;
  guideStrength: number;
  relaxation: number;
  preset: TopologyPreset;
  family: PatternFamily;
  seed: number;
  /** 2–6 sides; the standalone patch strategy applies on plane only. */
  patchSides: number;
  boundaryCounts: number[];
  variant: number;
  /** Optional integer subdivision counts keyed by deterministic coarse strip IDs. */
  stripOverrides?: Record<string, number>;
}

export interface GraphNode {
  id: string;
  position: Vec3;
  attachment: SurfaceAttachment;
  feature?: 'corner' | 'crease' | 'boundary' | 'interior';
}
export interface GraphEdge {
  id: string;
  a: string;
  b: string;
  cells: string[];
  feature?: 'crease' | 'boundary' | 'seam';
  /** Surface-embedded samples; endpoints are always node positions. */
  path?: Vec3[];
}
export interface GraphCell {
  id: string;
  nodes: string[];
  patch: number;
  sourceCell?: string;
}
export interface CoarsePatch {
  id: string;
  corners: Vec3[];
  patch: number;
  subdivisions: number[];
  template: string;
}
export interface Provenance {
  algorithm: string;
  version: string;
  sources: string[];
  scope: string;
  parameters: PatternParameters;
  surfaceRevision: string;
  seed: number;
  notes: string[];
  /** UI freshness fingerprint of all generating inputs; not a security hash. */
  inputSignature?: string;
}
export interface PatternGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cells: GraphCell[];
  coarsePatches: CoarsePatch[];
  provenance: Provenance;
  coarseTopology?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    cells: GraphCell[];
    strips: { id: string; edgeIds: string[]; closed: boolean; subdivisions: number }[];
  };
}

export interface Diagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  label: string;
  message: string;
  value?: number;
  units?: string;
  tolerance?: number;
  method: string;
  entityIds?: string[];
}
export interface GraphStatistics {
  vertices: number;
  edges: number;
  cells: number;
  components: number;
  boundaryEdges: number;
  euler: number;
  extraordinaryVertices: number;
  meanEdgeLength: number;
  minEdgeLength: number;
  maxEdgeLength: number;
  spacingRmsRelative: number;
  totalEdgeLength: number;
  surfaceArea: number;
  quadFraction: number;
}
export interface GenerationInput {
  surface: SurfaceSpec;
  parameters: PatternParameters;
  guides: GuideStroke[];
}
export interface GenerationResult {
  graph: PatternGraph;
  diagnostics: Diagnostic[];
  statistics: GraphStatistics;
}
export interface ProjectState extends GenerationInput {
  schemaVersion: '1.0.0';
  name: string;
  graph: PatternGraph | null;
  diagnostics: Diagnostic[];
  statistics: GraphStatistics | null;
  /** Revisions distinguish edits from the graph's generating inputs. */
  revision: number;
}
export interface GenerationContext {
  cancelled?: () => boolean;
  progress?: (fraction: number, stage: string) => void;
}

export interface SurfaceMesh {
  positions: number[];
  indices: number[];
  /** Each triangle's patch ID; uv per duplicated display vertex. */
  trianglePatches: number[];
  uvs: number[];
}
