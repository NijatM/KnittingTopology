import { useEffect, useMemo, useRef, useState } from 'react';
import type { KnitCutSettings, PatternGraph, SurfaceSpec } from '../../core/types';
import type { CutPlan } from '../../knit/cut-types';
import { cutSettingsKey, cutSourceSignature } from '../../knit/cuts';
import { generateCutInWorker } from '../../knit/cut-client';

export function useCutPlan(
  surface: SurfaceSpec,
  graph: PatternGraph | null,
  cut: KnitCutSettings | undefined,
  onSave: (cut: KnitCutSettings) => void
) {
  const closed = surface.kind === 'cube' || surface.kind === 'sphere';
  const sourceSignature = useMemo(
    () => (closed && graph ? cutSourceSignature(surface, graph) : ''),
    [closed, surface, graph]
  );
  const matches =
    !!cut && cut.surfaceRevision === surface.revision && cut.sourceSignature === sourceSignature;
  const key = `${sourceSignature}:${cut ? cutSettingsKey(cut) : 'none'}`;
  const [accepted, setAccepted] = useState<{ key: string; plan: CutPlan } | null>(null),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null),
    latest = useRef(key),
    save = useRef(onSave);
  latest.current = key;
  save.current = onSave;
  useEffect(() => {
    controller.current?.abort();
    setProgress(null);
    setError('');
  }, [key]);
  useEffect(() => () => controller.current?.abort(), []);
  const plan = accepted?.plan.settings.sourceSignature === sourceSignature ? accepted.plan : null;
  const outdated = !!plan && accepted?.key !== key;
  async function generate(preset?: 'cube-cross' | 'sphere-meridian') {
    if (!graph || !closed) {
      setError('Generate a cube or sphere network first.');
      return;
    }
    if (!preset && !matches) {
      setError('The cut draft belongs to another source. Restore a preset or start a new draft.');
      return;
    }
    controller.current?.abort();
    const job = new AbortController();
    controller.current = job;
    setError('');
    setProgress('Starting cut validation');
    try {
      const result = await generateCutInWorker(
        { surface, graph, ...(preset ? { preset } : { settings: cut }) },
        job.signal,
        (fraction, stage) => {
          if (!job.signal.aborted) setProgress(`${stage} · ${Math.round(fraction * 100)}%`);
        }
      );
      if (job.signal.aborted || latest.current !== key) return;
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      if (result.plan.settings.sourceSignature !== sourceSignature) {
        setError('Cut source changed while validating.');
        return;
      }
      if (preset) save.current(result.plan.settings);
      setAccepted({
        key: `${sourceSignature}:${cutSettingsKey(result.plan.settings)}`,
        plan: result.plan,
      });
    } catch (cause) {
      if (!job.signal.aborted) setError((cause as Error).message);
    } finally {
      if (controller.current === job) setProgress(null);
    }
  }
  const empty = (): KnitCutSettings => ({
    surfaceRevision: surface.revision,
    sourceSignature,
    preset: 'manual',
    edgeIds: [],
  });
  return {
    closed,
    sourceSignature,
    matches,
    plan,
    outdated,
    error,
    progress,
    generate,
    empty,
    canExport: !!plan && matches && !outdated && !progress,
    cancel: () => {
      controller.current?.abort();
      setProgress(null);
    },
  };
}
export type CutJob = ReturnType<typeof useCutPlan>;
