import { useEffect, useState } from 'react';
import type { KnitCutSettings } from '../../core/types';
import type { CutJob } from './useCutPlan';
import type { ViewerSelection } from '../../viewer/types';
import { seamMapJson } from '../../knit/cuts';
import { download, projectFilename } from '../../adapters/export';
import { referencesBibtex, referencesCSL } from '../../learning/citations';
const PAGE = 20;
export default function CutPanel({
  job,
  cut,
  name,
  selection,
  onSelect,
}: {
  job: CutJob;
  cut?: KnitCutSettings;
  name: string;
  selection: ViewerSelection | null;
  onSelect: (s: ViewerSelection) => void;
}) {
  const { plan } = job,
    [page, setPage] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    setPage(0);
    setError('');
  }, [plan]);
  const selected =
    selection?.kind === 'edge'
      ? plan?.seams.find((s) => s.sourceEdgeId === selection.id)
      : undefined;
  return (
    <div className="cut-panel">
      <div className="inspector-title">
        <span className="eyebrow">Closed-surface preparation</span>
        <h2>Cuts and seams</h2>
        <p>
          Vertex and edge copies preserve their source identities. Boundary directions define the
          seam pairing.
        </p>
      </div>
      {!plan ? (
        <p role="status">
          Choose a cut preset or validate a manual draft to inspect the disk and seam pairs.
        </p>
      ) : (
        <>
          {job.outdated && (
            <p className="hint warn" role="status">
              Previous validation shown. Current draft is unvalidated; seam export is blocked.
            </p>
          )}
          <section aria-label="Cut topology result">
            <h3 className="knit-heading">{job.outdated ? 'Previous disk' : 'Validated disk'}</h3>
            <table className="knit-table">
              <tbody>
                {[
                  ['Components', plan.statistics.components],
                  ['Boundary loops', plan.statistics.boundaryComponents],
                  ['Euler characteristic', plan.statistics.euler],
                  ['Cut edges / seam pairs', plan.seams.length],
                  ['Branch vertices', plan.statistics.branchVertices],
                  ['Cut length (mm)', +(plan.statistics.cutLengthM * 1000).toFixed(3)],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              {plan.complex.vertices.length} vertex copies · {plan.complex.edges.length} edges ·{' '}
              {plan.complex.faces.length} faces. Geometry remains on the original 3D surface.
            </p>
            {!!plan.naturalBoundaries?.length && (
              <p className="hint">
                {plan.naturalBoundaries.length} natural polar-rim edges remain open. They are
                distinct from the paired meridian seam and are not gathered closed.
              </p>
            )}
          </section>
          <p className="hint">
            One boundary can contain a branched set of paired seams. These checks establish a
            combinatorial disk; they do not set a sewing order. Supported cube and sphere cuts are
            knitted in 05 Knit program.
          </p>
          <button
            type="button"
            disabled={!job.canExport || !cut}
            onClick={() => {
              try {
                download(
                  seamMapJson(plan, cut!),
                  `${projectFilename(name)}-seams.json`,
                  'application/json'
                );
                setError('');
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            Seam map JSON
          </button>
          {error && <p role="alert">{error}</p>}
          <h3 className="knit-heading">Seam pairs</h3>
          <p className="hint">
            Inspect a row to highlight its source edge in 3D. Edit cuts only when the viewer cut
            tool is armed.
          </p>
          <ol className="cut-seam-list" start={page * PAGE + 1}>
            {plan.seams.slice(page * PAGE, (page + 1) * PAGE).map((s) => (
              <li key={s.sourceEdgeId}>
                <button
                  type="button"
                  onClick={() => onSelect({ kind: 'edge', id: s.sourceEdgeId })}
                  aria-label={`Inspect seam ${s.sourceEdgeId}`}
                >
                  <code>{s.sourceEdgeId}</code>
                </button>
                <small>{+(s.lengthM * 1000).toFixed(3)} mm</small>
              </li>
            ))}
          </ol>
          <div className="inline-actions">
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous seam pairs
            </button>
            <span>
              {page + 1}/{Math.max(1, Math.ceil(plan.seams.length / PAGE))}
            </span>
            <button
              type="button"
              disabled={(page + 1) * PAGE >= plan.seams.length}
              onClick={() => setPage(page + 1)}
            >
              Next seam pairs
            </button>
          </div>
          {selected && (
            <section aria-label="Selected seam pair">
              <h3 className="knit-heading">Selected pair</h3>
              <code>{selected.sourceEdgeId}</code>
              {selected.sides.map((side, i) => (
                <div key={side.edgeId}>
                  <p>
                    Side {i + 1} · face <code>{side.faceId}</code>
                  </p>
                  <code>{side.from}</code>
                  <p>→</p>
                  <code>{side.to}</code>
                </div>
              ))}
              <p className="hint">
                Match copies of each original endpoint. The two boundary directions run oppositely.
              </p>
            </section>
          )}
        </>
      )}
      <h3 className="knit-heading">Method and citation</h3>
      <p className="hint">
        Cut-graph and oriented surface definitions:{' '}
        <a href="https://jeffe.cs.illinois.edu/pubs/schema.html" target="_blank" rel="noreferrer">
          Erickson and Har-Peled (2004), §§1–2.1
        </a>
        . Presets, corner-fan splitting and validation are project implementations; minimum-cut
        optimization is not implemented.
      </p>
      <div className="inline-actions">
        <button
          type="button"
          onClick={() =>
            download(
              referencesBibtex(['erickson2004cut']),
              'surface-cuts.bib',
              'application/x-bibtex'
            )
          }
        >
          Cut citation BibTeX
        </button>
        <button
          type="button"
          onClick={() =>
            download(
              JSON.stringify(referencesCSL(['erickson2004cut']), null, 2),
              'surface-cuts-csl.json',
              'application/json'
            )
          }
        >
          Cut citation CSL JSON
        </button>
      </div>
    </div>
  );
}
