import { useMemo, useState } from 'react';
import type { KnitSettings, SurfaceSpec } from '../../core/types';
import type { KnitProgram } from '../../knit/program';
import { layerGraphJson, type FabricLayer } from '../../knit/layer-graph';
import { settingsKey } from '../../knit/keys';
import { download } from '../../adapters/export';
import { imageIndex } from '../../knit/grid';
import KnitTransitionPlanner from './KnitTransitionPlanner';
import KnitScheduleBuilder from './KnitScheduleBuilder';

interface Props {
  settings: KnitSettings;
  surface: SurfaceSpec;
  patched: boolean;
  program: KnitProgram | null;
  file: string;
  outdated: boolean;
  hover: number | null;
  onSettings: (settings: KnitSettings) => void;
  onMark: (cells: number[] | null) => void;
}
export default function KnitLayers({
  settings: s,
  surface,
  patched,
  program,
  file,
  outdated,
  hover,
  onSettings,
  onMark,
}: Props) {
  const [layer, setLayer] = useState<'both' | FabricLayer>('both');
  const enabled = s.layerModel === 'shared-reference-v1';
  const supported =
    !patched &&
    !s.patches &&
    settingsKey(s).mode === 2 &&
    (s.mode === 'shape' || s.mode === 'both') &&
    (surface.kind === 'plane' ||
      surface.kind === 'saddle' ||
      (surface.kind === 'mesh' && surface.mapping === 'rectangular-obj-uv-v1'));
  const graph = program?.layerGraph;
  const first = useMemo(() => {
    if (!graph) return -1;
    const visible = (n: (typeof graph.nodes)[number]) => layer === 'both' || n.layer === layer;
    const failed = graph.nodes.findIndex((n) => visible(n) && !n.matched);
    return failed >= 0 ? failed : graph.nodes.findIndex(visible);
  }, [graph, layer]);
  const at = (n: NonNullable<typeof graph>['nodes'][number]) =>
    program ? imageIndex(program.w, program.h, n.needle, n.pass) : -1;
  const reference =
    hover !== null ? (program?.shape?.placementAt[hover] ?? -1) : Math.floor(first / 2);
  const nodes =
    graph && reference >= 0
      ? graph.nodes
          .slice(2 * reference, 2 * reference + 2)
          .filter((n) => layer === 'both' || n.layer === layer)
      : [];
  return (
    <details className="knit-layer-panel" aria-label="Shared two-layer reference">
      <summary>Shared two-layer reference</summary>
      <p className="hint">
        One reference geometry, two logical fabric layers with distinct loop IDs and parents. A loop
        keeps its layer identity when it changes physical bed. Coordinates coincide; no thickness is
        inferred.
      </p>
      <label className="knit-layer-enable">
        <input
          type="checkbox"
          aria-label="Check shared two-layer reference"
          checked={enabled}
          disabled={!supported && !enabled}
          onChange={(e) => {
            const { layerModel: _old, ...rest } = s;
            onSettings(e.target.checked ? { ...rest, layerModel: 'shared-reference-v1' } : rest);
          }}
        />{' '}
        Check shared two-layer reference
      </label>
      {!supported && (
        <p className="knit-required-hint">
          Requires a two-guide key and Shape or Shape-and-network on an unpatched plane, saddle or
          rectangular mapped OBJ. Turn off this model to restore the previous scope.
        </p>
      )}
      {enabled && (
        <p className="hint">
          Generate explicitly to check the current sequence. Failed parent histories block BMP and
          Knit Grammar exports. Existing shaping restrictions remain active.
        </p>
      )}
      {enabled && outdated && (
        <p className="knit-required-hint">
          Previous layer result; generate the current settings before relying on these checks.
        </p>
      )}
      {enabled && graph && (
        <>
          <p
            className={graph.blockers.length ? 'knit-required-hint' : 'hint'}
            aria-label="Layer check summary"
          >
            {graph.counts.referenceLoops} reference loops · {graph.counts.logicalLoops} logical
            layer loops · {graph.counts.matched} local parent sets match · {graph.counts.failed}{' '}
            missing/mismatched targets · {graph.blockers.length} model blockers
          </p>
          <p className="hint">
            {graph.counts.transferRequests} layer-specific sideways transfer requests. No automatic
            schedule or additional passes have been inserted.
          </p>
          <label className="select-label">
            Inspect logical layer
            <select
              aria-label="Inspect logical layer"
              value={layer}
              onChange={(e) => setLayer(e.target.value as typeof layer)}
            >
              <option value="both">Both logical layers</option>
              <option value="front-layer">Front layer</option>
              <option value="back-layer">Back layer</option>
            </select>
          </label>
          {graph.findings
            .filter((f) => !f.layer || layer === 'both' || layer === f.layer)
            .map((f) => (
              <details className="diagnostic error" key={f.id}>
                <summary>
                  {f.title}
                  {f.layer ? ` · ${f.layer}` : ''} ·{' '}
                  {f.cells.length ? `${f.cells.length} cells` : 'global check'}
                </summary>
                <p>{f.text}</p>
                <button type="button" disabled={!f.cells.length} onClick={() => onMark(f.cells)}>
                  Show layer finding
                </button>
              </details>
            ))}
          {nodes.length > 0 && (
            <div className="knit-layer-history" aria-label="Inspected layer histories">
              <p className="hint">
                Point at a bitmap cell to inspect both histories; otherwise the first failed target
                or first target is shown.
              </p>
              {nodes.map((n) => (
                <div key={n.id}>
                  <h4>
                    {n.layer} · needle {n.needle + 1}, pass {n.pass + 1}
                  </h4>
                  <p>Target ID: {n.id}</p>
                  <p>Expected parents: {n.parents.join(', ') || 'none (new loop)'}</p>
                  <p>
                    Actual incoming:{' '}
                    {n.actualParents === null ? 'no stitch' : n.actualParents.join(', ') || 'none'}
                  </p>
                  <p>
                    Stitch bed: {n.bed} ·{' '}
                    {n.matched ? 'local parents match' : 'missing or different parents'}
                  </p>
                  <button type="button" onClick={() => onMark([at(n)])}>
                    Show inspected loop
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              download(
                layerGraphJson(graph, program!.w, program!.h, program!.exportBlockers),
                `${file}-layers.json`,
                'application/json'
              )
            }
          >
            Layer graph JSON
          </button>
        </>
      )}
      <p className="hint">
        The separate transfer-phase checker tests explicit candidates on a declared logical grid:
        whole stacks, one racking per phase, ordered phase arrivals and no source/destination
        interference. The bounded planner below can search one selected transition; no phases are
        applied. A matching graph is not proof of native feasibility, knittability or achieved
        shape.
      </p>
      {enabled && (
        <KnitTransitionPlanner
          program={program}
          surface={surface}
          outdated={outdated}
          file={file}
          onMark={onMark}
        />
      )}
      {enabled && (
        <KnitScheduleBuilder
          program={program}
          surface={surface}
          outdated={outdated}
          file={file}
          onMark={onMark}
        />
      )}
    </details>
  );
}
