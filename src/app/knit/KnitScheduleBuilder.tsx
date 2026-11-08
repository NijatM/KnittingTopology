import { useEffect, useMemo, useRef, useState } from 'react';
import type { SurfaceSpec } from '../../core/types';
import type { KnitProgram } from '../../knit/program';
import { transitionSource } from '../../knit/transition-plan';
import { PLAN_DEFAULTS, PLAN_MAX } from '../../knit/transfer-planner';
import {
  SCHEDULE_MAX,
  validateScheduleLimits,
  shapingScheduleJson,
} from '../../knit/shaping-schedule';
import { buildScheduleInWorker } from '../../knit/schedule-client';
import type { ScheduleLimits, ShapingSchedule } from '../../knit/schedule-types';
import { imageIndex } from '../../knit/grid';
import { download } from '../../adapters/export';

const fields = {
  maxStates: {
    label: 'Schedule retained states per transition',
    max: PLAN_MAX.maxStates,
    value: PLAN_DEFAULTS.maxStates,
  },
  maxMoves: {
    label: 'Schedule tested moves per transition',
    max: PLAN_MAX.maxMoves,
    value: PLAN_DEFAULTS.maxMoves,
  },
  maxPhases: {
    label: 'Schedule phase depth per transition',
    max: PLAN_MAX.maxPhases,
    value: PLAN_DEFAULTS.maxPhases,
  },
  maxTotalMoves: { label: 'Total tested moves', max: SCHEDULE_MAX.maxTotalMoves, value: 1_000_000 },
  maxAddedPhases: { label: 'Total added phases', max: SCHEDULE_MAX.maxAddedPhases, value: 4096 },
} as const;
type Field = keyof typeof fields;
const NAMES = {
  complete: 'Complete schedule verified',
  unreachable: 'No schedule under the declared model',
  limit: 'Schedule search limit reached',
  invalid: 'Invalid schedule request or replay',
  unsupported: 'Schedule stopped: unsupported step',
};
interface Props {
  program: KnitProgram | null;
  surface: SurfaceSpec;
  outdated: boolean;
  file: string;
  onMark: (cells: number[] | null) => void;
}
export default function KnitScheduleBuilder({ program, surface, outdated, file, onMark }: Props) {
  const [draft, setDraft] = useState(
    () =>
      Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, String(f.value)])) as Record<
        Field,
        string
      >
  );
  const blockers = JSON.stringify(program?.exportBlockers ?? []);
  const source = useMemo(
    () => (program ? transitionSource(program, surface) : null),
    [
      program?.operations,
      program?.shape,
      program?.key,
      program?.cells,
      program?.w,
      program?.h,
      program?.firstDir,
      program?.patches,
      program?.settings.mode,
      program?.settings.layerModel,
      program?.settings.patches,
      surface.kind,
      surface.mapping,
      surface.revision,
      blockers,
    ]
  );
  const controls = useMemo(() => {
    const errors: Partial<Record<Field, string>> = {},
      values = {} as Record<Field, number>;
    for (const key of Object.keys(fields) as Field[]) {
      values[key] = Number(draft[key]);
      if (!Number.isInteger(values[key]) || values[key] < 1 || values[key] > fields[key].max)
        errors[key] = `Use an integer from 1 to ${fields[key].max.toLocaleString('en-US')}.`;
    }
    const limits: ScheduleLimits | null = Object.keys(errors).length
      ? null
      : validateScheduleLimits({
          perTransition: {
            maxStates: values.maxStates,
            maxMoves: values.maxMoves,
            maxPhases: values.maxPhases,
          },
          maxTotalMoves: values.maxTotalMoves,
          maxAddedPhases: values.maxAddedPhases,
        });
    return { errors, limits };
  }, [draft]);
  const ready =
    !!source &&
    !outdated &&
    !!program?.layerGraph?.supported &&
    source.program.settings.layerModel === 'shared-reference-v1';
  const request = useMemo(
    () => (ready && source && controls.limits ? { source, limits: controls.limits } : null),
    [source, ready, controls]
  );
  const latest = useRef(request);
  latest.current = request;
  const active = useRef<{
    controller: AbortController;
    request: NonNullable<typeof request>;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [failure, setFailure] = useState('');
  const [last, setLast] = useState<{
    request: NonNullable<typeof request>;
    result: ShapingSchedule;
  } | null>(null);
  const [page, setPage] = useState(0),
    [timelineOpen, setTimelineOpen] = useState(false);
  useEffect(() => {
    if (active.current && active.current.request !== request) {
      active.current.controller.abort();
      active.current = null;
      setProgress(null);
      setNotice('Inputs changed. Schedule building was cancelled.');
    }
  }, [request]);
  useEffect(() => () => active.current?.controller.abort(), []);
  async function run() {
    if (!request) return;
    active.current?.controller.abort();
    const job = { controller: new AbortController(), request };
    active.current = job;
    setProgress('Preparing the source operations and reference');
    setNotice('');
    setFailure('');
    try {
      const result = await buildScheduleInWorker(
        request,
        job.controller.signal,
        (_fraction, stage) => {
          if (active.current === job && latest.current === request) setProgress(stage);
        }
      );
      if (active.current !== job || latest.current !== request || job.controller.signal.aborted)
        return;
      setLast({ request, result });
      setPage(0);
    } catch (e) {
      if (
        active.current === job &&
        latest.current === request &&
        (e as Error).name !== 'AbortError'
      )
        setFailure((e as Error).message);
    } finally {
      if (active.current === job) {
        active.current = null;
        setProgress(null);
      }
    }
  }
  const result = last?.result,
    stale = !!last && last.request !== request;
  const stopCells = useMemo(() => {
    if (!result || result.stop?.pass === null || result.stop?.pass === undefined) return [];
    const stop = result.stop;
    return [
      ...new Set(
        result.reference
          .filter(
            (n) => n.pass === stop.pass && (stop.needle === undefined || n.needle === stop.needle)
          )
          .map((n) => imageIndex(result.width, result.height, n.needle, n.pass))
      ),
    ];
  }, [result]);
  return (
    <details
      className="knit-transfer-planner knit-schedule-builder"
      aria-label="Whole-program shaping schedule"
    >
      <summary>Build whole-program schedule</summary>
      <p className="hint">
        Preserve every source operation and original knitting direction. Add separate transfer
        phases between passes, carry the checked loop state forward, then independently replay the
        candidate.
      </p>
      {!ready && (
        <p className="knit-required-hint" role="status">
          Enable and generate a supported shared two-layer Shape reference first. Generate the
          current settings if the preview is out of date.
        </p>
      )}
      <details className="knit-schedule-limits">
        <summary>Schedule computational limits</summary>
        <p className="hint">
          Positive integer resource bounds, independent of machine capacity. A cutoff is not proof
          that no schedule exists.
        </p>
        {(Object.keys(fields) as Field[]).map((key) => (
          <label className="select-label" key={key}>
            {fields[key].label}
            <input
              type="number"
              min="1"
              max={fields[key].max}
              step="1"
              aria-label={fields[key].label}
              aria-invalid={!!controls.errors[key]}
              aria-describedby={`schedule-${key}-help`}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
            <span
              id={`schedule-${key}-help`}
              className={controls.errors[key] ? 'knit-required-hint' : 'hint'}
            >
              {controls.errors[key] ?? `Maximum ${fields[key].max.toLocaleString('en-US')}.`}
            </span>
          </label>
        ))}
      </details>
      <div className="knit-transfer-actions">
        <button type="button" disabled={!request || progress !== null} onClick={() => void run()}>
          Build shaping schedule
        </button>
        {progress !== null && (
          <button
            type="button"
            onClick={() => {
              active.current?.controller.abort();
              active.current = null;
              setProgress(null);
              setNotice('Schedule building cancelled. The previous result is retained.');
            }}
          >
            Cancel schedule building
          </button>
        )}
      </div>
      {progress !== null && (
        <p className="hint" role="status">
          {progress}
        </p>
      )}
      {notice && (
        <p className="knit-required-hint" role="status">
          {notice}
        </p>
      )}
      {failure && (
        <p className="knit-transfer-failure" role="alert">
          Schedule building failed: {failure}
        </p>
      )}
      {result && (
        <div className="knit-transfer-result" aria-label="Shaping schedule result">
          {stale && (
            <p className="knit-required-hint" role="status">
              Previous schedule analysis — inputs changed. Build the current request before relying
              on this result.
            </p>
          )}
          <h4
            className={
              result.status === 'invalid'
                ? 'knit-transfer-failure'
                : result.complete
                  ? ''
                  : 'knit-required-hint'
            }
          >
            {NAMES[result.status]}
            {stale ? ' (previous inputs)' : ''}
          </h4>
          <p>
            {result.validation.completedPasses} of {result.height} source passes verified ·{' '}
            {result.stats.addedPhases} added transfer phases.
          </p>
          <p className="hint">
            {result.validation.checkedEvents} events replayed · {result.validation.matchedParents}{' '}
            layer parent sets match · {result.stats.testedMoves} tested moves.
          </p>
          {!result.complete && (
            <p className="knit-required-hint">
              Incomplete candidate. Later source passes have not been validated as a continuous
              schedule.
            </p>
          )}
          {result.stop && (
            <p
              className={
                result.status === 'invalid' ? 'knit-transfer-failure' : 'knit-required-hint'
              }
            >
              {result.stop.pass === null
                ? 'Preparation'
                : `At source pass ${result.stop.pass + 1}${result.stop.needle === undefined ? '' : `, needle ${result.stop.needle + 1}`}`}
              : {result.stop.message}
            </p>
          )}
          {result.validation.ok ? (
            <p className="hint">
              Independent replay:{' '}
              {result.validation.complete
                ? 'all source passes and final reference inventory match.'
                : 'the retained prefix is valid; the full schedule is incomplete.'}
            </p>
          ) : (
            <p className="knit-transfer-failure">
              No fully verified candidate.{' '}
              {result.validation.issues[0]?.message ??
                'Resolve the reported request or source failure.'}
            </p>
          )}
          {!!stopCells.length && (
            <button type="button" disabled={stale} onClick={() => onMark(stopCells)}>
              Show schedule stop
            </button>
          )}
          {result.transitions.some((t) => t.status !== 'found') && (
            <details>
              <summary>Stopped transition</summary>
              {result.transitions
                .filter((t) => t.status !== 'found')
                .map((t) => (
                  <div key={t.beforePass}>
                    <p>
                      Before source pass {t.beforePass + 1}: {t.reason}
                    </p>
                    {t.proof && <p className="knit-required-hint">{t.proof}</p>}
                  </div>
                ))}
            </details>
          )}
          {!!result.events.length && (
            <details onToggle={(e) => setTimelineOpen(e.currentTarget.open)}>
              <summary>Schedule events ({result.events.length})</summary>
              {timelineOpen && (
                <>
                  <p className="hint">
                    Events {page * 50 + 1}–{Math.min((page + 1) * 50, result.events.length)}.
                    Transfer phases are not native carriage passes.
                  </p>
                  <ol start={page * 50 + 1}>
                    {result.events.slice(page * 50, (page + 1) * 50).map((e, i) => (
                      <li key={page * 50 + i}>
                        {e.kind === 'source-pass'
                          ? `Source knitting pass ${e.pass + 1} · ${(e.pass % 2 ? -1 : 1) * (result.canonical?.firstDir ?? 1) === 1 ? 'left to right' : 'right to left'}`
                          : `Before source pass ${e.beforePass + 1} · racking ${e.phase.racking}: ${e.phase.transfers.map((t) => `${t.bed} ${t.needle + 1} → ${t.bed === 'front' ? 'back' : 'front'} ${t.needle + t.offset + 1}`).join('; ')}`}
                      </li>
                    ))}
                  </ol>
                  <div className="knit-transfer-actions">
                    <button
                      type="button"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous events
                    </button>
                    <button
                      type="button"
                      disabled={(page + 1) * 50 >= result.events.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next events
                    </button>
                  </div>
                </>
              )}
            </details>
          )}
          <p className="hint">
            {result.source.programBlockers.length} original program export blockers retained. The
            source bitmap and loop histories have not changed.
          </p>
          <button
            type="button"
            onClick={() =>
              download(
                shapingScheduleJson(result, stale),
                `${file}-shaping-schedule.json`,
                'application/json'
              )
            }
          >
            Shaping schedule JSON
          </button>
        </div>
      )}
      <p className="hint">
        The empty symbolic start is not a validated cast-on; finishing and native binding remain lab
        work. This candidate does not establish knittability or achieved shape.{' '}
        <a
          href="https://github.com/NijatM/KnittingTopology/blob/main/docs/knit-shaping-schedules.md"
          target="_blank"
          rel="noreferrer"
        >
          Schedule method and limits
        </a>
      </p>
    </details>
  );
}
