// Design-level shaping contracts. Surface positions and arc lengths are in meters.
import type { KnitGraphStages, Vec2, Vec3 } from '../core/types';
import type { CubeNetLayout } from './cube-net';
import type { SphereKnitLayout } from './sphere-knit';

export type StartEdge = 'v0' | 'u1' | 'v1' | 'u0';
/** A rectangle of the surface chart: one computational patch (Popescu 2019, §6.3.2). Without one,
 * shaping uses the whole chart. */
export interface ChartWindow {
  u: [number, number];
  v: [number, number];
}
export interface ShapePoint {
  /** Original surface-chart coordinates (before the start-edge rotation). */
  uv: Vec2;
  position: Vec3;
  /** Distance from the needle-1 side, in meters. */
  across: number;
  /** Surface patch of `uv`; closed surfaces only. */
  patch?: number;
  /** Closed surfaces only: flat-net position in face-edge units (cube), or [longitude from the cut
   * in turns, latitude fraction from the bottom pole] (sphere). */
  net?: Vec2;
}
export interface ShapeLoop extends ShapePoint {
  id: string;
  /** Measured stitch width of this loop's patch when it differs from the geometry's (joined pieces). */
  stitchWidth?: number;
}
export interface ShapeCourse {
  id: string;
  /** Course order, zero based; it becomes a carriage pass. */
  index: number;
  /** Ordered from needle-1 side towards the opposite side. */
  points: ShapePoint[];
  loops: ShapeLoop[];
  extent: [number, number];
  leftBoundary: boolean;
  rightBoundary: boolean;
  /** A side on a piece boundary inside the chart (joined pieces, project construction): loops beyond it
   * stay held, but new loops may start beyond the parents, as at a boundary. */
  leftFree?: boolean;
  rightFree?: boolean;
  /** Arc-length fraction of the boundary before each loop and after the last (joined courses, whose parts
   * have their own loop widths); without it the loops divide the course equally. */
  loopCuts?: number[];
  turnStart: boolean;
  turnEnd: boolean;
  length: number;
}
export interface ShapeGeometry {
  courses: ShapeCourse[];
  contours: ShapePoint[][];
  courseHeight: number;
  stitchWidth: number;
  /** Per-contour length minus rounded sample count times the measured course height. */
  contourRounding: number[];
  /** Per-course length minus loop count times the measured stitch width. */
  courseRounding: number[];
  maxLinkOffset: number;
  resolution: number;
  method: string;
  issues: string[];
  /** Joined pieces: after course `after`, the held loops whose IDs start with `prefix` leave the bed (a
   * patch that stops at a piece boundary inside the chart; project construction). */
  release?: { after: number; prefix: string }[];
  /** Open surfaces: contour samples, their links (indices in contour order) and each course's samples. */
  graph?: { samples: ShapePoint[][]; links: [number, number][]; courses: number[][] };
}
export type ShapeRole = 'loop' | 'turn' | 'increase' | 'decrease' | 'edge increase' | 'transfer';
export interface ShapePlacement {
  loop: ShapeLoop;
  course: number;
  needle: number;
  role: ShapeRole;
  parents: string[];
}
export interface ShapeStep {
  /** One-based pass; needle indices are zero-based. */
  pass: number;
  needle: number;
  role: ShapeRole;
  reason?: string;
}
export interface ShapeMove {
  /** One-based source and consuming pass; needle indices are zero-based. */
  pass: number;
  needle: number;
  to: number;
  forPass: number;
  role: 'increase' | 'decrease';
}
export interface ShapeNeedles {
  w: number;
  h: number;
  placements: ShapePlacement[];
  moves: ShapeMove[];
  steps: ShapeStep[];
  unresolved: ShapeStep[];
  yarnJumps: number;
}
export interface ShapeKnitGraph {
  /** The stages this layout was built from; the app saves them after an accepted build. */
  stages: KnitGraphStages;
  /** Stages reused from the project rather than computed in this build. */
  saved: { courses: boolean; loops: boolean };
  checks: { id: string; label: string; source: string; violations: number; examples: string[] }[];
}
/** Needles where a patch of a joined piece stops inside the chart (zero-based needles, one-based pass). */
export interface PieceStop {
  pass: number;
  from: number;
  to: number;
  /** Loop ID prefix of the patch (`P<n>/`). */
  patch: string;
  /** A later pass knits on one of these needles, so the loops must be cast off, not held. */
  reused: boolean;
}
export interface ShapeResult {
  geometry: ShapeGeometry;
  needles: ShapeNeedles;
  /** Image-order placement index, -1 for held/outside needles. */
  placementAt: Int32Array;
  /** Reasons blocking operation-file export; reports remain available. */
  blockers: string[];
  /** Closed-surface flat net: stops, one-pass shifts and seam loops. */
  closed?: CubeNetLayout;
  /** Sphere opened by a pole-to-pole cut: counts, short rows, poles and seam loops. */
  sphere?: SphereKnitLayout;
  /** Joined pieces: needles that stop inside the chart (reported, not blocking). */
  stops?: PieceStop[];
  /** Saved-stage form of this layout (measured layouts only). */
  knitGraph?: ShapeKnitGraph;
}
