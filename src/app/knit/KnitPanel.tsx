// Inspector "Knit" tab: program summary, provenance, checks, exports, measurement table and lab rules.
import { useState, type ChangeEvent } from 'react';
import type { KnitSettings, PatternGraph, SwatchEntry } from '../../core/types';
import type { ViewerSelection } from '../../viewer/types';
import type { KnitBuild } from '../../knit/program';
import { BASIC } from '../../knit/keys';
import { structuresForKey, type Structure } from '../../knit/structures';
import { SOURCE } from '../../knit/rasterize';
import { bmpBytes, grammarJson } from '../../knit/files';
import { knitReport } from '../../knit/report';
import { parseSwatchFile, swatchFileText, validateSwatches } from '../../knit/gauge';
import { download, projectFilename } from '../../adapters/export';
import { loopText } from './provenance';
import { referencesBibtex, referencesCSL } from '../../learning/citations';
import TileEditor from './TileEditor';

interface Props {
  build: KnitBuild;
  settings: KnitSettings;
  swatches: SwatchEntry[];
  graph: PatternGraph | null;
  projectName: string;
  surfaceSize: number;
  hover: number | null;
  selection: ViewerSelection | null;
  onSettings: (next: KnitSettings, coalesceKey?: string) => void;
  onSwatches: (next: SwatchEntry[]) => void;
  onMark: (cells: number[] | null) => void;
}

const mm = (m: number) => +(m * 1000).toFixed(4);

