// Cheap UI prerequisites only. Numerical and cut validation still run in the worker.
import type { ProjectState } from '../core/types';
import { defaultKnitSettings } from './settings';
import { knitAvailable } from './mapping';
import { requiresKnitCut } from './surface-scope';

export type KnitRequirementId = 'measurement' | 'network' | 'cut';
export interface KnitRequirement {
  id: KnitRequirementId;
  message: string;
  action: string;
}

export function knitRequirements(
  input: Pick<ProjectState, 'surface' | 'graph' | 'knit' | 'swatches'>,
  cutMatchesSource = true
): KnitRequirement[] {
  if (!knitAvailable(input.surface)) return [];
  const settings = input.knit ?? defaultKnitSettings();
  const closed = input.surface.kind === 'cube' || input.surface.kind === 'sphere';
  const requirements: KnitRequirement[] = [];
  if (
    (settings.mode !== 'network' || settings.size.source !== 'typed' || closed) &&
    !input.swatches?.some((s) => s.structure === 'jersey')
  )
    requirements.push({
      id: 'measurement',
      message:
        settings.mode === 'network'
          ? 'Measured sizing needs a jersey measurement: stitch width and course height.'
          : 'Shape and combined modes need a measured jersey swatch: stitch width and course height.',
      action: 'Add jersey measurement',
    });
  if (
    (settings.mode !== 'shape' || closed) &&
    (!input.graph || input.graph.provenance.surfaceRevision !== input.surface.revision)
  )
    requirements.push({
      id: 'network',
      message: 'Generate a network on the current surface first.',
      action: 'Go to network generation',
    });
  if (
    requiresKnitCut(input.surface) &&
    (!settings.cut?.edgeIds.length ||
      settings.cut.surfaceRevision !== input.surface.revision ||
      !cutMatchesSource)
  )
    requirements.push({
      id: 'cut',
      message:
        'A closed surface needs a validated cut for the current network. Use Cuts and seams.',
      action: 'Review cuts and seams',
    });
  return requirements;
}
