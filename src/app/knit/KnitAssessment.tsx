import { useMemo } from 'react';
import type { KnitProgram } from '../../knit/program';
import { inspectKnitProgram } from '../../knit/inspection';

export default function KnitAssessment({
  program: p,
  outdated,
}: {
  program: KnitProgram;
  outdated: boolean;
}) {
  const s = useMemo(
    () => inspectKnitProgram(p),
    [
      p.cells,
      p.settings.mode,
      p.raster,
      p.shape,
      p.findings,
      p.issues,
      p.structures,
      p.exportBlockers.length,
    ]
  );
  return (
    <section
      className={`knit-assessment ${s.blockers || s.assumedStructures.length ? 'provisional' : ''}`}
      aria-label="Knit interpretation"
    >
      <h3>{outdated || p.staleNetwork ? 'Previous program — regenerate' : s.title}</h3>
      {(outdated || p.staleNetwork) && (
        <p className="hint warn">
          Previous program: inputs changed. Regenerate before interpreting or exporting the current
          design.
        </p>
      )}
      <p>
        Physical shape unverified. The viewer places a layout on the input surface; it does not
        predict the relaxed fabric.
      </p>
      {s.shaping ? (
        <p>
          {s.turnPasses} passes with short-row turns · {s.increases} interior increases ·{' '}
          {s.edgeStarts} new edge loops · {s.decreases} decreases · {s.requiredMoves} required
          sideways moves.
        </p>
      ) : (
        <p>
          Surface shaping is not encoded in this bitmap. Pattern assignment alone does not establish
          a saddle-shaped fabric.
        </p>
      )}
      <p>
        {s.operationWarnings} operation warnings · {s.modelNotes} method notes / limits ·{' '}
        {s.blockers} export blockers.
      </p>
      {p.sizeSource === 'typed' ? (
        <p>Unmeasured pixel dimensions; no calibrated physical size.</p>
      ) : p.sizeGauge?.assumed ? (
        <p className="hint warn">Sizing: assumed jersey dimensions for the fill.</p>
      ) : (
        <p>Reference sizing uses the entered fill measurement.</p>
      )}
      {s.assumedStructures.length > 0 && (
        <p className="hint warn">
          Jersey fallback for {s.assumedStructures.join(', ')}. Those structures have no separate
          swatch measurement.
        </p>
      )}
      {s.assigned > 0 && p.settings.mode !== 'shape' && (
        <p>
          Edge markings: {s.edges} of {s.assigned} assigned loops ({(s.edgeShare * 100).toFixed(1)}
          %).
        </p>
      )}
      {s.edgeShare > 0.5 && p.settings.mode !== 'shape' && (
        <p className="hint warn">
          Most assigned loops are edge markings. Inspect their provenance before interpreting the
          bitmap as a cell pattern.
        </p>
      )}
    </section>
  );
}
