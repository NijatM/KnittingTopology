import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnitGraphStages, ProjectState } from '../../core/types';
import { buildKnitProgram, type KnitBuild } from '../../knit/program';
import { generateKnitInWorker } from '../../knit/client';
import { knitRequirements } from '../../knit/requirements';
import {
  courseStageKey,
  freshStages,
  knitGraphFreshness,
  knitGraphSignature,
  staleStagesBlocker,
} from '../../knit/knit-graph';

type Input = Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>;
/** Explicit shape jobs preserve the last accepted preview and reject superseded inputs. */
export function useKnitBuild(
  input: Input,
  staleNetwork: boolean,
  cutMatchesSource = true,
  onKnitGraph?: (graph: KnitGraphStages) => void
) {
  const shape = input.knit?.mode === 'shape';
  // Shape generation has no graph input, except on a cube or sphere, whose layout comes from the cut network.
  const graphFree = shape && input.surface.kind !== 'cube' && input.surface.kind !== 'sphere';
  const usesWorker =
    input.knit?.mode === 'both' ||
    shape ||
    input.surface.kind !== 'plane' ||
    input.knit?.size.source !== 'typed' ||
    (input.knit.startEdge !== undefined && input.knit.startEdge !== 'v0');
  const graphSignature = useMemo(() => JSON.stringify(input.graph), [input.graph]);
  const surfaceSignature = useMemo(() => JSON.stringify(input.surface), [input.surface]);
  // Saved knit graph stages enter by content hash, so saving them after a build does not restale it.
  const settingsSignature = useMemo(
    () => JSON.stringify([input.knit && { ...input.knit, graph: undefined }, input.swatches]),
    [input.knit, input.swatches]
  );
  const signatureWith = (graph: KnitGraphStages | undefined) =>
    `${surfaceSignature}:${settingsSignature}:${knitGraphSignature(graph)}:${graphFree ? '' : graphSignature}`;
  const signature = signatureWith(input.knit?.graph);
  const staleStages = useMemo(
    () => staleStagesBlocker(input),
    [input.surface, input.knit, input.swatches]
  );
  const [accepted, setAccepted] = useState<{
    signature: string;
    surface: string;
    build: KnitBuild;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ signature: string; message: string } | null>(null);
  const [attempts, setAttempts] = useState(0);
  const error = failure?.signature === signature ? failure.message : '';
  const requirements = useMemo(
    () => knitRequirements(input, cutMatchesSource),
    [input.surface, input.graph, input.knit, input.swatches, cutMatchesSource]
  );
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(signature);
  latest.current = signature;
  useEffect(() => {
    controller.current?.abort();
    setProgress(null);
  }, [signature]);
  useEffect(() => () => controller.current?.abort(), []);
  const outdated = usesWorker && accepted?.signature !== signature;
  let build: KnitBuild;
  const networkBuild = useMemo(
    () => (usesWorker ? null : buildKnitProgram(input, staleNetwork)),
    [usesWorker, input.surface, input.graph, input.knit, input.swatches, staleNetwork]
  );
  if (!usesWorker) build = networkBuild!;
  else if (accepted && accepted.surface === surfaceSignature) {
    build =
      accepted.build.ok && outdated
        ? {
            ok: true,
            program: {
              ...accepted.build.program,
              staleNetwork: !graphFree && staleNetwork,
              exportBlockers: [
                ...accepted.build.program.exportBlockers,
                'Program preview is stale. Generate the current settings before operation export.',
              ],
            },
          }
        : accepted.build.ok
          ? {
              ...accepted.build,
              program: { ...accepted.build.program, staleNetwork: !graphFree && staleNetwork },
            }
          : accepted.build;
  } else
    build = {
      ok: false,
      reason: 'Generate the knit program after entering measurements or a typed network size.',
    };
  if (build.ok && staleStages)
    build = {
      ...build,
      program: {
        ...build.program,
        exportBlockers: [...build.program.exportBlockers, staleStages],
      },
    };
  const preflight = requirements[0]?.message ?? '';
  if (!accepted && preflight) build = { ok: false, reason: preflight };
  async function generate() {
    controller.current?.abort();
    setAttempts((n) => n + 1);
    // A missing input is not a numerical job: keep the explanation visible without flashing progress.
    if (requirements.length) {
      setProgress(null);
      return;
    }
    const job = new AbortController();
    controller.current = job;
    setFailure(null);
    setProgress('Starting knit program generation');
    try {
      // Generate replaces stale stages: only fresh saved stages reach the build.
      const knit = input.knit && { ...input.knit, graph: freshStages(input) };
      const result = await generateKnitInWorker(
        { ...input, knit, ...(graphFree ? { graph: null } : {}) },
        job.signal,
        (fraction, stage) => {
          if (!job.signal.aborted) setProgress(`${stage} · ${Math.round(fraction * 100)}%`);
        }
      );
      if (!job.signal.aborted && latest.current === signature) {
        const stages = result.ok ? result.program.shape?.knitGraph?.stages : undefined;
        if (result.ok)
          setAccepted({
            signature: stages ? signatureWith(stages) : signature,
            surface: surfaceSignature,
            build: result,
          });
        else setFailure({ signature, message: result.reason });
        if (stages) onKnitGraph?.(stages);
      }
    } catch (cause) {
      if (!job.signal.aborted && latest.current === signature)
        setFailure({ signature, message: (cause as Error).message });
    } finally {
      if (controller.current === job) setProgress(null);
    }
  }
  // An edit of the courses stage, undoing one or discarding edits rebuilds the layout and its checks.
  const graph = input.knit?.graph,
    coursesKey = courseStageKey(graph),
    edited = !!graph?.courses.edits?.length,
    lastCourses = useRef({ key: coursesKey, edited });
  useEffect(() => {
    const previous = lastCourses.current;
    lastCourses.current = { key: coursesKey, edited };
    if (coursesKey === previous.key || !(edited || previous.edited) || !usesWorker) return;
    if (graph && knitGraphFreshness(input)?.courses !== 'fresh') return;
    void generate();
  }, [coursesKey]);
  return {
    build,
    outdated,
    progress,
    requirements,
    attempts,
    error,
    usesWorker,
    generate,
    cancel: () => {
      controller.current?.abort();
      setProgress(null);
    },
  };
}
