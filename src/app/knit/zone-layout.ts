// Feature zones on the surface (Popescu 2019, §6.3.2, p. 112): strokes and regions are drawn point by point on
// the surface; the selected zone's points can be dragged. Each finished change is committed as settings (one
// undo step each). Zones are intent only and change no operation.
import { useMemo, useState } from 'react';
import type { KnitSettings, KnitZone, SurfaceSpec, Vec2 } from '../../core/types';
import { evaluateSurface } from '../../core/surfaces';
import { knitSupported } from '../../knit/mapping';
import { settingsKey } from '../../knit/keys';
import {
  MAX_ZONES,
  MAX_ZONE_POINTS,
  nextZoneColour,
  nextZoneId,
  zoneShapeProblem,
  zoneSurfacePath,
} from '../../knit/zones';
import type { GraphEditHandles, GraphEditIntent } from '../../viewer/types';

export type ZoneTool = 'stroke' | 'region' | 'select';
export const ZONE_TOOL_TEXT: Record<ZoneTool, [label: string, hint: string]> = {
  stroke: [
    'Draw stroke',
    'Click points along the stroke on the surface, then Finish zone. Drag a point of the selected zone to move it.',
  ],
  region: [
    'Draw region',
    'Click the corners of the region on the surface, then Finish zone; the outline closes itself. Drag a point of the selected zone to move it.',
  ],
  select: ['Select zone', 'Click a zone outline to choose it; drag one of its points to move it.'],
};
/** Width of a new stroke (project default; edit it per zone). */
export const DEFAULT_ZONE_WIDTH = 0.01;

/** Feature zone state for the panel, the viewer and the bitmap preview. */
export function useZoneLayout(
  surface: SurfaceSpec,
  settings: KnitSettings,
  onSettings: (next: KnitSettings, coalesceKey?: string) => void
) {
  const [on, setOn] = useState(false);
  const [tool, setTool] = useState<ZoneTool>('stroke');
  const [draft, setDraft] = useState<Vec2[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const zones = useMemo(() => settings.zones ?? [], [settings.zones]);
  const available = knitSupported(surface);
  const active = on && available;
  const shown = zones.some((z) => z.id === selected) ? selected : null;
  const paths = useMemo(
    () => (available ? zones.map((z) => zoneSurfacePath(surface, z.shape)) : []),
    [available, surface, zones]
  );
  const handles = useMemo((): GraphEditHandles | null => {
    if (!active) return null;
    const zone = zones.find((z) => z.id === shown);
    return {
      points: zone
        ? zone.shape.points.map((uv, i) => ({
            id: `z:${zone.id}:${i}`,
            position: evaluateSurface(surface, 0, uv[0], uv[1]),
          }))
        : [],
      segments: zones.flatMap((z, k) =>
        paths[k]!.slice(1).map((b, i) => ({ id: `zone:${z.id}`, a: paths[k]![i]!, b }))
      ),
      draft: draft.map((uv) => evaluateSurface(surface, 0, uv[0], uv[1])),
    };
  }, [active, zones, shown, surface, paths, draft]);
  const lines = useMemo(
    () =>
      available && zones.length
        ? {
            lines: zones.map((z, k) => ({ rgb: z.rgb, points: paths[k]! })),
            selected: zones.flatMap((z, k) => (z.id === shown ? [paths[k]!] : [])),
          }
        : null,
    [available, zones, paths, shown]
  );
  const commit = (next: KnitZone[], coalesceKey?: string) => {
    const { zones: _old, ...rest } = settings;
    onSettings(next.length ? { ...rest, zones: next } : rest, coalesceKey);
    setError('');
  };
  /** Change one zone; `coalesceKey` merges repeated changes (a colour being picked) into one undo step. */
  const update = (id: string, change: (z: KnitZone) => KnitZone, coalesceKey?: string) => {
    const next = zones.map((z) => (z.id === id ? change(z) : z));
    const zone = next.find((z) => z.id === id);
    const problem = zone && zoneShapeProblem(zone.shape);
    if (problem) {
      setError(problem);
      return false;
    }
    commit(next, coalesceKey);
    return true;
  };
  return {
    available,
    active,
    on,
    setOn: (next: boolean) => {
      setOn(next);
      setDraft([]);
      setError('');
    },
    tool,
    setTool: (next: ZoneTool) => {
      setTool(next);
      setDraft([]);
      setError('');
    },
    zones,
    selected: shown,
    select: (id: string | null) => setSelected(id),
    draft,
    error,
    handles,
    lines,
    /** Finish the drawn stroke or region as a new zone. */
    finish: () => {
      if (tool === 'select') return;
      if (zones.length >= MAX_ZONES) return setError(`At most ${MAX_ZONES} zones.`);
      const shape: KnitZone['shape'] =
        tool === 'stroke'
          ? { kind: 'stroke', points: draft, width: DEFAULT_ZONE_WIDTH }
          : { kind: 'region', points: draft };
      const problem = zoneShapeProblem(shape);
      if (problem) return setError(problem);
      const id = nextZoneId(zones);
      commit([
        ...zones,
        {
          id,
          name: '',
          kind: tool === 'stroke' ? 'channel' : 'pocket',
          rgb: nextZoneColour(zones, settingsKey(settings)),
          shape,
        },
      ]);
      setDraft([]);
      setSelected(id);
    },
    undoPoint: () => setDraft((d) => d.slice(0, -1)),
    cancel: () => {
      setDraft([]);
      setError('');
    },
    update,
    remove: (id: string) => commit(zones.filter((z) => z.id !== id)),
    /** Move a zone one place up (-1) or down (+1) in the list; the lower zone is drawn on top. */
    reorder: (id: string, step: -1 | 1) => {
      const i = zones.findIndex((z) => z.id === id),
        j = i + step;
      if (i < 0 || j < 0 || j >= zones.length) return;
      const next = [...zones];
      [next[i], next[j]] = [next[j]!, next[i]!];
      commit(next);
    },
    onIntent: (intent: GraphEditIntent) => {
      const point = intent.point?.startsWith('z:') ? intent.point.split(':') : null;
      if (intent.drop) {
        // Dragging a point of the selected zone moves it; other drags do nothing.
        if (!point) return;
        if (!intent.drop.uv) return setError('Drop the point on the surface.');
        const uv = intent.drop.uv,
          index = Number(point[2]);
        update(point[1]!, (z) => ({
          ...z,
          shape: { ...z.shape, points: z.shape.points.map((p, i) => (i === index ? uv : p)) },
        }));
        return;
      }
      if (tool === 'select') {
        const id = intent.segment?.startsWith('zone:')
          ? intent.segment.slice(5)
          : point
            ? point[1]!
            : null;
        if (id) setSelected(id);
        else setError('Click a zone outline.');
        return;
      }
      if (!intent.uv) return setError('Click on the surface.');
      if (draft.length >= MAX_ZONE_POINTS)
        return setError(`A zone has at most ${MAX_ZONE_POINTS} points.`);
      setDraft([...draft, intent.uv]);
      setError('');
    },
  };
}
export type ZoneLayoutState = ReturnType<typeof useZoneLayout>;
