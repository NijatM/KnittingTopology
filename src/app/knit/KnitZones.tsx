// Feature zones (Popescu 2019, §6.3.2, p. 112; §6.4.1, pp. 113–114): the zone list, the drawing tools and the
// zone exports. Zones are intent only: they change no operation.
import type { KnitZoneKind, SurfaceSpec } from '../../core/types';
import { download } from '../../adapters/export';
import type { KnitProgram } from '../../knit/program';
import {
  ZONE_KINDS,
  markedBmp,
  markedProblems,
  zoneMapJson,
  zoneRuns,
  type ZoneMarks,
} from '../../knit/zones';
import { ZONE_TOOL_TEXT, type ZoneLayoutState, type ZoneTool } from './zone-layout';

interface Props {
  state: ZoneLayoutState;
  program: KnitProgram | null;
  marks: ZoneMarks | null;
  surface: SurfaceSpec;
  file: string;
  /** Label of the piece shown, with patches. */
  piece: string | null;
  outdated: boolean;
}

const hexOf = (rgb: readonly number[]) =>
  `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
const rgbOf = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

export default function KnitZones({
  state,
  program,
  marks,
  surface,
  file,
  piece,
  outdated,
}: Props) {
  const { zones } = state;
  if (!state.available && !zones.length) return null;
  const problems = program ? markedProblems(zones, program.key) : [];
  const exportable = !!program && !!marks && !outdated && zones.length > 0;
  return (
    <section aria-label="Feature zones">
      <h3 className="knit-heading">Feature zones</h3>
      <p className="hint">
        Mark where features go, as in the thesis (Popescu 2019, §6.3.2, p. 112): channels, openings,
        pockets, inlays or inserts, material regions and colour patterns. Zones alone change no
        operation. Optional channel/pocket recipes are assigned separately below. Other features can
        be filled in the lab software using the zone map and the marked BMP (§6.4.1, Fig. 6.19). A
        region marks the loops inside it; a stroke marks the loops within half its width of its path
        on the surface (project rule).
      </p>
      {!state.available && (
        <p className="hint warn">
          Feature zones apply to open surfaces (plane, saddle, rectangular OBJ chart).
        </p>
      )}
      {state.available && (
        <div className="inline-actions">
          <button type="button" aria-pressed={state.on} onClick={() => state.setOn(!state.on)}>
            Draw zones on the surface
          </button>
          {state.active && (
            <label className="select-label">
              Zone tool
              <select
                aria-label="Zone tool"
                value={state.tool}
                onChange={(e) => state.setTool(e.target.value as ZoneTool)}
              >
                {(Object.keys(ZONE_TOOL_TEXT) as ZoneTool[]).map((t) => (
                  <option key={t} value={t}>
                    {ZONE_TOOL_TEXT[t][0]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {state.active && (
        <p className="hint">
          {ZONE_TOOL_TEXT[state.tool][1]} Orbit is off while the zone tool is on. Each change is one
          Undo step.
        </p>
      )}
      {state.active && state.tool !== 'select' && (
        <div className="inline-actions" aria-label="Zone being drawn">
          <span className="hint">
            {state.draft.length} {state.draft.length === 1 ? 'point' : 'points'}
          </span>
          <button type="button" onClick={state.finish}>
            Finish zone
          </button>
          <button type="button" disabled={!state.draft.length} onClick={state.undoPoint}>
            Undo point
          </button>
          <button type="button" disabled={!state.draft.length} onClick={state.cancel}>
            Cancel
          </button>
        </div>
      )}
      {state.error && (
        <p className="knit-error" role="alert">
          {state.error}
        </p>
      )}
      {zones.length > 0 && (
        <ul className="knit-zones" aria-label="Zones">
          {zones.map((z, i) => {
            const n = marks?.cells[i]?.length,
              runs = marks && z.shape.kind === 'stroke' ? zoneRuns(marks, i) : null;
            return (
              <li key={z.id} className={state.selected === z.id ? 'selected' : undefined}>
                <div className="inline-actions">
                  <button
                    type="button"
                    aria-pressed={state.selected === z.id}
                    onClick={() => state.select(state.selected === z.id ? null : z.id)}
                  >
                    {z.id}
                  </button>
                  <input
                    type="color"
                    aria-label={`Zone ${z.id} colour`}
                    value={hexOf(z.rgb)}
                    onChange={(e) =>
                      state.update(
                        z.id,
                        (x) => ({ ...x, rgb: rgbOf(e.target.value) }),
                        `zone-colour:${z.id}`
                      )
                    }
                  />
                  <input
                    type="text"
                    aria-label={`Zone ${z.id} name`}
                    placeholder="name"
                    maxLength={80}
                    defaultValue={z.name}
                    key={`${z.id}:${z.name}`}
                    onBlur={(e) => {
                      if (e.target.value !== z.name)
                        state.update(z.id, (x) => ({ ...x, name: e.target.value }));
                    }}
                  />
                  <select
                    aria-label={`Zone ${z.id} kind`}
                    value={z.kind}
                    onChange={(e) =>
                      state.update(z.id, (x) => ({ ...x, kind: e.target.value as KnitZoneKind }))
                    }
                  >
                    {(Object.keys(ZONE_KINDS) as KnitZoneKind[]).map((k) => (
                      <option key={k} value={k}>
                        {ZONE_KINDS[k]}
                      </option>
                    ))}
                  </select>
                  {z.shape.kind === 'stroke' && (
                    <label className="select-label">
                      Width (mm)
                      <input
                        type="number"
                        aria-label={`Zone ${z.id} width (mm)`}
                        min={0.1}
                        max={1000}
                        step={0.5}
                        defaultValue={+(z.shape.width * 1000).toFixed(2)}
                        key={`${z.id}:${z.shape.width}`}
                        onBlur={(e) => {
                          const width = Number(e.target.value) / 1000;
                          if (z.shape.kind === 'stroke' && width !== z.shape.width)
                            state.update(z.id, (x) => ({ ...x, shape: { ...z.shape, width } }));
                        }}
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    aria-label={`Move zone ${z.id} up`}
                    disabled={i === 0}
                    onClick={() => state.reorder(z.id, -1)}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    aria-label={`Move zone ${z.id} down`}
                    disabled={i === zones.length - 1}
                    onClick={() => state.reorder(z.id, 1)}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete zone ${z.id}`}
                    onClick={() => state.remove(z.id)}
                  >
                    Delete
                  </button>
                </div>
                <p className="hint">
                  {z.shape.kind === 'stroke'
                    ? `Stroke of ${z.shape.points.length} points`
                    : `Region of ${z.shape.points.length} points`}
                  {n === undefined
                    ? ' · generate the knit program to see its loops'
                    : n
                      ? ` · ${n} loops${
                          runs
                            ? ` · about ${runs.needles} needles across where it crosses a pass, ${runs.passes} passes across where it crosses a needle`
                            : ''
                        }`
                      : ' · no loops in this bitmap'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {marks && marks.overlaps > 0 && (
        <p className="hint">
          {marks.overlaps} cells lie in more than one zone; the zone lower in the list is drawn on
          top.
        </p>
      )}
      {problems.length > 0 && (
        <ul className="hint warn" aria-label="Marked bitmap problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {zones.length > 0 && (
        <>
          <p className="hint">
            The marked BMP is the operation bitmap with each zone&apos;s cells in the zone&apos;s
            colour. It is not a Knit Grammar program: a zone colour marks a feature, not an
            operation.
            {piece ? ` Both files show the piece ${piece}.` : ''}
          </p>
          <div className="inline-actions">
            <button
              type="button"
              disabled={!exportable}
              onClick={() =>
                download(
                  zoneMapJson(surface, zones, marks!, piece),
                  `${file}-zone-map.json`,
                  'application/json'
                )
              }
            >
              Zone map JSON
            </button>
            <button
              type="button"
              disabled={!exportable || problems.length > 0 || program!.exportBlockers.length > 0}
              onClick={() =>
                download(
                  markedBmp(program!, zones, marks!).slice().buffer,
                  `${file}-zones.bmp`,
                  'image/bmp'
                )
              }
            >
              Marked BMP
            </button>
          </div>
          {exportable && program!.exportBlockers.length > 0 && (
            <p className="hint warn">
              The marked BMP is blocked with the operation exports; the zone map is available.
            </p>
          )}
        </>
      )}
    </section>
  );
}
