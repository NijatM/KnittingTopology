/** Scientific state is in meters; renderer/UI classes must not enter this contract. */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export type AnalyticSurfaceKind = 'plane' | 'cube' | 'sphere' | 'saddle';
export type SurfaceKind = AnalyticSurfaceKind | 'mesh';
export type MeshUnit = 'mm' | 'cm' | 'm' | 'in';
export interface ImportedMeshData {
  /** Centered positions in meters, with the original offset recorded below. */
  positions: number[];
  indices: number[];
  /** Optional complete, single-valued OBJ texture coordinates, two per position. */
  uvs?: number[];
  source: {
    name: string;
    format: 'obj' | 'stl-ascii' | 'stl-binary';
    unit: MeshUnit;
    scaleToMeters: number;
    centerMeters: Vec3;
    indexing: 'obj-indices' | 'stl-exact-weld';
    notes: string[];
  };
}
export interface ImportedMeshReport {
  uvMapping?: RectangularUVReport;
  statistics: {
    vertices: number;
    usedVertices: number;
    triangles: number;
    /** Raw repeated-index faces, retained for inspection but excluded from incidence. */
    collapsedTriangles: number;
    incidenceTriangles: number;
    edges: number;
    components: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    nonManifoldVertices: number;
    inconsistentEdges: number;
    degenerateTriangles: number;
    duplicateTriangles: number;
    isolatedVertices: number;
    euler: number;
    areaM2: number;
    boundsMin: Vec3;
    boundsMax: Vec3;
    extent: Vec3;
    signedVolumeM3: number | null;
  };
  diagnostics: Diagnostic[];
}
export interface RectangularUVReport {
  status: 'ready' | 'unavailable';
  reason: string;
  boundsMin?: Vec2;
  boundsMax?: Vec2;
  uvArea?: number;
  minScaleM?: number;
  maxScaleM?: number;
  maxCondition?: number;
  diagnostics: Diagnostic[];
}
export type TopologyPreset = 'regular' | 'inset' | 'alternating' | 'radial';
export type PatternFamily = 'quad' | 'dual' | 'ambo' | 'kis' | 'gyro' | 'diagonal';
export type StrategyKind = 'patch-grid' | 'n-sided-patch';

export interface SurfaceSpec {
  kind: SurfaceKind;
  size: number;
  /** Dimensionless saddle rise; ignored by other surfaces. */
  curvature: number;
  revision: string;
  /** Present only for imported, inspection-only surfaces. No analytic UV atlas is implied. */
  mesh?: ImportedMeshData;
  /** User-supplied OBJ chart, revalidated before use; never an automatic unwrap. */
  mapping?: 'rectangular-obj-uv-v1';
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
  toleranceUnits?: string;
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
  /** Knit program settings; outside the scientific input signature. */
  knit?: KnitSettings;
  /** Swatch measurement table, one entry per structure id. */
  swatches?: SwatchEntry[];
}

/** Design-level knit program (Knit Grammar bitmap convention). Structure ids name Knit Grammar structures. */
export type KnitMode = 'network' | 'shape' | 'both';
export type KnitCellRule =
  | { kind: 'uniform' }
  /** Structure by cell side count ('3', '4', '5', '6+'); missing counts use the fill. */
  | { kind: 'sides'; bySides: Record<string, string> }
  /** Coarse topology cells coloured so that neighbours differ, using the palette in order. */
  | { kind: 'coarse'; palette: string[] }
  /** Two-colouring of the cell adjacency; odd cycles are reported as conflicts. */
  | { kind: 'alternating'; palette: string[] };
export interface KnitTile {
  id: string;
  name: string;
  keyId: string;
  w: number;
  h: number;
  /** Image order: row zero is the tile's last pass. */
  rows: string[][];
  note?: string;
}
/** A custom colour key: a copy of a class key (operation vocabulary in src/knit/keys.ts). */
export interface KnitKey {
  id: string;
  name: string;
  mode: 1 | 2;
  ops: {
    id: string;
    name: string;
    colour: string;
    rgb: [number, number, number];
    steps: { action: 'knit' | 'tuck' | 'float'; bed: 'front' | 'back' }[];
    move: 'none' | 'across' | 'left' | 'right';
    provisional?: boolean;
    note?: string;
    letter?: string;
  }[];
  credit?: string;
  notes?: string[];
}
export interface KnitCutSettings {
  surfaceRevision: string;
  /** Noncryptographic signature of the accepted source graph and surface. */
  sourceSignature: string;
  preset: 'cube-cross' | 'sphere-meridian' | 'manual';
  edgeIds: string[];
}
export interface KnitSettings {
  mode: KnitMode;
  /** Chart side used for the first course. Missing in older projects means v0. */
  startEdge?: 'v0' | 'u1' | 'v1' | 'u0';
  /** Initial action on an opened needle; unconfirmed lab convention, default knit. */
  newLoop?: 'knit' | 'tuck';
  /** A class key or one of `keys`. */
  keyId: string;
  /** Custom keys saved with the project. */
  keys?: KnitKey[];
  /** Immutable saved copies. New designs get new IDs and do not inherit measurements. */
  tiles?: KnitTile[];
  /** A draft closed-surface cut; derived cut complexes are not persisted. */
  cut?: KnitCutSettings;
  /** From the jersey swatch and the surface size, or typed directly. */
  size: { source: 'gauge' } | { source: 'typed'; needles: number; passes: number };
  cells: { fill: string; rule: KnitCellRule; overrides: Record<string, string> };
  /** Network edges drawn as lines `width` loops wide; null = not drawn. `boundary` also draws edges and node
   *  marks on the network boundary. */
  edges: { structure: string | null; width: number; boundary: boolean };
  /** Node marks `size` loops square; extraordinary nodes may use their own structure. */
  nodes: { structure: string | null; size: number; extraordinary: string | null };
  autoTransfers: boolean;
  limits: { float: number; held: number; tucks: number };
  /** Pipeline rules still to confirm with the lab (Knit Grammar defaults). */
  lab: {
    firstPass: 'left-to-right' | 'right-to-left';
    transferTiming: 'after-row' | 'per-needle';
    travel: 'same-stroke' | 'two-strokes';
  };
}
/** User-reported measurement conditions, not machine configuration or a material model. */
export interface SwatchCalibration {
  /** Omitted on legacy/unspecified records; never inferred from dimensions. */
  state?: 'relaxed' | 'tensioned' | 'biaxial-locked';
  machine?: string;
  knitPoint?: string;
  yarnTension?: string;
  knittingSpeed?: string;
  protocol?: string;
}
/** One swatch measurement. Lengths in meters (millimeters in the UI); text fields as entered. */
export interface SwatchEntry {
  structure: string;
  /** Needle (wale) spacing. */
  stitchWidth: number;
  /** Pass (course) spacing. */
  courseHeight: number;
  date?: string;
  gauge?: string;
  yarn?: string;
  stitchLength?: string;
  note?: string;
  calibration?: SwatchCalibration;
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
