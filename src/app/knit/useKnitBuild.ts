import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnitGraphStages, KnitSettings, ProjectState } from '../../core/types';
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
import { chartParts, pieceBuild, withoutStages } from '../../knit/patches';

type Input = Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>;
/** Saved stages of the whole chart, or of each patch, in patch order. */
const savedStages = (knit: KnitSettings | undefined) =>
  knit ? chartParts(knit).map((part) => part.settings.graph) : [];
/** The stages of an accepted build, part by part; a patch without a result keeps its saved stages. A
 * piece of several patches carries each patch's own stages. */
function builtStages(build: KnitBuild, knit: KnitSettings | undefined) {
  if (!build.ok) return [];
  const pieces = build.program.patches?.pieces;
  if (!pieces) {
    const stages = build.program.shape?.knitGraph?.stages;
    return stages ? [stages] : [];
  }
  const saved = savedStages(knit),
    stages = saved.slice();
  for (const p of pieces)
    p.patches.forEach((patch, k) => {
      if (p.build.ok) stages[patch] = p.stages[k] ?? saved[patch];
    });
  return stages;
}
/** Explicit shape jobs preserve the last accepted preview and reject superseded inputs. With computational
 * patches, `piece` selects a patch: the piece that holds it is shown and exported. */
export function useKnitBuild(
  input: Input,
  staleNetwork: boolean,
  cutMatchesSource = true,
  onKnitGraph?: (graph: KnitGraphStages, patch?: number) => void,
  piece = 0
) {
  const shape = input.knit?.mode === 'shape';
  // Shape generation has no graph input, except on a cube or sphere, whose layout comes from the cut network.
  const graphFree = shape && input.surface.kind !== 'cube' && input.surface.kind !== 'sphere';
  const usesWorker =
    !!input.knit?.recipes?.length ||
    input.knit?.mode === 'both' ||
    shape ||
    input.surface.kind !== 'plane' ||
    input.knit?.size.source !== 'typed' ||
    (input.knit.startEdge !== undefined && input.knit.startEdge !== 'v0');
  const graphSignature = useMemo(() => JSON.stringify(input.graph), [input.graph]);
  const surfaceSignature = useMemo(() => JSON.stringify(input.surface), [input.surface]);
  // Saved knit graph stages enter by content hash, so saving them after a build does not restale it. Feature
  // zones change no operation and are marked on the built program, so they never restale it.
  const settingsSignature = useMemo(
    () =>
      JSON.stringify([
        input.knit && { ...withoutStages(input.knit), zones: undefined },
        input.knit?.recipes?.map((recipe) =>
          input.knit?.zones?.find((zone) => zone.id === recipe.zone)
        ),
        input.swatches,
      ]),
    [input.knit, input.swatches]
  );
  const signatureWith = (stages: (KnitGraphStages | undefined)[]) =>
    `${surfaceSignature}:${settingsSignature}:${stages.map(knitGraphSignature).join('|')}:${graphFree ? '' : graphSignature}`;
  const signature = signatureWith(savedStages(input.knit));
  // Stale saved stages block export of the whole chart, or of their own patch.
  const staleStages = useMemo(
    () =>
      input.knit
        ? chartParts(input.knit).map((part) =>
            staleStagesBlocker(
              { surface: input.surface, knit: part.settings, swatches: input.swatches },
              part.window,
              part.label || undefined
            )
          )
        : [],
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
  // Keep a typed plane preview when an opt-in recipe switches generation to the worker.
  useEffect(() => {
    if (!usesWorker && networkBuild?.ok)
      setAccepted({ signature, surface: surfaceSignature, build: networkBuild });
  }, [usesWorker, networkBuild, signature, surfaceSignature]);
  if (!usesWorker) build = networkBuild!;
  else if (accepted && accepted.surface === surfaceSignature) {
    const shown =
      accepted.build.ok && accepted.build.program.patches
        ? pieceBuild(accepted.build.program.patches, piece)
        : accepted.build;
    build =
      shown.ok && outdated
        ? {
            ok: true,
            program: {
              ...shown.program,
              staleNetwork: !graphFree && staleNetwork,
              exportBlockers: [
                ...shown.program.exportBlockers,
                'Program preview is stale. Generate the current settings before operation export.',
              ],
            },
          }
        : shown.ok
          ? {
              ...shown,
              program: { ...shown.program, staleNetwork: !graphFree && staleNetwork },
            }
          : shown;
  } else
    build = {
      ok: false,
      reason: 'Generate the knit program after entering measurements or a typed network size.',
    };
  // Stale stages of any patch of the shown piece block its export.
  const staleParts = build.ok
    ? build.program.patches
      ? build.program.patches.pieces[build.program.patches.piece]!.patches.map(
          (i) => staleStages[i]
        )
      : [staleStages[0]]
    : [];
  const stale = staleParts.filter((x): x is string => !!x);
  if (build.ok && stale.length)
    build = {
      ...build,
      program: {
        ...build.program,
        exportBlockers: [...build.program.exportBlockers, ...stale],
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
      const fresh = (knit: KnitSettings, window?: Parameters<typeof freshStages>[1]) =>
        freshStages({ surface: input.surface, knit, swatches: input.swatches }, window);
      const knit =
        input.knit &&
        (input.knit.patches
          ? {
              ...input.knit,
              patches: {
                ...input.knit.patches,
                patches: chartParts(input.knit).map((part, i) => {
                  const { graph: _g, ...patch } = input.knit!.patches!.patches[i]!,
                    graph = fresh(part.settings, part.window);
                  return graph ? { ...patch, graph } : patch;
                }),
              },
            }
          : { ...input.knit, graph: fresh(input.knit) });
      const result = await generateKnitInWorker(
        { ...input, knit, ...(graphFree ? { graph: null } : {}) },
        job.signal,
        (fraction, stage) => {
          if (!job.signal.aborted) setProgress(`${stage} · ${Math.round(fraction * 100)}%`);
        }
      );
      if (!job.signal.aborted && latest.current === signature) {
        const stages = builtStages(result, input.knit);
        if (result.ok)
          setAccepted({
            signature: stages.length ? signatureWith(stages) : signature,
            surface: surfaceSignature,
            build: result,
          });
        else setFailure({ signature, message: result.reason });
        if (result.ok && result.program.patches)
          stages.forEach((graph, i) => {
            if (graph) onKnitGraph?.(graph, i);
          });
        else if (stages[0]) onKnitGraph?.(stages[0]);
      }
    } catch (cause) {
      if (!job.signal.aborted && latest.current === signature)
        setFailure({ signature, message: (cause as Error).message });
    } finally {
      if (controller.current === job) setProgress(null);
    }
  }
  // An edit of a courses stage, undoing one or discarding edits rebuilds the layout and its checks.
  const parts = input.knit ? chartParts(input.knit) : [],
    coursesKey = parts.map((part) => courseStageKey(part.settings.graph)).join('|'),
    edited = parts.some((part) => !!part.settings.graph?.courses.edits?.length),
    lastCourses = useRef({ key: coursesKey, edited });
  useEffect(() => {
    const previous = lastCourses.current;
    lastCourses.current = { key: coursesKey, edited };
    if (coursesKey === previous.key || !(edited || previous.edited) || !usesWorker) return;
    const before = previous.key.split('|');
    // Each changed stage must be fresh or gone; a stale one waits for the user's choice.
    const ready = parts.every(
      (part, i) =>
        courseStageKey(part.settings.graph) === before[i] ||
        !part.settings.graph ||
        knitGraphFreshness(
          { surface: input.surface, knit: part.settings, swatches: input.swatches },
          part.window
        )?.courses === 'fresh'
    );
    if (ready) void generate();
  }, [coursesKey]);
  // Every patch's piece and the seams of the accepted build, whichever piece is shown.
  const patches =
    accepted?.surface === surfaceSignature && accepted.build.ok
      ? accepted.build.program.patches
      : undefined;
  return {
    build,
    patches,
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
