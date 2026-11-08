import { useEffect, useMemo, useRef, useState } from 'react';
import type { SurfaceSpec } from '../../core/types';
import type { KnitProgram } from '../../knit/program';
import {
  PLAN_DEFAULTS,
  PLAN_MAX,
  validatePlanLimits,
  type PlanLimits,
} from '../../knit/transfer-planner';
import {
  transitionSource,
  transitionPlanJson,
  type TransitionPlanResult,
} from '../../knit/transition-plan';
import { planTransitionInWorker } from '../../knit/plan-client';
import { download } from '../../adapters/export';

const LIMIT_NAMES: Record<keyof PlanLimits, string> = {
  maxStates: 'Retained states',
  maxMoves: 'Tested moves',
  maxPhases: 'Phase depth',
};
const STATUS_NAMES = {
  found: 'Candidate verified',
  unreachable: 'No plan under the declared model',
  limit: 'Search limit reached',
  invalid: 'Invalid request',
  unsupported: 'Unsupported request',
};
interface Props {
  program: KnitProgram | null;
  surface: SurfaceSpec;
  outdated: boolean;
  file: string;
  onMark: (cells: number[] | null) => void;
}
export default function KnitTransitionPlanner({ program, surface, outdated, file, onMark }: Props) {
  const [beforePass, setBeforePass] = useState('2');
  const [draft, setDraft] = useState<Record<keyof PlanLimits, string>>({
    maxStates: String(PLAN_DEFAULTS.maxStates),
    maxMoves: String(PLAN_DEFAULTS.maxMoves),
    maxPhases: String(PLAN_DEFAULTS.maxPhases),
  });
  // The outer program wrapper is recreated on hover. Depend on its retained scientific data instead.
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
  const validation = useMemo(() => {
    const errors: Partial<Record<keyof PlanLimits | 'pass', string>> = {};
    const pass = Number(beforePass),
      raw = {} as PlanLimits;
    if ((program?.h ?? 0) < 2) errors.pass = 'At least two generated passes are required.';
    else if (!Number.isInteger(pass) || pass < 2 || pass > program!.h)
      errors.pass = `Choose a pass from 2 to ${program!.h}.`;
    for (const key of Object.keys(LIMIT_NAMES) as (keyof PlanLimits)[]) {
      raw[key] = Number(draft[key]);
      if (!Number.isInteger(raw[key]) || raw[key] < 1 || raw[key] > PLAN_MAX[key])
        errors[key] = `Use an integer from 1 to ${PLAN_MAX[key].toLocaleString('en-US')}.`;
    }
    return { errors, limits: Object.keys(errors).length ? null : validatePlanLimits(raw), pass };
  }, [beforePass, draft, program?.h]);
  const ready =
    !!source &&
    !outdated &&
    !!program?.layerGraph?.supported &&
    program.h >= 2 &&
    source.program.settings.layerModel === 'shared-reference-v1';
  const request = useMemo(
    () =>
      ready && validation.limits && source
        ? { source, beforePass: validation.pass, limits: validation.limits }
        : null,
    [source, ready, validation]
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
    result: TransitionPlanResult;
  } | null>(null);
  useEffect(() => {
    if (active.current && active.current.request !== request) {
      active.current.controller.abort();
      active.current = null;
      setProgress(null);
      setNotice('Inputs changed. The running analysis was cancelled.');
    }
  }, [request]);
  useEffect(
    () => () => {
      active.current?.controller.abort();
    },
    []
  );
  const stale = !!last && last.request !== request;
  async function run() {
    if (!request) return;
    active.current?.controller.abort();
    const job = { controller: new AbortController(), request };
    active.current = job;
    setProgress('Preparing the actual incoming loop state');
    setFailure('');
    setNotice('');
    try {
      const result = await planTransitionInWorker(
        request,
        job.controller.signal,
        (_fraction, stage) => {
          if (active.current === job && latest.current === request) setProgress(stage);
        }
      );
      if (active.current !== job || latest.current !== request || job.controller.signal.aborted)
        return;
      setLast({ request, result });
    } catch (error) {
      if (
        active.current === job &&
        latest.current === request &&
        (error as Error).name !== 'AbortError'
      )
        setFailure((error as Error).message);
    } finally {
      if (active.current === job) {
        active.current = null;
        setProgress(null);
      }
    }
  }
  const result = last?.result,
    search = result?.search;
  return (
    <details className="knit-transfer-planner" aria-label="Selected-transition transfer planner">
      <summary>Plan one transfer transition</summary>
      <p className="hint">
        Analyze the held loops immediately before one knitting pass. Unused held loops must finish
        at their current bed and needle. Candidate phases stay separate from the program.
      </p>
      {!ready && (
        <p className="knit-required-hint" role="status">
          Enable and generate a supported shared two-layer Shape reference with at least two passes.
          Generate the current settings if the preview is out of date.
        </p>
      )}
      <label className="select-label">
        Before knitting pass
        <input
          type="number"
          min="2"
          max={program?.h ?? 2}
          step="1"
          aria-label="Before knitting pass"
          aria-invalid={!!validation.errors.pass}
          aria-describedby="transfer-pass-help"
          value={beforePass}
          onChange={(e) => setBeforePass(e.target.value)}
        />
      </label>
      <p id="transfer-pass-help" className={validation.errors.pass ? 'knit-required-hint' : 'hint'}>
        {validation.errors.pass ??
          `Pass 1 creates the initial loops. The selected pass's expected parents define the active targets.`}
      </p>
      <details className="knit-transfer-limits">
        <summary>Computational limits</summary>
        <p className="hint">
          Resource bounds for this search, independent of machine capacity. Reaching a limit is not
          proof that no plan exists.
        </p>
        {(Object.keys(LIMIT_NAMES) as (keyof PlanLimits)[]).map((key) => (
          <label className="select-label" key={key}>
            {LIMIT_NAMES[key]}
            <input
              type="number"
              min="1"
              max={PLAN_MAX[key]}
              step="1"
              aria-label={LIMIT_NAMES[key]}
              aria-invalid={!!validation.errors[key]}
              aria-describedby={`transfer-${key}-help`}
              value={draft[key]}
              onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
            />
            <span
              className={validation.errors[key] ? 'knit-required-hint' : 'hint'}
              id={`transfer-${key}-help`}
            >
              {validation.errors[key] ?? `Maximum ${PLAN_MAX[key].toLocaleString('en-US')}.`}
            </span>
          </label>
        ))}
      </details>
      <div className="knit-transfer-actions">
        <button type="button" disabled={!request || progress !== null} onClick={() => void run()}>
          Plan selected transition
        </button>
        {progress !== null && (
          <button
            type="button"
            onClick={() => {
              active.current?.controller.abort();
              active.current = null;
              setProgress(null);
              setNotice('Analysis cancelled. The previous result is retained.');
            }}
          >
            Cancel transfer planning
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
          Planning failed: {failure}
        </p>
      )}
      {result && (
        <div className="knit-transfer-result" aria-label="Transfer plan result">
          {stale && (
            <p className="knit-required-hint" role="status">
              Previous analysis — inputs changed. Run the current request before relying on this
              result.
            </p>
          )}
          <h4
            className={
              result.status === 'invalid'
                ? 'knit-transfer-failure'
                : result.status === 'found'
                  ? ''
                  : 'knit-required-hint'
            }
          >
            {STATUS_NAMES[result.status]}
            {stale ? ' (previous inputs)' : ''}
          </h4>
          <p className="hint">
            Before pass {result.request.beforePass} · {result.request.width} logical needles ·{' '}
            {result.request.initial === null
              ? 'incoming state not accepted; target not prepared.'
              : `${result.request.activeTargets} active layer targets · ${result.request.heldLoops} fixed held loops.`}
          </p>
          {search && (
            <>
              <p>{search.reason}</p>
              <p className="hint">
                {search.phases.length} ordered phases · {search.stats.retainedStates} retained
                states · {search.stats.expandedStates} expanded states · {search.stats.testedMoves}{' '}
                tested moves · {search.stats.depthCutoffs} depth cutoffs.
              </p>
            </>
          )}
          {search?.proof && <p className="knit-required-hint">{search.proof}</p>}
          {!search && result.issues.length > 0 && (
            <ul className="knit-required-hint">
              {result.issues.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {result.request.prefixFindings.length > 0 && (
            <button
              type="button"
              onClick={() =>
                onMark([...new Set(result.request.prefixFindings.flatMap((f) => f.cells))])
              }
            >
              Show preceding history failures
            </button>
          )}
          {search?.status === 'found' && (
            <>
              <p>
                Independent replay:{' '}
                {search.validation?.ok
                  ? 'all phases valid; exact target matched.'
                  : 'validation failed.'}
              </p>
              {!search.phases.length && (
                <p className="hint">
                  The incoming state already meets this transition's target; no transfer phases are
                  needed.
                </p>
              )}
              {!!search.phases.length && (
                <details>
                  <summary>Candidate phases ({search.phases.length})</summary>
                  <ol>
                    {search.phases.map((p, i) => (
                      <li key={i}>
                        Racking {p.racking}:{' '}
                        {p.transfers
                          .map(
                            (t) =>
                              `${t.bed} needle ${t.needle + 1} → ${t.bed === 'front' ? 'back' : 'front'} needle ${t.needle + t.offset + 1}`
                          )
                          .join('; ')}
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </>
          )}
          <p className="hint">
            {result.source.programBlockers.length} source-program export blockers retained. This
            analysis has not changed the bitmap, loop histories or export permissions.
          </p>
          <button
            type="button"
            onClick={() =>
              download(
                transitionPlanJson(result, stale),
                `${file}-transfer-plan.json`,
                'application/json'
              )
            }
          >
            Transfer plan JSON
          </button>
        </div>
      )}
      <p className="hint">
        Whole stacks move to the opposite bed within the declared grid; no splitting or extra
        parking needles. A candidate verifies this logical target only. It does not certify native
        carriage passes, knittability or achieved shape.{' '}
        <a
          href="https://github.com/NijatM/KnittingTopology/blob/main/docs/knit-transfer-planning.md"
          target="_blank"
          rel="noreferrer"
        >
          Method and limits
        </a>
      </p>
    </details>
  );
}
