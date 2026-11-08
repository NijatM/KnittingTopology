export interface KnitLayers {
  courses: boolean;
  topology: boolean;
  mesh: boolean;
  shaping: 'selected' | 'all' | 'off';
  /** Saved-stage display: course stage links or the loop stage. */
  graph: 'off' | 'courses' | 'loops';
}

export const DEFAULT_KNIT_LAYERS: KnitLayers = {
  courses: true,
  topology: true,
  mesh: false,
  shaping: 'selected',
  graph: 'off',
};

export default function KnitInspection({
  layers,
  hasCourses,
  shapingApplied,
  hasGraph,
  onChange,
}: {
  layers: KnitLayers;
  hasCourses: boolean;
  shapingApplied: boolean;
  hasGraph: boolean;
  onChange: (next: KnitLayers) => void;
}) {
  return (
    <section className="knit-inspection" aria-label="Knit inspection layers">
      <div className="knit-layer-controls">
        <strong>Target-surface inspection</strong>
        <button
          type="button"
          aria-label="Show knitting courses"
          aria-pressed={layers.courses}
          disabled={!hasCourses}
          onClick={() => onChange({ ...layers, courses: !layers.courses })}
        >
          {shapingApplied ? 'Courses' : 'Reference courses'}
        </button>
        <button
          type="button"
          aria-label="Show topology layer"
          aria-pressed={layers.topology}
          onClick={() => onChange({ ...layers, topology: !layers.topology })}
        >
          Topology
        </button>
        <button
          type="button"
          aria-label="Show surface mesh layer"
          aria-pressed={layers.mesh}
          onClick={() => onChange({ ...layers, mesh: !layers.mesh })}
        >
          Surface mesh
        </button>
        <label>
          Shaping marks
          <select
            aria-label="Shaping marks"
            value={layers.shaping}
            disabled={!hasCourses || !shapingApplied}
            onChange={(e) =>
              onChange({ ...layers, shaping: e.target.value as KnitLayers['shaping'] })
            }
          >
            <option value="selected">Selected only</option>
            <option value="all">All shaping marks</option>
            <option value="off">Hidden</option>
          </select>
        </label>
        <label>
          Knit graph
          <select
            aria-label="Knit graph layer"
            value={hasGraph ? layers.graph : 'off'}
            disabled={!hasGraph}
            onChange={(e) => onChange({ ...layers, graph: e.target.value as KnitLayers['graph'] })}
          >
            <option value="off">Hidden</option>
            <option value="courses">Courses stage</option>
            <option value="loops">Loops stage</option>
          </select>
        </label>
      </div>
      <div className="knit-layer-legend" aria-label="Knit layer legend">
        {hasCourses && (
          <span>
            <i className="legend-course" />
            Cyan: {shapingApplied ? 'computed courses' : 'reference courses; shaping not applied'}
          </span>
        )}
        <span>
          <i className="legend-topology" />
          Grey: topology
        </span>
        <span>
          <i className="legend-selection" />
          Amber: selected course / element or start edge; white: pointed loop
        </span>
        {layers.mesh && <span>Surface mesh: faint triangulation</span>}
        {hasCourses && shapingApplied && layers.shaping !== 'off' && (
          <span>Marks: blue turns · green increases / new edge loops · gold decreases</span>
        )}
        {hasGraph && layers.graph !== 'off' && (
          <span>
            Knit graph: violet weft (course) edges · teal warp edges
            {layers.graph === 'loops'
              ? ' · loops: violet plain, blue short-row ends, green increases, gold decreases'
              : ''}
          </span>
        )}
        {!hasCourses && <span>No computed courses in this typed network bitmap.</span>}
      </div>
      <p>Input surface with computed placement. Fabric shape is not simulated.</p>
    </section>
  );
}