function SwatchForm({
  structures: STRUCTURES,
  entry,
  taken,
  onSave,
  onRemove,
}: {
  structures: readonly Structure[];
  entry: SwatchEntry | null;
  taken: Set<string>;
  onSave: (e: SwatchEntry) => string | null;
  onRemove?: () => void;
}) {
  const blank = {
    structure: STRUCTURES.find((s) => !taken.has(s.id))?.id ?? 'jersey',
    width: '',
    height: '',
    date: '',
    gauge: '',
    yarn: '',
    stitchLength: '',
    note: '',
  };
  const [d, setD] = useState(
    entry
      ? {
          structure: entry.structure,
          width: String(mm(entry.stitchWidth)),
          height: String(mm(entry.courseHeight)),
          date: entry.date ?? '',
          gauge: entry.gauge ?? '',
          yarn: entry.yarn ?? '',
          stitchLength: entry.stitchLength ?? '',
          note: entry.note ?? '',
        }
      : blank
  );
  const [error, setError] = useState('');
  const field = (k: keyof typeof d) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setD({ ...d, [k]: e.target.value });
  const save = () => {
    const width = Number(d.width) / 1000,
      height = Number(d.height) / 1000;
    const next: SwatchEntry = {
      structure: d.structure,
      stitchWidth: d.width.trim() ? width : NaN,
      courseHeight: d.height.trim() ? height : NaN,
    };
    for (const k of ['date', 'gauge', 'yarn', 'stitchLength', 'note'] as const)
      if (d[k].trim()) next[k] = d[k].trim();
    const message = onSave(next);
    setError(message ?? '');
    if (!message && !entry) setD(blank);
  };
  return (
    <div className="swatch-form">
      <label className="select-label">
        Structure
        <select
          aria-label="Measured structure"
          value={d.structure}
          disabled={!!entry}
          onChange={field('structure')}
        >
          {STRUCTURES.filter((s) => s.id === d.structure || !taken.has(s.id)).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <div className="boundary-counts knit-pair">
        <label>
          Stitch width (mm)
          <input
            aria-label="Stitch width (mm)"
            inputMode="decimal"
            value={d.width}
            onChange={field('width')}
          />
        </label>
        <label>
          Course height (mm)
          <input
            aria-label="Course height (mm)"
            inputMode="decimal"
            value={d.height}
            onChange={field('height')}
          />
        </label>
      </div>
      <div className="boundary-counts knit-pair">
        <label>
          Date
          <input aria-label="Date" value={d.date} onChange={field('date')} />
        </label>
        <label>
          Gauge
          <input aria-label="Gauge" value={d.gauge} onChange={field('gauge')} />
        </label>
        <label>
          Yarn
          <input aria-label="Yarn" value={d.yarn} onChange={field('yarn')} />
        </label>
        <label>
          Stitch length
          <input
            aria-label="Stitch length"
            value={d.stitchLength}
            onChange={field('stitchLength')}
          />
        </label>
      </div>
      <label className="select-label">
        Note
        <input aria-label="Note" value={d.note} onChange={field('note')} />
      </label>
      {error && (
        <p className="knit-error" role="alert">
          {error}
        </p>
      )}
      <div className="inline-actions">
        <button type="button" onClick={save}>
          {entry ? 'Save measurement' : 'Add measurement'}
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export default function KnitPanel(props: Props) {
  const { build, settings: s, swatches, graph } = props;
  const STRUCTURES = structuresForKey(BASIC, s.tiles);
  const nameOf = (id: string) => STRUCTURES.find((x) => x.id === id)?.name ?? id;
  const [importError, setImportError] = useState('');
  const program = build.ok ? build.program : null;
  const file = projectFilename(props.projectName);
  const set = (change: Partial<KnitSettings>, coalesceKey?: string) =>
    props.onSettings({ ...s, ...change }, coalesceKey);
  const saveSwatch = (entry: SwatchEntry, replace: boolean): string | null => {
    try {
      const next = replace
        ? swatches.map((x) => (x.structure === entry.structure ? entry : x))
        : [...swatches, entry];
      props.onSwatches(validateSwatches(next));
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  };
  const selectedCell =
    props.selection?.kind === 'cell' && graph
      ? graph.cells.find((c) => c.id === props.selection!.id)
      : undefined;
  const cellIndex = selectedCell && graph ? graph.cells.indexOf(selectedCell) : -1;
  const counts = program
    ? [SOURCE.cell, SOURCE.edge, SOURCE.node, SOURCE.extraordinary].map(
        (k) => program.raster.kind.filter((x) => x === k).length
      )
    : [];
  const taken = new Set(swatches.map((x) => x.structure));

  return (
    <div className="knit-panel">
      <div className="inspector-title">
        <span className="eyebrow">Design-level knit program</span>
        <h2>Knit program</h2>
        <p className="hint">
          Knit Grammar convention for the lab software. Not machine-ready; not verified until
          knitted.
        </p>
      </div>

      {!program ? (
        <p className="knit-status" role="status">
          {!build.ok && build.reason}
        </p>
      ) : (
        <>
          <div className="knit-metrics">
            <div className="metric">
              <span>Needles</span>
              <strong>{program.w}</strong>
            </div>
            <div className="metric">
              <span>Passes</span>
              <strong>{program.h}</strong>
            </div>
            <div className="metric">
              <span>Transfers</span>
              <strong>{program.transfers.length}</strong>
            </div>
            <div className="metric">
              <span>Checks</span>
              <strong>{program.findings.length}</strong>
            </div>
          </div>
          <p className="hint">
            {program.sizeSource === 'gauge' && program.sizeGauge
              ? `Size from ${program.sizeGauge.assumed ? 'assumed = jersey' : `the ${program.sizeGauge.measuredOn} measurement`}: ${mm(program.sizeGauge.stitchWidth)} mm per needle, ${mm(program.sizeGauge.courseHeight)} mm per pass.`
              : 'Size typed; not derived from a measurement.'}{' '}
            {program.settings.mode === 'shape'
              ? `${program.shape?.needles.placements.length} surface loops; network assignments are not applied in shape mode.`
              : `Loops from cells ${counts[0]}, edges ${counts[1]}, nodes ${counts[2]}, extraordinary nodes ${counts[3]}.`}
            {program.staleNetwork && ' The network is stale; regenerate to match the settings.'}
          </p>
          <p className="knit-loop" aria-live="polite">
            {props.hover !== null
              ? loopText(program, graph, props.hover)
              : 'Point at the bitmap to trace a loop to the surface; select a cell, edge or node in 3D to see its loops.'}
          </p>

          <h3 className="knit-heading">Structures</h3>
          <table className="knit-table">
            <tbody>
              {program.structures.map((x) => (
                <tr key={x.id}>
                  <td>{x.name}</td>
                  <td>{x.loops}</td>
                  <td className={x.gauge && !x.gauge.assumed ? '' : 'warn'}>
                    {!x.gauge ? 'not measured' : x.gauge.assumed ? 'assumed = jersey' : 'measured'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="knit-heading">Checks (warnings)</h3>
          {program.findings.length === 0 && <p className="hint">No findings at these limits.</p>}
          {program.findings.map((f) => (
            <details className="diagnostic warning" key={f.id}>
              <summary>
                {f.title} <small>{f.cells.length} loops</small>
              </summary>
              <p>{f.text}</p>
              <button type="button" onClick={() => props.onMark(f.cells)}>
                Show in the program
              </button>
            </details>
          ))}
          {program.skippedTransfers.length > 0 && (
            <p className="hint">
              {program.skippedTransfers.length} bed changes were left as they are (see the report).
            </p>
          )}
          {program.issues.map((t) => (
            <p className="hint warn" key={t}>
              {t}
            </p>
          ))}

          {program.shape && (
            <section aria-label="Shape report">
              <h3 className="knit-heading">Shape report</h3>
              {program.shape.closed ? (
                <>
                  <p className="hint">
                    Flat cube net: the validated cut of seven whole creases is unfolded exactly.
                    Folds between hinged faces are knitted straight through, so the knit does not
                    form the creases. Project construction.
                  </p>
                  <p className="hint">
                    {program.shape.closed.net.cols} × {program.shape.closed.net.rows} faces ·{' '}
                    {program.shape.closed.needlesPerFace} needles ×{' '}
                    {program.shape.closed.passesPerFace} passes per face ·{' '}
                    {program.shape.closed.shifts.length} one-pass shifts ·{' '}
                    {program.shape.closed.seams.length} seams with loops listed in the report.
                  </p>
                  {program.shape.closed.stops.length > 0 && (
                    <>
                      <p className="hint warn">
                        The colour key has no cast-off. Cast off these stops in the lab software, or
                        hold the loops to the end:
                      </p>
                      <ul className="hint" aria-label="Needle stops">
                        {program.shape.closed.stops.map((x) => (
                          <li key={`${x.pass}:${x.from}`}>
                            Last loops in pass {x.pass}: needles {x.from + 1}–{x.to + 1}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <p className="hint">
                  Courses → loops → needle layout. Course and loop construction adapt{' '}
                  <a
                    href="https://doi.org/10.3929/ethz-b-000408640"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mariana A. Popescu (2019), KnitCrete, §§5.2 and 6.2
                  </a>
                  . The distance field, alignment and needle operations are project adaptations;
                  this is not an exact reproduction.
                </p>
              )}
              {program.rectification && (
                <p className="hint">
                  Network-only rectangular output: {program.rectification.addedCells} filled
                  reference cells; up to {program.rectification.maxAddedPasses} extra passes per
                  needle ({mm(program.rectification.maxAddedCourseLengthM)} mm of nominal
                  course-height accumulation). Shaping transfers are not applied; physical target
                  shape is not predicted.
                </p>
              )}
              <p className="hint">
                {program.shape.geometry.courses.length} reference courses ·{' '}
                {program.shape.needles.steps.filter((x) => x.role === 'turn').length} turns ·{' '}
                {program.shape.needles.steps.filter((x) => x.role.includes('increase')).length}{' '}
                increases ·{' '}
                {program.shape.needles.steps.filter((x) => x.role === 'decrease').length} decreases
                · {program.shape.needles.moves.length} moves ·{' '}
                {program.shape.needles.unresolved.length} unresolved ·{' '}
                {program.shape.needles.yarnJumps} yarn jumps.
              </p>
              <p className="hint">
                Not simulated; not verified until knitted. See Report TXT for rounding, method and
                unresolved steps.
              </p>
              {!program.shape.closed && (
                <div className="inline-actions">
                  <button
                    type="button"
                    onClick={() =>
                      download(
                        referencesBibtex(['popescu2019knitcrete']),
                        'knit-shaping.bib',
                        'application/x-bibtex'
                      )
                    }
                  >
                    Citation BibTeX
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      download(
                        JSON.stringify(referencesCSL(['popescu2019knitcrete']), null, 2),
                        'knit-shaping-citation.json',
                        'application/json'
                      )
                    }
                  >
                    Citation CSL JSON
                  </button>
                </div>
              )}
            </section>
          )}
          <h3 className="knit-heading">Export</h3>
          {program.exportBlockers.length > 0 && (
            <div role="status" className="knit-export-blockers">
              <p>Operation exports blocked:</p>
              <ul>
                {program.exportBlockers.slice(0, 200).map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {program.exportBlockers.length > 200 && (
                <p>{program.exportBlockers.length - 200} further issues; see the report summary.</p>
              )}
              <p>Preview and report remain available.</p>
            </div>
          )}
          <div className="export-grid">
            <button
              type="button"
              disabled={program.exportBlockers.length > 0}
              onClick={() =>
                download(bmpBytes(program).slice().buffer, `${file}-knit.bmp`, 'image/bmp')
              }
            >
              Bitmap BMP
            </button>
            <button
              type="button"
              disabled={program.exportBlockers.length > 0}
              onClick={() =>
                download(
                  grammarJson({
                    ...program,
                    name: props.projectName,
                    note: `Knit program from the Knitting Topology project "${props.projectName}". Design-level; not verified until knitted.`,
                  }),
                  `${file}-knit-grammar.json`,
                  'application/json'
                )
              }
            >
              Knit Grammar JSON
            </button>
            <button
              type="button"
              onClick={() =>
                download(
                  knitReport(program, props.projectName, props.surfaceSize),
                  `${file}-knit-report.txt`,
                  'text/plain'
                )
              }
            >
              Report TXT
            </button>
          </div>
        </>
      )}

      {selectedCell && s.mode !== 'shape' && (
        <>
          <h3 className="knit-heading">Selected cell {selectedCell.id}</h3>
          <label className="select-label">
            Structure for this cell
            <select
              aria-label="Structure for the selected cell"
              value={s.cells.overrides[selectedCell.id] ?? ''}
              onChange={(e) => {
                const overrides = { ...s.cells.overrides };
                if (e.target.value) overrides[selectedCell.id] = e.target.value;
                else delete overrides[selectedCell.id];
                set({ cells: { ...s.cells, overrides } });
              }}
            >
              <option value="">
                From the rule (
                {program && cellIndex >= 0
                  ? nameOf(program.raster.cellStructure[cellIndex]!)
                  : 'fill'}
                )
              </option>
              {STRUCTURES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {Object.keys(s.cells.overrides).length > 0 && (
        <div className="inline-actions">
          <button type="button" onClick={() => set({ cells: { ...s.cells, overrides: {} } })}>
            Clear {Object.keys(s.cells.overrides).length} cell overrides
          </button>
        </div>
      )}

      <TileEditor settings={s} swatches={swatches} onChange={props.onSettings} />
      <h3 className="knit-heading">Measurement table</h3>
      <p className="hint">
        From your swatches; values are never filled in for you. Unmeasured structures use the jersey
        values and are flagged.
      </p>
      {swatches.map((x) => (
        <details className="swatch-entry" key={`${x.structure}:${x.stitchWidth}:${x.courseHeight}`}>
          <summary>
            {nameOf(x.structure)} · {mm(x.stitchWidth)} × {mm(x.courseHeight)} mm
          </summary>
          <SwatchForm
            structures={STRUCTURES}
            entry={x}
            taken={taken}
            onSave={(e) => saveSwatch(e, true)}
            onRemove={() => props.onSwatches(swatches.filter((y) => y.structure !== x.structure))}
          />
        </details>
      ))}
      {taken.size < STRUCTURES.length && (
        <details className="swatch-entry" open={swatches.length === 0}>
          <summary>Add a measurement</summary>
          <SwatchForm
            structures={STRUCTURES}
            key={swatches.length}
            entry={null}
            taken={taken}
            onSave={(e) => saveSwatch(e, false)}
          />
        </details>
      )}
      <div className="inline-actions">
        <button
          type="button"
          disabled={!swatches.length}
          onClick={() =>
            download(swatchFileText(swatches), `${file}-swatches.json`, 'application/json')
          }
        >
          Save table
        </button>
        <label className="file-button">
          Load table
          <input
            type="file"
            accept=".json,application/json"
            aria-label="Load measurement table"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                props.onSwatches(parseSwatchFile(await f.text()));
                setImportError('');
              } catch (error) {
                setImportError((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      {importError && (
        <p className="knit-error" role="alert">
          {importError}
        </p>
      )}

      <h3 className="knit-heading">Lab rules · to confirm with the lab</h3>
      <p className="hint">
        Turns: no wrap or tuck is added at short-row turns (to confirm with the lab).
      </p>
      <label className="select-label">
        New loop on an opened needle (to confirm)
        <select
          aria-label="New loop operation"
          value={s.newLoop ?? 'knit'}
          onChange={(e) => set({ newLoop: e.target.value as KnitSettings['newLoop'] })}
        >
          <option value="knit">Knit first</option>
          <option value="tuck">Tuck first</option>
        </select>
      </label>
      <label className="select-label">
        First pass
        <select
          aria-label="First pass direction"
          value={s.lab.firstPass}
          onChange={(e) =>
            set({
              lab: { ...s.lab, firstPass: e.target.value as KnitSettings['lab']['firstPass'] },
            })
          }
        >
          <option value="left-to-right">Left to right</option>
          <option value="right-to-left">Right to left</option>
        </select>
      </label>
      <label className="select-label">
        Transfer timing (recorded; does not change the bitmap)
        <select
          aria-label="Transfer timing"
          value={s.lab.transferTiming}
          onChange={(e) =>
            set({
              lab: {
                ...s.lab,
                transferTiming: e.target.value as KnitSettings['lab']['transferTiming'],
              },
            })
          }
        >
          <option value="after-row">After the row</option>
          <option value="per-needle">Right after each needle</option>
        </select>
      </label>
      <label className="select-label">
        Yarn guide travel (recorded; does not change the bitmap)
        <select
          aria-label="Yarn guide travel"
          value={s.lab.travel}
          onChange={(e) =>
            set({ lab: { ...s.lab, travel: e.target.value as KnitSettings['lab']['travel'] } })
          }
        >
          <option value="same-stroke">Same stroke</option>
          <option value="two-strokes">Two strokes</option>
        </select>
      </label>
      <div className="boundary-counts">
        {(['float', 'held', 'tucks'] as const).map((k) => (
          <label key={k}>
            {k === 'float' ? 'Float limit' : k === 'held' ? 'Held limit' : 'Tuck limit'}
            <input
              type="number"
              aria-label={`${k} check limit`}
              min={0}
              max={600}
              step={1}
              value={s.limits[k]}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 0 && n <= 600)
                  set({ limits: { ...s.limits, [k]: n } }, `knit-limit-${k}`);
              }}
            />
          </label>
        ))}
      </div>
      <p className="hint">{BASIC.credit}</p>
    </div>
  );
}
