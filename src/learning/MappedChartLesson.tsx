import { useState } from 'react';
import type { PatternParameters, SurfaceSpec } from '../core/types';
import { checkRectangularUV, evaluateMappedSurface } from '../import/uv-mapping';
import { download } from '../adapters/export';
import { formatCitation, referencesBibtex, relevantReferenceIds } from './citations';
import { REFERENCES } from './references';

/** Original interactive illustration, evaluated against the active supplied chart. */
export default function MappedChartLesson({
  surface,
  parameters,
}: {
  surface: SurfaceSpec;
  parameters: PatternParameters;
}) {
  const [u, setU] = useState(0.25),
    [v, setV] = useState(0.35);
  if (!surface.mesh || surface.mapping !== 'rectangular-obj-uv-v1') return null;
  const report = checkRectangularUV(surface.mesh);
  const sample = evaluateMappedSurface(surface, u, v),
    face = sample.attachment.faceId!;
  const triangle = surface.mesh.indices.slice(face * 3, face * 3 + 3);
  const low = report.boundsMin!,
    high = report.boundsMax!;
  const uv = triangle.map((i) => [
    (surface.mesh!.uvs![2 * i]! - low[0]) / (high[0] - low[0]),
    (surface.mesh!.uvs![2 * i + 1]! - low[1]) / (high[1] - low[1]),
  ]);
  const point = (x: number, y: number) => `${15 + 150 * x},${165 - 150 * y}`;
  return (
    <section
      className="learning-panel"
      data-testid="mapped-chart-lesson"
      aria-label="Supplied UV mapping lesson"
    >
      <span className="learning-kicker">SUPPLIED CHART / NORMALIZED UV</span>
      <h2>Understand this mapping</h2>
      <p>
        The OBJ supplies a rectangle chart. Its coordinates are normalized independently to [0,1]²;
        no unwrap is computed.
      </p>
      <ol>
        <li>
          Screen a clean, oriented disk, positive UV triangles and a boundary covering the rectangle
          once.
        </li>
        <li>Use physical mapped coarse-edge lengths to assign compatible integer strip counts.</li>
        <li>Construct, fit and transform the network in normalized UV space.</li>
        <li>Embed nodes barycentrically and split paths at source-triangle crossings.</li>
        <li>Inspect measured physical spacing and chart distortion.</li>
      </ol>
      <figure className="learning-diagram">
        <svg viewBox="0 0 180 180" role="img" aria-label="Active chart barycentric locator">
          <rect x="15" y="15" width="150" height="150" fill="none" stroke="#777" />
          <polygon points={uv.map(([x, y]) => point(x!, y!)).join(' ')} fill="#444" stroke="#ccc" />
          <circle cx={15 + 150 * u} cy={165 - 150 * v} r="3" fill="#d09a4e" />
        </svg>
        <figcaption>
          Normalized rectangle and the located source triangle. This illustrates the active support
          chart; it does not change your project.
        </figcaption>
      </figure>
      <label className="learning-topic">
        Explore u{' '}
        <input
          aria-label="Explore chart u"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={u}
          onChange={(e) => setU(Number(e.target.value))}
        />
      </label>
      <label className="learning-topic">
        Explore v{' '}
        <input
          aria-label="Explore chart v"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
      </label>
      <p>
        UV ({u.toFixed(2)}, {v.toFixed(2)}) · triangle {face}
      </p>
      <p>
        Barycentric weights: {sample.attachment.barycentric!.map((x) => x.toFixed(4)).join(', ')}.
        Position = b₀P₀ + b₁P₁ + b₂P₂.
      </p>
      <p>World position (mm): [{sample.position.map((x) => (x * 1000).toFixed(4)).join(', ')}].</p>
      <details className="learning-details">
        <summary>Meaning and limits</summary>
        <p>
          Boundary and orientation conditions are informed by Lipman’s Theorem 1. Our floating-point
          screen is not an exact bijectivity certificate or a 3D intersection test.
        </p>
        <p>
          Guides, orientation and smoothing operate in normalized UV. Distortion changes physical
          angles and spacing. Paths are images of straight UV segments, not shortest geodesics.
          Severe folds and some density/operator combinations can fail local validity checks.
        </p>
      </details>
      <p className="learning-full-reference">{formatCitation(REFERENCES.lipman2014)}</p>
      <div className="learning-reference-links">
        <a href={REFERENCES.lipman2014.url} target="_blank" rel="noreferrer">
          Lipman: primary source ↗
        </a>
        <a href={REFERENCES.lipman2014.pdfUrl} target="_blank" rel="noreferrer">
          Public preprint · Theorem 1 ↗
        </a>
      </div>
      <p className="learning-verification">{REFERENCES.lipman2014.verificationNote}</p>
      <button
        onClick={() =>
          download(
            referencesBibtex(relevantReferenceIds(parameters, surface)),
            'mapped-method-references.bib',
            'application/x-bibtex'
          )
        }
      >
        Download current method references
      </button>
    </section>
  );
}
