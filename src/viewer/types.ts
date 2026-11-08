import type { PatternGraph, SurfaceSpec, GuideStroke, GuideSample, Vec3 } from '../core/types';

export type InteractionMode = 'orbit' | 'draw' | 'select';
export type OverlayMode = 'plain' | 'valence' | 'spacing' | 'patches';
export interface ViewerOptions {
  mode: InteractionMode;
  overlay: OverlayMode;
  showSurface: boolean;
  showGraph: boolean;
  showGuides: boolean;
  showSeams: boolean;
  showNodes: boolean;
  showCoarse: boolean;
  wireframe: boolean;
  background: 'dark' | 'light';
}
export interface ViewerSelection {
  kind: 'node' | 'cell' | 'edge' | 'triangle';
  id: string;
}
export interface ViewerHandle {
  fit: () => void;
  view: (preset: 'perspective' | 'top' | 'front' | 'right') => void;
  screenshot: () => string;
}
export interface SurfaceViewerProps {
  surface: SurfaceSpec;
  graph: PatternGraph | null;
  guides: GuideStroke[];
  options: ViewerOptions;
  selection: ViewerSelection | null;
  /** A surface point to mark (the knit program loop under the pointer). */
  marker?: Vec3 | null;
  /** Display hierarchy only; never changes scientific geometry. */
  knitInspection?: boolean;
  shapeOverlay?: {
    courses: Vec3[][];
    highlightedCourses?: Vec3[][];
    marks: { position: Vec3; index: number; role: string; selected?: boolean }[];
    /** Saved knit graph stage (display only). */
    graph?: { weft: Vec3[][]; warp: Vec3[][]; loops: { position: Vec3; role: string }[] } | null;
  } | null;
  startEdge?: 'v0' | 'u1' | 'v1' | 'u0';
  pickStartEdge?: boolean;
  onStartEdge?: (edge: 'v0' | 'u1' | 'v1' | 'u0') => void;
  onShapePick?: (index: number) => void;
  cutEdgeIds?: readonly string[];
  pickCutEdge?: boolean;
  onCutEdgePick?: (edgeId: string) => void;
  onStroke: (samples: GuideSample[]) => void;
  onSelect: (selection: ViewerSelection | null) => void;
  onHover?: (text: string) => void;
  onReady?: (handle: ViewerHandle) => void;
  onError?: (message: string) => void;
}
