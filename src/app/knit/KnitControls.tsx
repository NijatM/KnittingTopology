// Sidebar section 04: how the accepted network becomes a knit program. Only what works is offered.
import type { KnitCellRule, KnitSettings, KnitTile } from '../../core/types';
import { keyById, BASIC } from '../../knit/keys';
import { structuresForKey } from '../../knit/structures';
import { MAX_SIDE } from '../../knit/grid';
import { MAX_LINE_LOOPS, SIDE_CLASSES } from '../../knit/settings';

interface Props {
  settings: KnitSettings;
  open: boolean;
  status: string;
  onChange: (next: KnitSettings, coalesceKey?: string) => void;
  onToggleOpen: () => void;
  shapeJob?: { progress: string | null; error: string; generate: () => void; cancel: () => void };
  pickingEdge: boolean;
  onToggleEdgePicking: () => void;
  /** Closed surface opened by a validated cut: measured layout only. */
  closed?: 'cube' | 'sphere';
}

const RULES: { kind: KnitCellRule['kind']; name: string }[] = [
  { kind: 'uniform', name: 'Same for all cells' },
  { kind: 'sides', name: 'By side count' },
  { kind: 'alternating', name: 'Alternating neighbours' },
  { kind: 'coarse', name: 'By coarse cell' },
];

