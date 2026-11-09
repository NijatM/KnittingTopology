import type {
  GraphEdge,
  KnitCutSettings,
  PatternGraph,
  SurfaceAttachment,
  SurfaceSpec,
  Vec3,
} from '../core/types';
export interface CutVertex {
  id: string;
  sourceId: string;
  position: Vec3;
  attachment: SurfaceAttachment;
}
export interface CutEdge {
  id: string;
  sourceId: string;
  a: string;
  b: string;
  faces: string[];
  path?: Vec3[];
}
export interface CutFace {
  id: string;
  sourceId: string;
  patch: number;
  vertices: string[];
  edges: string[];
}
export interface CutComplex {
  vertices: CutVertex[];
  edges: CutEdge[];
  faces: CutFace[];
}
export interface CutBoundaryStep {
  edgeId: string;
  sourceEdgeId: string;
  faceId: string;
  from: string;
  to: string;
}
export interface CutSeam {
  sourceEdgeId: string;
  lengthM: number;
  sides: [CutBoundaryStep, CutBoundaryStep];
  /** Match source endpoints, independently of the two boundary traversal directions. */
  vertexPairs: [[string, string], [string, string]];
}
export interface CutPlan {
  version: 'cut-corner-fans-v1';
  settings: KnitCutSettings;
  surface: SurfaceSpec;
  provenance: PatternGraph['provenance'];
  complex: CutComplex;
  boundary: CutBoundaryStep[];
  /** Original open polar rims, not paired cut seams; absent on legacy closed sources. */
  naturalBoundaries?: CutBoundaryStep[];
  seams: CutSeam[];
  statistics: {
    sourceEuler: number;
    euler: number;
    components: number;
    boundaryComponents: number;
    cutVertices: number;
    cutEdges: number;
    branchVertices: number;
    cutLengthM: number;
  };
  notes: string[];
}
export type CutBuild = { ok: true; plan: CutPlan } | { ok: false; reason: string };
export type CutInput = {
  surface: SurfaceSpec;
  graph: PatternGraph;
  settings?: KnitCutSettings;
  preset?: 'cube-cross' | 'sphere-meridian';
};
export const cutEdgeLength = (edge: Pick<GraphEdge, 'path'>, a: Vec3, b: Vec3) => {
  const p = edge.path && edge.path.length >= 2 ? edge.path : [a, b];
  let len = 0;
  for (let i = 1; i < p.length; i++)
    len += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1], p[i]![2] - p[i - 1]![2]);
  if (!Number.isFinite(len) || len <= 0)
    throw new Error('Cut edges need finite positive sampled length.');
  return len;
};
/** Edge samples ordered from node `a` to node `b`. */
export function orientedEdgePath(edge: Pick<GraphEdge, 'path'>, a: Vec3, b: Vec3): Vec3[] {
  const p = edge.path && edge.path.length >= 2 ? edge.path : [a, b];
  const d = (q: Vec3, s: Vec3) => Math.hypot(q[0] - s[0], q[1] - s[1], q[2] - s[2]);
  return d(p[0]!, a) <= d(p[0]!, b) ? p : [...p].reverse();
}
