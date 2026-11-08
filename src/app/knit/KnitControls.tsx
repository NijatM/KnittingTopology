// Sidebar section 04: how the accepted network becomes a knit program. Only what works is offered.
import { useRef, useState } from 'react';
import type { KnitRequirement, KnitRequirementId } from '../../knit/requirements';
import KnitFeedback from './KnitFeedback';
import type { KnitCellRule, KnitCourseMethod, KnitSettings } from '../../core/types';
import {
  COURSE_METHODS,
  courseMethodOf,
  POPESCU_LIMITS,
  popescuSettingsOf,
} from '../../knit/knit-graph';
import { PRESET_KEYS, settingsKey } from '../../knit/keys';
import { structuresForKey, type Structure } from '../../knit/structures';
import { MAX_SIDE } from '../../knit/grid';
import { MAX_LINE_LOOPS, SIDE_CLASSES, withKey } from '../../knit/settings';

interface Props {
  settings: KnitSettings;
  open: boolean;
  status: string;
  onChange: (next: KnitSettings, coalesceKey?: string) => void;
  onToggleOpen: () => void;
  shapeJob?: {
    progress: string | null;
    error: string;
    attempts: number;
    generate: () => void;
    cancel: () => void;
  };
  requirements: KnitRequirement[];
  onRepair: (id: KnitRequirementId | 'settings') => void;
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
  options,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  none?: string;
  options: readonly Structure[];
}) {
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

/** A new rule's palette starts with the fill, then the key's other structures in library order. */
function ruleFor(
  kind: KnitCellRule['kind'],
  fill: string,
  library: readonly Structure[]
): KnitCellRule {
  const rest = library.map((x) => x.id).filter((id) => id !== fill);
  if (kind === 'sides') return { kind, bySides: {} };
  if (kind === 'alternating') return { kind, palette: [fill, ...rest.slice(0, 1)] };
  if (kind === 'coarse') return { kind, palette: [fill, ...rest.slice(0, 2)] };
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
  requirements,
  onRepair,
  closed,
}: Props) {
  const key = settingsKey(s),
    library = structuresForKey(key, s.tiles, s.keys);
  const [keyNote, setKeyNote] = useState('');
  const sizeSelect = useRef<HTMLSelectElement>(null);
  const missingMeasurement = requirements.some((r) => r.id === 'measurement');
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
      <label className="select-label">
        Key
        <select
          aria-label="Knit key"
          value={key.id}
          onChange={(e) => {
            const next = withKey(s, e.target.value);
            onChange(next.settings);
            setKeyNote(
              next.reset
                ? `${next.reset} assignment${next.reset === 1 ? '' : 's'} not available with this key moved to the fill or were switched off.`
                : ''
            );
          }}
        >
          {[...PRESET_KEYS, ...(s.keys ?? [])].map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
              {PRESET_KEYS.includes(k) ? '' : ' (custom)'}
            </option>
          ))}
        </select>
      </label>
      {keyNote && <p className="hint">{keyNote}</p>}
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
        <label className="select-label">
          Course method
          <select
            aria-label="Course method"
            value={courseMethodOf(s)}
            onChange={(e) => set({ courseMethod: e.target.value as KnitCourseMethod })}
          >
            {(Object.keys(COURSE_METHODS) as KnitCourseMethod[]).map((id) => (
              <option key={id} value={id} disabled={!!closed && id === 'popescu-2019-rules'}>
                {COURSE_METHODS[id].label}
                {closed && id === 'popescu-2019-rules' ? ' (open surfaces only)' : ''}
              </option>
            ))}
          </select>
        </label>
        {courseMethodOf(s) === 'popescu-2019-rules' && (
          <div className="boundary-counts knit-pair">
            <NumberField
              label="Result count"
              value={popescuSettingsOf(s).resultCount}
              min={POPESCU_LIMITS.resultCount[0]}
              max={POPESCU_LIMITS.resultCount[1]}
              onChange={(resultCount) =>
                set({ popescu: { ...popescuSettingsOf(s), resultCount } }, 'knit-result-count')
              }
            />
            <NumberField
              label="Angle tolerance (°)"
              value={popescuSettingsOf(s).angleTolerance}
              min={POPESCU_LIMITS.angleTolerance[0]}
              max={POPESCU_LIMITS.angleTolerance[1]}
              onChange={(angleTolerance) =>
                set(
                  { popescu: { ...popescuSettingsOf(s), angleTolerance } },
                  'knit-angle-tolerance'
                )
              }
            />
          </div>
        )}
        <p className="hint">
          {COURSE_METHODS[courseMethodOf(s)].note}
          {courseMethodOf(s) === 'popescu-2019-rules'
            ? ' Result count: nearest candidates per side (thesis minimum 4). Angle tolerance: near-ties go to the straighter course (thesis example 5°).'
            : ''}
        </p>
      </>
      <label className={`select-label ${missingMeasurement ? 'knit-required-control' : ''}`}>
        Size
        <select
          ref={sizeSelect}
          aria-label="Program size"
          aria-describedby={missingMeasurement ? 'knit-size-requirement' : undefined}
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
      {missingMeasurement && (
        <p id="knit-size-requirement" className="knit-required-hint">
          Measurement required
          {!closed && s.mode === 'network'
            ? ', or choose typed needles × passes.'
            : ' for this layout.'}
        </p>
      )}
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

      <div className="knit-shape-job">
        {shapeJob && (
          <>
            <button
              id="knit-generate"
              type="button"
              disabled={!!shapeJob.progress}
              onClick={shapeJob.generate}
            >
              {s.mode === 'shape' ? 'Generate shape' : 'Generate knit program'}
            </button>
            {shapeJob.progress && (
              <>
                <p role="status">{shapeJob.progress}</p>
                <button type="button" onClick={shapeJob.cancel}>
                  {s.mode === 'shape'
                    ? 'Cancel shape generation'
                    : 'Cancel knit program generation'}
                </button>
              </>
            )}
          </>
        )}
        {shapeJob && !requirements.length && !shapeJob.error && !shapeJob.progress && (
          <p className="knit-ready">Ready to generate.</p>
        )}
        <KnitFeedback
          requirements={requirements}
          error={shapeJob?.error ?? ''}
          attempts={shapeJob?.attempts ?? 0}
          allowTyped={s.mode === 'network' && !closed}
          onRepair={onRepair}
          onTyped={() => {
            set({ size: { source: 'typed', needles: 100, passes: 100 } });
            sizeSelect.current?.focus();
          }}
        />
      </div>

      <StructureSelect
        options={library}
        label="Cell fill"
        value={s.cells.fill}
        onChange={(id) => set({ cells: { ...s.cells, fill: id ?? library[0]!.id } })}
      />
      {s.mode !== 'shape' && (
        <>
          <label className="select-label">
            Cell rule
            <select
              aria-label="Cell rule"
              value={rule.kind}
              onChange={(e) =>
                setRule(ruleFor(e.target.value as KnitCellRule['kind'], s.cells.fill, library))
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
                options={library}
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
                options={library}
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
            options={library}
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
            options={library}
            label="Node marks"
            value={s.nodes.structure}
            none="None"
            onChange={(structure) => set({ nodes: { ...s.nodes, structure } })}
          />
          <StructureSelect
            options={library}
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
