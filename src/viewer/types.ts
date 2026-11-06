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
  onStroke: (samples: GuideSample[]) => void;
  onSelect: (selection: ViewerSelection | null) => void;
  onHover?: (text: string) => void;
  onReady?: (handle: ViewerHandle) => void;
  onError?: (message: string) => void;
}
