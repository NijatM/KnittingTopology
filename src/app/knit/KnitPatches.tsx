// Computational patches (Popescu 2019, §6.3.2, pp. 107–110): split lines, patch choice, knitted-through
// edges and seams, pieces.
import { useState } from 'react';
import type { SurfaceSpec } from '../../core/types';
import { download } from '../../adapters/export';
import {
  MAX_SPLITS,
  PATCH_PAIRING_RULE,
  knittedThrough,
  patchLabel,
  patchPieces,
  patchWindow,
  pieceLabel,
  seamMapJson,
  sharedEdges,
  type PatchBuild,
  type PatchSide,
  type SeamSide,
  type SplitAxis,
} from '../../knit/patches';
import { PATCH_TOOL_TEXT, type PatchLayoutState, type PatchTool } from './patch-layout';

interface Props {
  state: PatchLayoutState;
  /** Every piece and seam of the accepted build. */
  build?: Omit<PatchBuild, 'piece'>;
  surface: SurfaceSpec;
  file: string;
  outdated: boolean;
}

const SIDE_TEXT: Record<PatchSide, string> = {
  start: 'first course',
  end: 'last course',
  'needle-1': 'needle-1 side',
  far: 'far side',
};
const range = ([a, b]: [number, number]) => `${a}–${b}`;
const sideText = (s: SeamSide) =>
  `${patchLabel(s.patch)} ${SIDE_TEXT[s.side]}: ${
    s.elements
      ? `${s.elements.length} ${s.side === 'start' || s.side === 'end' ? 'loops' : 'course ends'}`
      : 'not built'
  }`;

