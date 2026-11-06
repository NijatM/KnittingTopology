import type { ReactNode } from 'react';
import type { ImportedMeshReport, SurfaceSpec, Vec3 } from '../core/types';
import type { ViewerSelection } from '../viewer/types';
import './import.css';

interface MeshInspectorProps {
  surface: SurfaceSpec;
  report: ImportedMeshReport;
  selection: ViewerSelection | null;
}
const quantity = (value: number) => {
  if (!Number.isFinite(value)) return 'Unavailable';
  if (value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) >= 1e9))
    return value.toExponential(5);
  return value.toLocaleString('en-US', { maximumFractionDigits: 5 });
};
const millimeters = (values: Vec3) => values.map((value) => quantity(value * 1000)).join(', ');
const count = (value: number) => value.toLocaleString('en-US');
function Metric({ label, value, units }: { label: string; value: ReactNode; units?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>
        {value}
        {units && <small>{units}</small>}
      </strong>
    </div>
  );
}

export default function MeshInspector({ surface, report, selection }: MeshInspectorProps) {
  const mesh = surface.mesh;
  if (surface.kind !== 'mesh' || !mesh) return null;
  const { statistics: stats } = report;
  const triangleText = selection?.kind === 'triangle' ? selection.id.replace(/^triangle:/, '') : '';
  const triangle = /^\d+$/.test(triangleText) ? Number(triangleText) : -1;
  const hasTriangle =
    Number.isSafeInteger(triangle) && triangle >= 0 && triangle < mesh.indices.length / 3;
  const triangleNodes = hasTriangle ? mesh.indices.slice(triangle * 3, triangle * 3 + 3) : [];
  const formatReference =
    mesh.source.format === 'obj'
      ? 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000507.shtml'
      : 'https://www.loc.gov/preservation/digital/formats/fdd/fdd000504.shtml';

  return (
    <section
      className="mesh-inspector"
      data-testid="mesh-inspector"
      aria-label="Imported surface inspection"
    >
      <div className="inspector-title">
        <span className="eyebrow">IMPORTED / INSPECTION ONLY</span>
        <h2>Triangle surface</h2>
        <p>
          Mesh connectivity and geometric measurements. This surface has no analytic UV atlas or
          quadrangulation mapping.
        </p>
      </div>
      <div className="mesh-scope" role="note">
        Geometry inspection does not establish fabric behavior, material properties, structural
        capacity or manufacturability.
      </div>

      <h3 className="subheading">
        Source <i />
      </h3>
      <dl className="mesh-source">
        <div>
          <dt>File</dt>
          <dd>{mesh.source.name}</dd>
        </div>
        <div>
          <dt>Format</dt>
          <dd>{mesh.source.format.toUpperCase()}</dd>
        </div>
        <div>
          <dt>Source units</dt>
          <dd>{mesh.source.unit}</dd>
        </div>
        <div>
          <dt>Scale to meters</dt>
          <dd>
            {quantity(mesh.source.scaleToMeters)} m / {mesh.source.unit}
          </dd>
        </div>
        <div>
          <dt>Recorded indexing</dt>
          <dd>
            {mesh.source.indexing === 'obj-indices'
              ? 'Declared OBJ indices'
              : 'STL exact-coordinate welding'}
          </dd>
        </div>
        <div>
          <dt>Original center offset (mm)</dt>
          <dd>[{millimeters(mesh.source.centerMeters)}]</dd>
        </div>
      </dl>
      <p className="mesh-explanation">
        The bounding-box midpoint was subtracted after unit conversion. Add the stored offset to
        centered coordinates to recover the original position in meters to floating-point precision.
        Shape scale is preserved. Source fields are recorded provenance; a saved project cannot
        authenticate the original file. Measurements are recomputed from stored geometry.
      </p>
      <a className="mesh-format-link" href={formatReference} target="_blank" rel="noreferrer">
        Library of Congress: {mesh.source.format === 'obj' ? 'OBJ' : 'STL'} format reference ↗
      </a>
      {mesh.source.notes.length > 0 && (
        <details className="mesh-source-notes">
          <summary>Stored import notes ({mesh.source.notes.length}; provenance unverified)</summary>
          <ul>
            {mesh.source.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </details>
      )}

      <h3 className="subheading">
        Geometric measures <i />
      </h3>
      <Metric label="Vertices" value={count(stats.vertices)} />
      <Metric label="Used vertices" value={count(stats.usedVertices)} />
      <Metric label="Triangles" value={count(stats.triangles)} />
      <Metric label="Incidence triangles" value={count(stats.incidenceTriangles)} />
      <Metric label="Triangulated area" value={quantity(stats.areaM2 * 1e6)} units="mm²" />
      <Metric label="Extent X" value={quantity(stats.extent[0] * 1000)} units="mm" />
      <Metric label="Extent Y" value={quantity(stats.extent[1] * 1000)} units="mm" />
      <Metric label="Extent Z" value={quantity(stats.extent[2] * 1000)} units="mm" />
      <dl className="mesh-source mesh-bounds">
        <div>
          <dt>Centered minimum (mm)</dt>
          <dd>[{millimeters(stats.boundsMin)}]</dd>
        </div>
        <div>
          <dt>Centered maximum (mm)</dt>
          <dd>[{millimeters(stats.boundsMax)}]</dd>
        </div>
      </dl>
      {stats.signedVolumeM3 !== null ? (
        <>
          <Metric
            label="Signed oriented volume"
            value={quantity(stats.signedVolumeM3 * 1e9)}
            units="mm³"
          />
          <p className="mesh-explanation">
            Algebraic sum for eligible closed, consistently oriented triangle incidence. The sign
            follows winding; disconnected shells may cancel. This does not establish an enclosed
            solid or physical material volume, and intersections are not tested.
          </p>
        </>
      ) : (
        <p className="mesh-explanation">
          Signed volume unavailable: at least one local closure, incidence, vertex-link, winding,
          duplicate or degenerate-triangle check fails. See Diagnostic evidence for the counts.
        </p>
      )}
      <p className="mesh-explanation">
        Area is the sum of unsigned triangle areas, including any duplicate or overlapping faces.
        These are geometric measurements in the chosen source scale.
      </p>

      <h3 className="subheading">
        Topology and orientation <i />
      </h3>
      <Metric label="Unique edges" value={count(stats.edges)} />
      <Metric label="Used-vertex components" value={count(stats.components)} />
      <Metric label="Boundary edges" value={count(stats.boundaryEdges)} />
      <Metric label="Non-manifold edges" value={count(stats.nonManifoldEdges)} />
      <Metric label="Non-manifold vertices" value={count(stats.nonManifoldVertices)} />
      <Metric label="Inconsistent edge winding" value={count(stats.inconsistentEdges)} />
      <Metric label="Degenerate triangles" value={count(stats.degenerateTriangles)} />
      <Metric label="Collapsed triangles" value={count(stats.collapsedTriangles)} />
      <Metric label="Duplicate triangles" value={count(stats.duplicateTriangles)} />
      <Metric label="Isolated vertices" value={count(stats.isolatedVertices)} />
      <Metric label="Euler V − E + F" value={count(stats.euler)} />
      <p className="mesh-explanation">
        Connectivity follows indexed vertex identity. Geometric crossings do not create adjacency.
        Isolated vertices are counted separately from used-vertex components, but included in Euler
        V − E + F. Repeated-index collapsed triangles are retained in the raw triangle count but
        excluded from incidence edges, links and F. Their used vertices remain in the component
        graph, possibly as singleton components. These counts do not establish genus or detect
        arbitrary triangle self-intersections.
      </p>

      <h3 className="subheading">
        Selected triangle <i />
      </h3>
      {hasTriangle ? (
        <div className="selection-card mesh-triangle" data-testid="mesh-triangle-selection">
          <span className="eyebrow">ZERO-BASED IMPORTED TRIANGLE INDEX</span>
          <code>{triangle}</code>
          <p>
            Index after polygon triangulation, not an OBJ face-record number. Ordered vertex indices
            and centered coordinates (mm):
          </p>
          <ol>
            {triangleNodes.map((node, index) => {
              const position: Vec3 = [
                mesh.positions[node * 3],
                mesh.positions[node * 3 + 1],
                mesh.positions[node * 3 + 2],
              ];
              return (
                <li key={index}>
                  <span>Vertex {node}</span>
                  <code>[{millimeters(position)}]</code>
                </li>
              );
            })}
          </ol>
        </div>
      ) : (
        <div className="empty-card compact">
          Select a triangle in the viewer.
          <span>Vertex indices and actual centered coordinates will appear here.</span>
        </div>
      )}

      <h3 className="subheading">
        Diagnostic evidence <i />
      </h3>
      {report.diagnostics.length === 0 && (
        <p className="mesh-explanation">No additional diagnostics.</p>
      )}
      {report.diagnostics.map((item) => (
        <details className={`diagnostic ${item.severity}`} key={item.id}>
          <summary>
            <span className="diagnostic-mark">
              {item.severity === 'error' ? '!' : item.severity === 'warning' ? '△' : '·'}
            </span>
            {item.label}
          </summary>
          <p>{item.message}</p>
          <small>Method: {item.method}</small>
          {item.value !== undefined && (
            <small>
              Value: {quantity(item.value)} {item.units}
            </small>
          )}
          {item.tolerance !== undefined && (
            <small>
              Tolerance: {quantity(item.tolerance)} {item.toleranceUnits ?? item.units}
            </small>
          )}
        </details>
      ))}
    </section>
  );
}
