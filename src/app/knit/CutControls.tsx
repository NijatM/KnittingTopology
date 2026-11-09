import type { KnitCutSettings, SurfaceSpec } from '../../core/types';
import type { CutJob } from './useCutPlan';
export default function CutControls({
  surface,
  cut,
  job,
  picking,
  onTogglePicking,
  onChange,
  onInspect,
  hasGraph,
  requiredForKnit,
}: {
  surface: SurfaceSpec;
  cut?: KnitCutSettings;
  job: CutJob;
  picking: boolean;
  onTogglePicking: () => void;
  onChange: (cut: KnitCutSettings) => void;
  onInspect: () => void;
  hasGraph: boolean;
  requiredForKnit: boolean;
}) {
  return (
    <section
      id="knit-cut-controls"
      tabIndex={-1}
      aria-label="Cuts and seams"
      className={`control-section knit-controls cut-controls ${requiredForKnit ? 'knit-required-control' : ''}`}
    >
      <h2>
        <span>04</span> Cuts and seams <i />
      </h2>
      <p className="hint">Prepare one topological disk and paired boundary segments.</p>
      <p className="hint">
        {surface.kind === 'cube'
          ? 'A cut made only of whole crease lines, such as the cross-net preset, can then be knitted from its flat net in 05 Knit program.'
          : (surface.poleOpeningDiameter ?? 0) > 0
            ? 'Connect the top and bottom circular rims with one descending meridian cut. The two polar rims remain natural openings and are not paired seams.'
            : 'A single cut running from a highest node to a lowest node, descending at every point, such as the meridian preset, can then be knitted from pole to pole in 05 Knit program.'}
      </p>
      <button
        type="button"
        disabled={!hasGraph || !!job.progress}
        onClick={() =>
          void job.generate(surface.kind === 'cube' ? 'cube-cross' : 'sphere-meridian')
        }
      >
        {surface.kind === 'cube' ? 'Cube cross-net cut' : 'Sphere meridian cut'}
      </button>
      <p className="hint">
        {surface.kind === 'cube'
          ? 'Cut seven cube crease chains, retaining five cross-net hinges.'
          : 'A +X-biased graph path joins a highest node to a lowest node, descending at every sample when the network allows it; this is a sampled path, not a geodesic.'}
      </p>
      <button
        type="button"
        disabled={!hasGraph || (!job.matches && !!cut)}
        aria-pressed={picking}
        onClick={onTogglePicking}
      >
        {picking ? 'Stop editing cut edges' : 'Edit cut edges in viewer'}
      </button>
      <button type="button" disabled={!hasGraph} onClick={() => onChange(job.empty())}>
        New empty cut draft
      </button>
      <button
        type="button"
        disabled={!hasGraph || !job.matches || !!job.progress}
        onClick={() => void job.generate()}
      >
        Validate cut draft
      </button>
      <button type="button" onClick={onInspect}>
        Inspect cut and seams
      </button>
      <p className="knit-status" role="status">
        {!hasGraph
          ? 'Generate a network first.'
          : cut
            ? `${cut.edgeIds.length} draft cut edges${job.matches ? '' : ' · source changed; restore a preset or start a new draft'}`
            : 'Choose a preset or start editing source edges.'}
      </p>
      {job.progress && (
        <>
          <p role="status">{job.progress}</p>
          <button type="button" onClick={job.cancel}>
            Cancel cut validation
          </button>
        </>
      )}
      {job.error && (
        <p className="hint warn" role="alert">
          {job.error}
        </p>
      )}
      {job.outdated && (
        <p className="hint warn">
          Draft changed. Validate it before seam export; the previous validated result remains
          inspectable.
        </p>
      )}
    </section>
  );
}