function SplitList({ axis, state }: { axis: SplitAxis; state: PatchLayoutState }) {
  const values = state.layout?.[axis] ?? [];
  const [draft, setDraft] = useState('');
  return (
    <div aria-label={`${axis} split lines`}>
      <ul className="knit-splits">
        {values.map((value, i) => {
          const commit = (text: string) => {
            if (text.trim() !== '' && Number(text) !== value) state.move(axis, i, Number(text));
          };
          return (
            <li key={`${i}:${value}`}>
              <label>
                {axis} split {i + 1}
                <input
                  type="number"
                  aria-label={`${axis} split ${i + 1}`}
                  step={0.01}
                  min={0}
                  max={1}
                  defaultValue={value}
                  onBlur={(e) => commit(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(e.currentTarget.value);
                  }}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove ${axis} split ${i + 1}`}
                onClick={() => state.remove(axis, i)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      <div className="inline-actions">
        <input
          type="number"
          aria-label={`New ${axis} split`}
          placeholder={`${axis} in (0, 1)`}
          step={0.01}
          min={0}
          max={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          disabled={draft.trim() === '' || values.length >= MAX_SPLITS}
          onClick={() => {
            if (state.add(axis, Number(draft))) setDraft('');
          }}
        >
          Add {axis} split
        </button>
      </div>
    </div>
  );
}

function EdgeList({ state }: { state: PatchLayoutState }) {
  const layout = state.layout!;
  const edges = sharedEdges(layout);
  return (
    <ul className="knit-splits knit-edges" aria-label="Shared edges">
      {edges.map((e) => {
        const through = knittedThrough(layout, e.id);
        return (
          <li key={e.id} className={state.edge === e.id ? 'selected' : undefined}>
            <label>
              <input
                type="checkbox"
                aria-label={`Knit edge ${e.id} through`}
                checked={through}
                onChange={() => {
                  if (state.toggle(e.id)) state.selectEdge(e.id);
                }}
              />
              {e.id} · {patchLabel(e.a)} | {patchLabel(e.b)} ·{' '}
              {through ? 'knitted through' : 'seam'}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

export default function KnitPatches({ state, build, surface, file, outdated }: Props) {
  const layout = state.layout;
  if (!state.available && !layout) return null;
  const seam = state.edge ? build?.seams.find((s) => s.id === state.edge) : undefined;
  const groups = layout ? patchPieces(layout) : [];
  const group = groups.find((g) => g.includes(state.patch)) ?? [state.patch];
  const edge =
    layout && state.edge ? sharedEdges(layout).find((e) => e.id === state.edge) : undefined;
  const edgeGroup = edge ? groups.find((g) => g.includes(edge.a)) : undefined;
  return (
    <section aria-label="Computational patches">
      <h3 className="knit-heading">Computational patches</h3>
      <p className="hint">
        Split the chart by hand into patches with their own knitting direction, loop size and course
        method (Popescu 2019, §6.3.2). Split lines run across the whole chart at constant u or v
        (project restriction). Each shared edge is knitted through or a seam; new edges start
        knitted through. Patches linked by knitted-through edges form one piece with one bitmap. The
        thesis gives no algorithm for combining patches, so the join is a project construction.
      </p>
      {!state.available && (
        <p className="hint warn">
          Computational patches apply to shape mode on open surfaces (plane, saddle, rectangular OBJ
          chart). Remove the splits or choose shape mode.
        </p>
      )}
      {state.available && (
        <div className="inline-actions">
          <button type="button" aria-pressed={state.on} onClick={() => state.setOn(!state.on)}>
            Lay out patches on the surface
          </button>
          {state.active && (
            <label className="select-label">
              Patch tool
              <select
                aria-label="Patch tool"
                value={state.tool}
                onChange={(e) => state.setTool(e.target.value as PatchTool)}
              >
                {(Object.keys(PATCH_TOOL_TEXT) as PatchTool[]).map((t) => (
                  <option key={t} value={t}>
                    {PATCH_TOOL_TEXT[t][0]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      {state.active && (
        <p className="hint">
          {PATCH_TOOL_TEXT[state.tool][1]} Orbit is off while the patch tool is on. Each change is
          one Undo step; a patch whose rectangle changes loses its saved stages.
        </p>
      )}
      <SplitList axis="u" state={state} />
      <SplitList axis="v" state={state} />
      {state.error && (
        <p className="knit-error" role="alert">
          {state.error}
        </p>
      )}
      {layout && (
        <>
          <label className="select-label">
            Patch
            <select
              aria-label="Patch"
              value={state.patch}
              onChange={(e) => state.select(Number(e.target.value))}
            >
              {layout.patches.map((p, i) => {
                const w = patchWindow(layout, i);
                return (
                  <option key={i} value={i}>
                    {patchLabel(i)} · u {range(w.u)} · v {range(w.v)} · start {p.startEdge} ·{' '}
                    {p.fill}
                  </option>
                );
              })}
            </select>
          </label>
          <p className="hint">
            The knit controls and the knit graph stages show patch {patchLabel(state.patch)} of{' '}
            {layout.patches.length}; the program preview and the exports show its piece,{' '}
            {pieceLabel(group)}. Patches are numbered row by row from the chart corner u = 0, v = 0.
            Patches in one piece must share a start edge.
          </p>
          <EdgeList state={state} />
          {build && (
            <ul className="hint" aria-label="Patch pieces">
              {build.pieces.map((p) => {
                const stops = p.build.ok ? (p.build.program.shape?.stops ?? []) : [];
                return (
                  <li key={p.index} className={p.build.ok ? undefined : 'warn'}>
                    {p.label}:{' '}
                    {p.build.ok
                      ? `${p.build.program.w} needles × ${p.build.program.h} passes${
                          p.build.program.exportBlockers.length
                            ? ` · ${p.build.program.exportBlockers.length} export blockers`
                            : ''
                        }`
                      : p.build.reason}
                    {stops.map((t) => (
                      <span key={`${t.patch}${t.from}`} className="knit-stop">
                        {' '}
                        · {t.patch.slice(0, -1)} stops after pass {t.pass}, needles {t.from + 1}–
                        {t.to + 1}: cast off in the lab software
                        {t.reused ? ' (a later pass knits there)' : ', or hold the loops'}
                      </span>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
          {edge && knittedThrough(layout, edge.id) && (
            <div aria-label="Selected edge" className="hint">
              <p>
                Edge {edge.id} is knitted through: {patchLabel(edge.a)} and {patchLabel(edge.b)} are
                knitted in one piece, {pieceLabel(edgeGroup ?? [edge.a, edge.b])}.
              </p>
            </div>
          )}
          {edge && !knittedThrough(layout, edge.id) && (
            <div aria-label="Selected edge" className="hint">
              {seam && !outdated ? (
                <>
                  <p>
                    Seam {seam.id}: chart {seam.axis} = {seam.value},{' '}
                    {seam.axis === 'u' ? 'v' : 'u'} {range(seam.range)} ·{' '}
                    {(seam.length * 1000).toFixed(1)} mm along the surface.
                  </p>
                  <p>
                    {sideText(seam.sides[0])}; {sideText(seam.sides[1])}. {seam.pairs.length} pairs;
                    without a partner: {seam.unpaired[0].length} and {seam.unpaired[1].length}.
                  </p>
                </>
              ) : (
                <p>Seam {state.edge}: generate the knit program to see its sides.</p>
              )}
            </div>
          )}
          <p className="hint">
            Seam map pairing: {PATCH_PAIRING_RULE} Count and length differences are reported, not
            blocking.
          </p>
          <div className="inline-actions">
            <button
              type="button"
              disabled={!build || outdated}
              onClick={() =>
                download(
                  seamMapJson(surface, layout, build!.seams),
                  `${file}-seam-map.json`,
                  'application/json'
                )
              }
            >
              Seam map JSON
            </button>
          </div>
        </>
      )}
    </section>
  );
}