function StructureSelect({
  label,
  value,
  onChange,
  none,
  tiles,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  none?: string;
  tiles?: KnitTile[];
}) {
  const options = structuresForKey(BASIC, tiles);
  return (
    <label className="select-label">
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {none && <option value="">{none}</option>}
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}

function ruleFor(kind: KnitCellRule['kind'], fill: string): KnitCellRule {
  const second = fill === 'reverse' ? 'jersey' : 'reverse';
  if (kind === 'sides') return { kind, bySides: {} };
  if (kind === 'alternating') return { kind, palette: [fill, second] };
  if (kind === 'coarse') return { kind, palette: [fill, second, 'seed'] };
  return { kind };
}

export default function KnitControls({
  settings: s,
  open,
  status,
  onChange,
  onToggleOpen,
  pickingEdge,
  onToggleEdgePicking,
  shapeJob,
  closed,
}: Props) {
  const key = keyById(s.keyId) ?? BASIC;
  const rule = s.cells.rule;
  const set = (change: Partial<KnitSettings>, coalesceKey?: string) =>
    onChange({ ...s, ...change }, coalesceKey);
  const setRule = (next: KnitCellRule) => set({ cells: { ...s.cells, rule: next } });
  const setPalette = (i: number, id: string | null) => {
    if (rule.kind !== 'alternating' && rule.kind !== 'coarse') return;
    const palette = [...rule.palette];
    palette[i] = id ?? s.cells.fill;
    setRule({ ...rule, palette });
  };
  return (
    <section className="control-section knit-controls">
      <h2>
        <span>{closed ? '05' : '04'}</span> Knit program <i />
      </h2>
      <p className="hint">
        {s.mode === 'shape'
          ? 'Shape mode'
          : s.mode === 'both'
            ? 'Shape and network'
            : 'Network mode'}{' '}
        · {key.name} · one pixel = one needle in one pass, bottom row = pass 1.
      </p>
      <button
        type="button"
        className={`check ${open ? 'checked' : ''}`}
        aria-pressed={open}
        onClick={onToggleOpen}
      >
        <span aria-hidden="true">[{open ? '×' : ' '}]</span>
        Show program beside the surface
      </button>
      <p className="knit-status" role="status">
        {status}
      </p>

      <label className="select-label">
        Mode
        <select
          aria-label="Knit mode"
          value={s.mode}
          onChange={(e) =>
            set({
              mode: e.target.value as KnitSettings['mode'],
              ...(e.target.value !== 'network' || closed ? { size: { source: 'gauge' } } : {}),
            })
          }
        >
          <option value="network">Network only</option>
          <option value="shape">Shape only</option>
          <option value="both">Shape and network</option>
        </select>
      </label>
      <>
        <label className="select-label">
          Start edge (pass 1)
          <select
            aria-label="Start edge"
            value={s.startEdge ?? 'v0'}
            onChange={(e) => set({ startEdge: e.target.value as KnitSettings['startEdge'] })}
          >
            {closed === 'sphere' ? (
              <>
                <option value="v0">Needle 1 at the bottom pole (default)</option>
                <option value="v1">Needle 1 at the top pole</option>
                {(s.startEdge === 'u0' || s.startEdge === 'u1') && (
                  <option value={s.startEdge}>{s.startEdge} (not used on a sphere)</option>
                )}
              </>
            ) : (
              <>
                <option value="v0">{closed ? 'Net bottom (default)' : 'v = 0 (default)'}</option>
                <option value="u1">{closed ? 'Net right side' : 'u = 1'}</option>
                <option value="v1">{closed ? 'Net top' : 'v = 1'}</option>
                <option value="u0">{closed ? 'Net left side' : 'u = 0'}</option>
              </>
            )}
          </select>
        </label>
        {!closed && (
          <button type="button" aria-pressed={pickingEdge} onClick={onToggleEdgePicking}>
            {pickingEdge ? 'Cancel start edge picking' : 'Pick start edge on surface'}
          </button>
        )}
        <p className="hint">
          {closed === 'sphere'
            ? 'Courses run from pole to pole, starting at the validated cut. Each needle knits one circle of latitude, and short rows are spread evenly. Sizes come from your measurements.'
            : closed
              ? 'The validated cut is unfolded into a flat net; the chosen side of the net is knitted first. Sizes come from your measurements.'
              : 'Measured layouts use the fill gauge with a flagged jersey fallback. Typed network layouts are unmeasured. Click near a chart boundary when picking.'}
        </p>
      </>
      {shapeJob && (
        <div className="knit-shape-job">
          <button type="button" disabled={!!shapeJob.progress} onClick={shapeJob.generate}>
            {s.mode === 'shape' ? 'Generate shape' : 'Generate knit program'}
          </button>
          {shapeJob.progress && (
            <>
              <p role="status">{shapeJob.progress}</p>
              <button type="button" onClick={shapeJob.cancel}>
                {s.mode === 'shape' ? 'Cancel shape generation' : 'Cancel knit program generation'}
              </button>
            </>
          )}
          {shapeJob.error && <p role="alert">{shapeJob.error}</p>}
        </div>
      )}
      <label className="select-label">
        Size
        <select
          aria-label="Program size"
          value={s.size.source}
          disabled={s.mode !== 'network' || !!closed}
          onChange={(e) =>
            set({
              size:
                e.target.value === 'typed'
                  ? { source: 'typed', needles: 100, passes: 100 }
                  : { source: 'gauge' },
            })
          }
        >
          <option value="gauge">
            {s.mode !== 'network' || s.size.source === 'gauge'
              ? 'From the fill measurement (jersey fallback)'
              : 'From the jersey measurement'}
          </option>
          {!closed && <option value="typed">Typed needles × passes</option>}
        </select>
      </label>
      {s.mode === 'network' && s.size.source === 'typed' && (
        <div className="boundary-counts knit-pair">
          <NumberField
            label="Needles"
            value={s.size.needles}
            min={1}
            max={MAX_SIDE}
            onChange={(needles) =>
              s.size.source === 'typed' && set({ size: { ...s.size, needles } }, 'knit-needles')
            }
          />
          <NumberField
            label="Passes"
            value={s.size.passes}
            min={1}
            max={MAX_SIDE}
            onChange={(passes) =>
              s.size.source === 'typed' && set({ size: { ...s.size, passes } }, 'knit-passes')
            }
          />
        </div>
      )}

      <StructureSelect
        tiles={s.tiles}
        label="Cell fill"
        value={s.cells.fill}
        onChange={(id) => set({ cells: { ...s.cells, fill: id ?? 'jersey' } })}
      />
      {s.mode !== 'shape' && (
        <>
          <label className="select-label">
            Cell rule
            <select
              aria-label="Cell rule"
              value={rule.kind}
              onChange={(e) =>
                setRule(ruleFor(e.target.value as KnitCellRule['kind'], s.cells.fill))
              }
            >
              {RULES.filter((r) => !closed || r.kind !== 'coarse' || rule.kind === 'coarse').map(
                (r) => (
                  <option key={r.kind} value={r.kind}>
                    {r.name}
                  </option>
                )
              )}
            </select>
          </label>
          {rule.kind === 'sides' &&
            SIDE_CLASSES.map((n) => (
              <StructureSelect
                tiles={s.tiles}
                key={n}
                label={`${n}-sided cells`}
                value={rule.bySides[n] ?? null}
                none="Cell fill"
                onChange={(id) => {
                  const bySides = { ...rule.bySides };
                  if (id) bySides[n] = id;
                  else delete bySides[n];
                  setRule({ kind: 'sides', bySides });
                }}
              />
            ))}
          {(rule.kind === 'alternating' || rule.kind === 'coarse') &&
            rule.palette.map((id, i) => (
              <StructureSelect
                tiles={s.tiles}
                key={i}
                label={`${rule.kind === 'coarse' ? 'Coarse colour' : 'Alternate'} ${i + 1}`}
                value={id}
                onChange={(next) => setPalette(i, next)}
              />
            ))}
          {rule.kind === 'coarse' && (
            <div className="inline-actions">
              <button
                type="button"
                disabled={rule.palette.length <= 2}
                onClick={() => setRule({ ...rule, palette: rule.palette.slice(0, -1) })}
              >
                − colour
              </button>
              <button
                type="button"
                disabled={rule.palette.length >= 6}
                onClick={() => setRule({ ...rule, palette: [...rule.palette, s.cells.fill] })}
              >
                + colour
              </button>
            </div>
          )}

          <StructureSelect
            tiles={s.tiles}
            label="Edge lines"
            value={s.edges.structure}
            none="None"
            onChange={(structure) => set({ edges: { ...s.edges, structure } })}
          />
          <div className="boundary-counts knit-pair">
            <NumberField
              label="Line width (loops)"
              value={s.edges.width}
              min={1}
              max={MAX_LINE_LOOPS}
              onChange={(width) => set({ edges: { ...s.edges, width } }, 'knit-edge-width')}
            />
            <NumberField
              label="Node mark (loops)"
              value={s.nodes.size}
              min={1}
              max={MAX_LINE_LOOPS}
              onChange={(size) => set({ nodes: { ...s.nodes, size } }, 'knit-node-size')}
            />
          </div>
          <StructureSelect
            tiles={s.tiles}
            label="Node marks"
            value={s.nodes.structure}
            none="None"
            onChange={(structure) => set({ nodes: { ...s.nodes, structure } })}
          />
          <StructureSelect
            tiles={s.tiles}
            label="Extraordinary nodes"
            value={s.nodes.extraordinary}
            none="As other nodes"
            onChange={(extraordinary) => set({ nodes: { ...s.nodes, extraordinary } })}
          />
        </>
      )}
      <div className="knit-checks">
        <button
          type="button"
          className={`check ${s.edges.boundary ? 'checked' : ''}`}
          aria-pressed={s.edges.boundary}
          onClick={() => set({ edges: { ...s.edges, boundary: !s.edges.boundary } })}
        >
          <span aria-hidden="true">[{s.edges.boundary ? '×' : ' '}]</span>
          Lines and marks on the boundary
        </button>
        <button
          type="button"
          className={`check ${s.autoTransfers ? 'checked' : ''}`}
          aria-pressed={s.autoTransfers}
          onClick={() => set({ autoTransfers: !s.autoTransfers })}
        >
          <span aria-hidden="true">[{s.autoTransfers ? '×' : ' '}]</span>
          Automatic transfers at bed changes
        </button>
      </div>
    </section>
  );
}
