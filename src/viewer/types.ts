import type {
  PatternGraph,
  SurfaceSpec,
  GuideStroke,
  GuideSample,
  Vec2,
  Vec3,
} from '../core/types';

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
/** Handles of the knit graph courses stage; the app applies edits, the viewer reports intents. */
export interface GraphEditHandles {
  points: { id: string; position: Vec3 }[];
  segments: { id: string; a: Vec3; b: Vec3 }[];
  /** Points of a course being drawn. */
  draft?: Vec3[];
}
/** The handle and surface point under the pointer (`uv` null off the surface). */
export interface GraphEditTarget {
  point?: string;
  segment?: string;
  uv: Vec2 | null;
  position: Vec3 | null;
}
/** A click (no `drop`) or a drag from the press to the drop. */
export interface GraphEditIntent extends GraphEditTarget {
  drop?: GraphEditTarget;
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
  /** The chart rectangle whose side `startEdge` names (a computational patch); the whole chart if unset. */
  startEdgeWindow?: { u: [number, number]; v: [number, number] };
  pickStartEdge?: boolean;
  onStartEdge?: (edge: 'v0' | 'u1' | 'v1' | 'u0') => void;
  onShapePick?: (index: number) => void;
  /** Courses-stage editing on the surface; orbit is off while it is set. */
  graphEdit?: GraphEditHandles | null;
  onGraphEdit?: (intent: GraphEditIntent) => void;
  /** Accessible name of the canvas while `graphEdit` is set, when the editor is not the courses editor. */
  graphEditLabel?: string;
  /** Computational patch layout (display only): knitted-through edges drawn single, seams double, and
   * the selected patch or edge. */
  patchLines?: { edges: Vec3[][]; selected: Vec3[][] } | null;
  /** Feature zone outlines in their colours (display only); the selected zone's outline is drawn again in the
   * highlight colour. */
  zoneLines?: {
    lines: { rgb: [number, number, number]; points: Vec3[] }[];
    selected: Vec3[][];
  } | null;
  cutEdgeIds?: readonly string[];
  pickCutEdge?: boolean;
  onCutEdgePick?: (edgeId: string) => void;
  onStroke: (samples: GuideSample[]) => void;
  onSelect: (selection: ViewerSelection | null) => void;
  onHover?: (text: string) => void;
  onReady?: (handle: ViewerHandle) => void;
  onError?: (message: string) => void;
}
