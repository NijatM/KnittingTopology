// Computational patch layout on the surface (Popescu 2019, §6.3.2, pp. 109–110): split lines at constant
// chart u or v, patch selection and seams. The viewer reports clicks and drags; this module turns them
// into layout changes, which are committed as settings (one undo step each).
import { useMemo, useState } from 'react';
import type { KnitPatchLayout, KnitSettings, SurfaceSpec, Vec2, Vec3 } from '../../core/types';
import { evaluateSurface } from '../../core/surfaces';
import { knitSupported } from '../../knit/mapping';
import {
  addSplit,
  edgePath,
  moveSplit,
  patchAt,
  patchCount,
  patchWindow,
  removeSplit,
  sharedEdges,
  type SplitAxis,
} from '../../knit/patches';
import type { GraphEditHandles, GraphEditIntent } from '../../viewer/types';

export type PatchTool = 'split-u' | 'split-v' | 'select';
export const PATCH_TOOL_TEXT: Record<PatchTool, [label: string, hint: string]> = {
  'split-u': [
    'Split along u',
    'Click the surface to add a split line at constant u through that point. Drag a split line to move it.',
  ],
  'split-v': [
    'Split along v',
    'Click the surface to add a split line at constant v through that point. Drag a split line to move it.',
  ],
  select: ['Select patch or seam', 'Click a patch to choose it, or a split line to see its seam.'],
};
/** Clicked split values are rounded to this chart step (project display choice); typed values are exact. */
const CLICK_STEP = 0.001;
const at = (surface: SurfaceSpec, uv: Vec2): Vec3 => evaluateSurface(surface, 0, uv[0], uv[1]);
/** Split index and axis of a shared-edge ID such as `u2:1` (second u split, first row). */
export function edgeSplit(id: string): { axis: SplitAxis; index: number } | null {
  const m = /^([uv])(\d+):\d+$/.exec(id);
  return m ? { axis: m[1] as SplitAxis, index: Number(m[2]) - 1 } : null;
}
function samples(surface: SurfaceSpec, path: Vec2[]) {
  return path.map((uv) => at(surface, uv));
}
/** Viewer handles: each shared edge as short segments that follow the surface, ID `e:<edge>`. */
export function patchHandles(surface: SurfaceSpec, layout: KnitPatchLayout | undefined) {
  const handles: GraphEditHandles = { points: [], segments: [] };
  for (const edge of layout ? sharedEdges(layout) : []) {
    const p = samples(surface, edgePath(edge, 16));
    for (let i = 1; i < p.length; i++)
      handles.segments.push({ id: `e:${edge.id}`, a: p[i - 1]!, b: p[i]! });
  }
  return handles;
}
/** Display lines: every seam drawn double, and the selected patch or seam highlighted. */
export function patchLines(
  surface: SurfaceSpec,
  layout: KnitPatchLayout | undefined,
  patch: number,
  edge: string | null
): { seams: Vec3[][]; selected: Vec3[][] } | null {
  if (!layout) return null;
  const seams: Vec3[][] = [],
    selected: Vec3[][] = [],
    gap = 0.003;
  for (const e of sharedEdges(layout)) {
    for (const offset of [-gap, gap])
      seams.push(samples(surface, edgePath({ ...e, value: e.value + offset })));
    if (e.id === edge) selected.push(samples(surface, edgePath(e)));
  }
  if (edge === null) {
    // The selected patch's outline, just inside its rectangle.
    const w = patchWindow(layout, patch),
      u: [number, number] = [w.u[0] + 2 * gap, w.u[1] - 2 * gap],
      v: [number, number] = [w.v[0] + 2 * gap, w.v[1] - 2 * gap];
    selected.push(
      ...[
        { axis: 'v' as const, value: v[0], range: u },
        { axis: 'u' as const, value: u[1], range: v },
        { axis: 'v' as const, value: v[1], range: u },
        { axis: 'u' as const, value: u[0], range: v },
      ].map((side) => samples(surface, edgePath(side)))
    );
  }
  return { seams, selected };
}

/** Patch layout state for the panel and the viewer. */
export function usePatchLayout(
  surface: SurfaceSpec,
  settings: KnitSettings,
  onSettings: (next: KnitSettings) => void
) {
  const [on, setOn] = useState(false);
  const [tool, setTool] = useState<PatchTool>('split-u');
  const [selected, setSelected] = useState(0);
  const [edge, setEdge] = useState<string | null>(null);
  const [error, setError] = useState('');
  const layout = settings.patches;
  const available = settings.mode === 'shape' && knitSupported(surface);
  const patch = layout ? Math.min(selected, patchCount(layout) - 1) : 0;
  const shownEdge = layout && edge && sharedEdges(layout).some((e) => e.id === edge) ? edge : null;
  const active = on && available;
  const handles = useMemo(
    () => (active ? patchHandles(surface, layout) : null),
    [active, surface, layout]
  );
  const lines = useMemo(
    () => (available ? patchLines(surface, layout, patch, shownEdge) : null),
    [available, surface, layout, patch, shownEdge]
  );
  const change = (make: () => KnitSettings) => {
    try {
      onSettings(make());
      setError('');
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    }
  };
  const round = (x: number) => Number((Math.round(x / CLICK_STEP) * CLICK_STEP).toFixed(3));
  return {
    available,
    active,
    on,
    setOn: (next: boolean) => {
      setOn(next);
      setError('');
    },
    tool,
    setTool: (next: PatchTool) => {
      setTool(next);
      setError('');
    },
    layout,
    patch,
    edge: shownEdge,
    select: (index: number) => {
      setSelected(index);
      setEdge(null);
    },
    selectEdge: setEdge,
    error,
    handles,
    lines,
    add: (axis: SplitAxis, value: number) => change(() => addSplit(settings, axis, value)),
    move: (axis: SplitAxis, index: number, value: number) =>
      change(() => moveSplit(settings, axis, index, value)),
    remove: (axis: SplitAxis, index: number) => {
      if (change(() => removeSplit(settings, axis, index))) setEdge(null);
    },
    onIntent: (intent: GraphEditIntent) => {
      const split = intent.segment?.startsWith('e:') ? edgeSplit(intent.segment.slice(2)) : null;
      if (intent.drop) {
        // Dragging a split line moves it; other drags do nothing.
        if (!split) return;
        if (!intent.drop.uv) return setError('Drop the split line on the surface.');
        const value = round(intent.drop.uv[split.axis === 'u' ? 0 : 1]);
        change(() => moveSplit(settings, split.axis, split.index, value));
        return;
      }
      if (tool === 'select') {
        if (intent.segment?.startsWith('e:')) setEdge(intent.segment.slice(2));
        else if (intent.uv && layout) {
          setSelected(patchAt(layout, intent.uv));
          setEdge(null);
        }
        return;
      }
      if (!intent.uv) return;
      const axis: SplitAxis = tool === 'split-u' ? 'u' : 'v';
      change(() => addSplit(settings, axis, round(intent.uv![axis === 'u' ? 0 : 1])));
    },
  };
}
export type PatchLayoutState = ReturnType<typeof usePatchLayout>;
