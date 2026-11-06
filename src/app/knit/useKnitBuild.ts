import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectState } from '../../core/types';
import { buildKnitProgram, type KnitBuild } from '../../knit/program';
import { generateKnitInWorker } from '../../knit/client';

type Input = Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>;
/** Explicit shape jobs preserve the last accepted preview and reject superseded inputs. */
export function useKnitBuild(input: Input, staleNetwork: boolean) {
  const shape = input.knit?.mode === 'shape';
  const surfaceSignature = useMemo(() => JSON.stringify(input.surface), [input.surface]);
  const settingsSignature = useMemo(
    () => JSON.stringify([input.knit, input.swatches]),
    [input.knit, input.swatches]
  );
  // Shape generation has no graph input. Reuse the large immutable surface serialization.
  const signature = shape
    ? `${surfaceSignature}:${settingsSignature}`
    : `network:${settingsSignature}`;
  const [accepted, setAccepted] = useState<{
    signature: string;
    surface: string;
    build: KnitBuild;
  } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(signature);
  latest.current = signature;
  useEffect(() => {
    controller.current?.abort();
    setProgress(null);
  }, [signature]);
  useEffect(() => () => controller.current?.abort(), []);
  const outdated = shape && accepted?.signature !== signature;
  let build: KnitBuild;
  const networkBuild = useMemo(
    () => (shape ? null : buildKnitProgram(input, staleNetwork)),
    [shape, input.surface, input.graph, input.knit, input.swatches, staleNetwork]
  );
  if (!shape) build = networkBuild!;
  else if (accepted && accepted.surface === surfaceSignature) {
    build =
      accepted.build.ok && outdated
        ? {
            ok: true,
            program: {
              ...accepted.build.program,
              exportBlockers: [
                ...accepted.build.program.exportBlockers,
                'Shape preview is stale. Generate the current settings before operation export.',
              ],
            },
          }
        : accepted.build;
  } else build = { ok: false, reason: 'Generate shape after entering a jersey measurement.' };
  async function generate() {
    controller.current?.abort();
    const job = new AbortController();
    controller.current = job;
    setError('');
    setProgress('Starting shape generation');
    try {
      const result = await generateKnitInWorker(
        shape ? { ...input, graph: null } : input,
        job.signal,
        (fraction, stage) => {
          if (!job.signal.aborted) setProgress(`${stage} · ${Math.round(fraction * 100)}%`);
        }
      );
      if (!job.signal.aborted && latest.current === signature) {
        if (result.ok) setAccepted({ signature, surface: surfaceSignature, build: result });
        else setError(result.reason);
      }
    } catch (cause) {
      if (!job.signal.aborted) setError((cause as Error).message);
    } finally {
      if (controller.current === job) setProgress(null);
    }
  }
  return {
    build,
    outdated,
    progress,
    error,
    generate,
    cancel: () => {
      controller.current?.abort();
      setProgress(null);
    },
  };
}
