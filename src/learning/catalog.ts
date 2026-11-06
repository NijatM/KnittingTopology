import type { PatternFamily, PatternParameters, TopologyPreset } from '../core/types';
import type { LearningExample, LessonId, MethodLesson, SourceUse } from './types';

const pipeline: SourceUse = {
  id: 'oval2018',
  locator: '§2, pp. 345–346; §3.2, pp. 348–349 (final proceedings pagination)',
  relationship:
    'Source for separating coarse topology, strip density, pattern and geometry. The presets and analytic atlases here are project-authored.',
};
const operators = (letter: string): SourceUse[] => [
  {
    id: 'hart',
    locator: `Basics; Operations, ${letter} entry`,
    relationship:
      'Connectivity definition and notation credited to John Conway. Surface placement and boundary rules here are project adaptations.',
  },
  {
    id: 'oval2018',
    locator: '§3.2, pp. 348–349; Fig. 6, p. 349 (final proceedings pagination)',
    relationship:
      'Precedent for transforming a densified surface mesh; not a verification of this implementation.',
  },
];

function example(
  family: PatternFamily = 'quad',
  preset: TopologyPreset = 'regular',
  sphere = false
): LearningExample {
  return {
    name: sphere ? `Closed sphere · ${family}` : `Plane · ${preset} · ${family}`,
    surface: sphere ? 'sphere' : 'plane',
    size: 0.12,
    parameters: {
      strategy: 'patch-grid',
      preset,
      family,
      spacing: 0.03,
      orientation: 0,
      guideStrength: 0,
      relaxation: 0,
      seed: 7,
      patchSides: 4,
      boundaryCounts: [4, 4, 4, 4],
      variant: 0,
      stripOverrides: {},
    },
  };
}

export const LESSONS: MethodLesson[] = [
  {
    id: 'quad',
    title: 'Quad · the base network',
    group: 'patterns',
    status: 'project template',
    summary:
      'Keep the generated four-sided cells. This is the baseline for comparing every transformation.',
    changes: [
      'Keeps the dense network’s nodes, edges and cells.',
      'Density changes cell counts; orientation fitting changes geometry without choosing a new topology.',
    ],
    steps: [
      'Choose a coarse topology.',
      'Give opposite edges compatible integer subdivisions.',
      'Fill the coarse quads, fit the geometry, and retain the resulting cells.',
    ],
    assumptions: [
      'The chosen construction must be supported.',
      'A quad has four ordered boundary vertices; its sides need not have equal length.',
    ],
    limitations: [
      'A quad mesh is not a knitted stitch graph.',
      'Target spacing is a request; curvature and integer subdivision can produce different edge lengths.',
    ],
    experiment: {
      title: 'Count a simple grid',
      example: example(),
      instructions: [
        'Load the example, then press Generate.',
        'Inspect cell counts and mean edge length.',
        'Reduce target spacing from 30 mm to 15 mm and regenerate.',
      ],
      expected:
        'The 120 mm plane starts with 16 quads, 25 vertices and 40 edges. Halving spacing gives 64 quads; it changes density, not the surface.',
    },
    references: [pipeline],
    wording:
      'We retained the densified quad network. The topology–density–pattern–geometry separation is informed by Oval et al. (2018); the selected coarse preset is project-authored.',
  },
  {
    id: 'dual',
    title: 'Dual · exchange faces and vertices',
    group: 'patterns',
    status: 'adapted operator',
    summary: 'Put a vertex inside each old face and form new cells around old vertices.',
    changes: [
      'Old faces become new vertices.',
      'Old vertex neighborhoods become new cells; irregular old vertices therefore affect new face sizes.',
    ],
    steps: [
      'Place surface-attached face centers.',
      'Walk the incident cells around each old vertex.',
      'Connect their centers in that order; close open boundary regions with the project’s clipping rules.',
    ],
    assumptions: [
      'Cell incidence and orientation must be consistent.',
      'The closed-polyhedron definition differs from a boundary-clipped surface implementation.',
    ],
    limitations: [
      'Open dual cells include boundary points and edge midpoints.',
      'Cube dual is applied chart by chart to retain creases; global dual identities are not guaranteed for this adaptation.',
    ],
    experiment: {
      title: 'Compare closed face and vertex counts',
      example: example('dual', 'regular', true),
      instructions: [
        'Generate the example and note its face and vertex counts.',
        'Switch to quad and regenerate on the same sphere.',
        'Compare old faces with dual vertices, and old vertices with dual faces.',
      ],
      expected:
        'For this closed sphere, the counts exchange. Both graphs remain connected with Euler characteristic 2. The adaptation on an open plane has different boundary bookkeeping.',
    },
    references: [
      {
        id: 'hart',
        locator: 'Basics; Operations, d = dual',
        relationship:
          'Source for the closed-polyhedron dual connectivity definition. Clipping and feature preservation here are project adaptations.',
      },
      pipeline,
    ],
    wording:
      'We applied a surface-embedded dual based on Conway notation as described by Hart (n.d.), with project-specific clipping on open boundaries and feature-preserving chart rules on the cube.',
  },
  {
    id: 'ambo',
    title: 'Ambo · build from edge midpoints',
    group: 'patterns',
    status: 'adapted operator',
    summary:
      'Create vertices on old edges, then build cells inside old faces and around old vertices.',
    changes: [
      'Each old edge supplies a new midpoint vertex on a closed surface.',
      'The result contains both face-centered and vertex-centered polygons.',
    ],
    steps: [
      'Share one midpoint identity per old edge.',
      'Connect consecutive midpoints inside each old face.',
      'Walk around each old vertex to fill its surrounding polygon.',
    ],
    assumptions: [
      'Neighboring cells must agree on shared edges.',
      'A closed surface uses the global operation; open surfaces need additional closure.',
    ],
    limitations: [
      'Open boundary regions are filled with project corner triangles.',
      'On the cube, chart clipping preserves creases; some concave vertex polygons are split along a checked positive-area diagonal.',
    ],
    experiment: {
      title: 'Follow the edge vertices',
      example: example('ambo', 'regular', true),
      instructions: [
        'Generate ambo on the sphere.',
        'Generate quad with the same settings and compare counts.',
        'Check that ambo vertices match the old edge count.',
      ],
      expected:
        'On this closed example, new vertices equal old edges and new faces equal old faces plus old vertices. These identities need not hold for the clipped cube or plane adaptation.',
    },
    references: operators('a = ambo'),
    wording:
      'We used a surface-embedded ambo operation following Conway notation (Hart, n.d.; Oval et al., 2018), with explicit project boundary and cube-crease adaptations.',
  },
  {
    id: 'kis',
    title: 'Kis · fan each face into triangles',
    group: 'patterns',
    status: 'adapted operator',
    summary: 'Add a center to every cell and connect it to each boundary vertex.',
    changes: [
      'Retains the original boundary edges of each cell.',
      'An n-sided cell becomes n triangles sharing a new center.',
    ],
    steps: [
      'Compute a center and attach it to the surface.',
      'Create one triangle for each old boundary edge.',
      'Share the original vertices and edges between neighboring fans.',
    ],
    assumptions: [
      'The center-to-boundary fan must give valid oriented cells.',
      'A surface-attached center is geometric placement, separate from the connectivity rule.',
    ],
    limitations: [
      'Triangles follow the support surface; they are not a claim of equal lengths or planar fabrication panels.',
      'Adding triangles does not establish material stiffness.',
    ],
    experiment: {
      title: 'Four triangles for each quad',
      example: example('kis', 'regular', true),
      instructions: [
        'Generate the sphere example.',
        'Compare it with quad at the same density.',
        'Inspect a cell and the count of triangles.',
      ],
      expected:
        'Each old quad gives four triangles and one new face-center vertex. The closed result remains connected with Euler characteristic 2.',
    },
    references: operators('k = kis'),
    wording:
      'We applied the kis connectivity operation described by Hart (n.d.) and used in surface-pattern exploration by Oval et al. (2018), placing the new centers on the analytic support surface.',
  },
  {
    id: 'gyro',
    title: 'Gyro · make oriented pentagons',
    group: 'patterns',
    status: 'adapted operator',
    summary:
      'Combine old vertices, face centers and oriented edge-third points into pentagonal cells.',
    changes: [
      'Each old edge has two shared third points.',
      'Orientation determines which third points join a face center and an old vertex.',
    ],
    steps: [
      'Place two ordered third points per old edge.',
      'Place one center per face.',
      'Use the oriented cell boundary to assemble pentagons.',
    ],
    assumptions: [
      'The source mesh is consistently oriented.',
      'Edge-third positions are projected onto the support surface; the connectivity and geometric realization are distinct.',
    ],
    limitations: [
      'Open boundary edges are split at thirds using explicit project rules.',
      'Pentagons need not be regular, planar, or equal in area.',
    ],
    experiment: {
      title: 'Check sides rather than appearance',
      example: example('gyro', 'regular', true),
      instructions: [
        'Generate the closed sphere example.',
        'Select several cells and count their ordered boundary vertices.',
        'Compare their shapes near atlas corners and face centers.',
      ],
      expected:
        'Each resulting cell has five vertices, while shapes and sizes vary. The graph remains connected; the pentagonal appearance does not imply a yarn path.',
    },
    references: operators('g = gyro'),
    wording:
      'We used a surface-embedded gyro connectivity operation following Conway notation (Hart, n.d.; Oval et al., 2018), with project-specific open-boundary handling.',
  },
  {
    id: 'diagonal',
    title: 'Diagonal · split cells without new centers',
    group: 'patterns',
    status: 'project template',
    summary: 'Triangulate each generated cell while retaining its boundary edges.',
    changes: [
      'Adds internal diagonals instead of face-center vertices.',
      'Keeps neighboring cells connected through their original shared edges.',
    ],
    steps: [
      'Keep each ordered cell boundary.',
      'For a quad, check both possible diagonals and choose a valid positive-area split.',
      'For other supported cells, use the project’s connected fan triangulation.',
    ],
    assumptions: [
      'The chosen split must produce nondegenerate oriented triangles.',
      'Generation rejects invalid output rather than accepting a visual crossing as adjacency.',
    ],
    limitations: [
      'This is the project’s triangulation, not a Conway operator.',
      'It is not the crossing-diagonal network sometimes also called a diagonal mesh.',
    ],
    experiment: {
      title: 'Compare kis with a diagonal',
      example: example('diagonal'),
      instructions: [
        'Generate the plane example.',
        'Compare its vertices and cells with quad.',
        'Switch to kis and compare the extra face-center vertices.',
      ],
      expected:
        'Sixteen quads become 32 triangles with the same 25 vertices. Kis instead introduces a center per old quad and produces four triangles per quad.',
    },
    references: [],
    wording:
      'We used the project’s edge-preserving positive-diagonal triangulation. It is distinct from crossing-diagonal networks and is not attributed to a Conway operator.',
  },
  {
    id: 'patch-quadrangulation',
    title: 'N-sided patch · constrained boundary counts',
    group: 'construction',
    status: 'paper-inspired subset',
    summary: 'Fill a supported planar polygon using explicit integer counts along its sides.',
    changes: [
      'Boundary counts set exact subdivisions for the base quad patch.',
      'Supported templates are a rectangle, a constrained central fan, and the triangular (2,1,1) single quad.',
    ],
    steps: [
      'Choose a plane and 3–6 sides.',
      'Enter boundary counts and choose a supported variant.',
      'Construct the available template, then inspect the generated base topology.',
    ],
    assumptions: [
      'Counts are integers from 1 to 64.',
      'The total boundary count must be even, but parity alone does not establish template support.',
      'Central fans require even counts with count[i] = count[i+2] cyclically.',
    ],
    limitations: [
      'N=2, general padding, full pattern enumeration and minimum-singularity selection are not implemented.',
      'Spacing and coarse preset do not replace the hard boundary counts.',
      'The (2,1,1) kernel includes an intentional straight boundary corner.',
    ],
    experiment: {
      title: 'Find the five-way center',
      example: {
        ...example(),
        name: 'Five-sided compatible central fan',
        parameters: {
          ...example().parameters,
          strategy: 'n-sided-patch',
          patchSides: 5,
          boundaryCounts: [6, 6, 6, 6, 6],
          variant: 1,
        },
      },
      instructions: [
        'Generate the five-sided example.',
        'Inspect its boundary counts and central extraordinary vertex.',
        'Change one count to 5, regenerate, and read the rejection without replacing the accepted result.',
      ],
      expected:
        'The supported case has six boundary segments per side and a central valence of five. An odd total cannot bound an all-quad disk; other even-total inputs can still be unsupported.',
    },
    references: [
      {
        id: 'takayama2014',
        locator: '§2, pp. 178–179; §2.2–2.3, pp. 179–181; §4, pp. 183–184',
        relationship:
          'Primary integer-pattern construction and its limits. This project independently authors a small incomplete subset; paper completeness guarantees do not transfer.',
      },
    ],
    wording:
      'We used an independently authored incomplete subset inspired by Takayama et al. (2014). We do not reproduce the full pattern family, general valid-input guarantee, or minimum-singularity selection.',
  },
  {
    id: 'coarse-topology',
    title: 'Coarse topology · decide connections before density',
    group: 'construction',
    status: 'project template',
    summary: 'A small quad complex specifies how regions connect before each region is subdivided.',
    changes: [
      'Coarse cells and their shared edges remain inspectable separately from the dense network.',
      'Opposite-edge strips collect compatible density parameters.',
    ],
    steps: [
      'Choose a project coarse preset.',
      'Group opposite edges through neighboring quads into strips.',
      'Assign integer subdivisions, densify, then embed and transform.',
    ],
    assumptions: [
      'Shared seams must share identities and compatible counts.',
      'Coarse topology, subdivision density and the support surface are distinct design choices.',
    ],
    limitations: [
      'The presets do not implement Oval’s medial-axis generation or editing grammar.',
      'Closed sphere/cube atlases and chart-local guidance are project extensions.',
      'Singularities and valid connectivity do not establish structural performance.',
    ],
    experiment: {
      title: 'Density versus connectivity',
      example: example('quad', 'inset'),
      instructions: [
        'Generate and show the coarse overlay.',
        'Halve spacing, regenerate and compare the coarse complex with the dense network.',
        'Then choose regular and compare the coarse connections.',
      ],
      expected:
        'Changing spacing refines the dense network while retaining the inset coarse complex. Changing preset changes that complex. Different rounded densities may also change measured spacing.',
    },
    references: [
      pipeline,
      {
        id: 'oval2018',
        locator: '§3.1, pp. 346–347; §4.2, pp. 352–353; §6, pp. 361–362 (final proceedings)',
        relationship:
          'Distinguishes the paper’s medial-axis/grammar method and stated closed-surface limitation from the project presets and atlases.',
      },
    ],
    wording:
      'The pipeline is informed by Oval et al. (2018). Our analytic-chart coarse presets and closed-surface assembly are project implementations, not reproductions of the paper’s medial-axis construction or grammar.',
  },
  {
    id: 'guides',
    title: 'Guides · softly fit geometry',
    group: 'guidance',
    status: 'project heuristic',
    summary:
      'Draw a direction on the surface to influence nearby edge alignment without changing connectivity.',
    changes: [
      'Blends local guide directions with an orientation field, treating quarter-turns as equivalent.',
      'Moves eligible nodes with a bounded positivity-checked fitting procedure.',
    ],
    steps: [
      'Draw samples attached to one surface chart.',
      'Compare guide tangents in the local surface tangent plane.',
      'Fit toward the nearest tangent or perpendicular while protecting boundaries and atlas seams.',
    ],
    assumptions: [
      'Samples must belong to the current surface revision.',
      'Only successive samples on the same chart contribute a guide segment.',
    ],
    limitations: [
      'Cross-chart segments are dropped and reported.',
      'Cube creases, boundary nodes and sphere atlas seams are pinned.',
      'A shared backtracking step can restrict motion on other charts; alignment and convergence are not guaranteed.',
      'The guide is not a stress direction or a yarn path.',
    ],
    experiment: {
      title: 'Turn guide influence off and on',
      example: {
        ...example(),
        name: 'Plane with an oblique direction guide',
        addDirectionGuide: true,
        parameters: { ...example().parameters, spacing: 0.015, guideStrength: 0.9 },
      },
      instructions: [
        'Load the guide example and generate.',
        'Set guide influence to zero and regenerate.',
        'Compare interior geometry while checking that node, edge and cell counts agree.',
      ],
      expected:
        'The guide can change interior alignment while the boundary and topology remain fixed. A visible improvement is a geometric observation, not an alignment guarantee.',
    },
    references: [],
    wording:
      'Direction fitting uses the project’s bounded chart-local cross-field heuristic. It is not an implementation of the cited patch-generation methods and does not infer stresses or textile construction.',
  },
];

const presetDetails: {
  id: TopologyPreset;
  title: string;
  summary: string;
  steps: string[];
  expected: string;
}[] = [
  {
    id: 'regular',
    title: 'Regular · start with one chart quad',
    summary: 'Use one coarse quad for each analytic surface chart.',
    steps: [
      'Create one quad per chart.',
      'Share adjacent chart edges on closed surfaces.',
      'Densify using compatible strips.',
    ],
    expected:
      'The plane has one coarse quad. Cube and sphere have six; their seams are shared graph identities, not duplicate overlapping lines.',
  },
  {
    id: 'inset',
    title: 'Inset · add an inner quad and a ring',
    summary: 'Replace each chart quad by an inner quad and four surrounding quads.',
    steps: [
      'Keep the original outer boundary.',
      'Add four inner corners.',
      'Connect inner and outer corners into five coarse quads.',
    ],
    expected:
      'The plane has five coarse quads. The ring changes coarse connections before density is assigned; it is not simply a denser regular grid.',
  },
  {
    id: 'alternating',
    title: 'Alternating · inset checkerboard cells',
    summary: 'Start with a 2×2 chart grid and inset two diagonally opposed cells.',
    steps: [
      'Split the chart into four quads.',
      'Inset the two selected checkerboard cells.',
      'Share their original boundaries with neighboring cells.',
    ],
    expected:
      'The plane has twelve coarse quads. Two regions have inner rings while their neighbors retain simpler connections.',
  },
  {
    id: 'radial',
    title: 'Radial · build two inset rings',
    summary:
      'Add two nested rings around an inner quad, without collapsing the center into a pole.',
    steps: [
      'Inset the original chart quad.',
      'Inset its inner quad once more.',
      'Retain the central quad and all ring boundaries.',
    ],
    expected:
      'The plane has nine coarse quads and a central quad, not a degenerate point pole. “Radial” describes this preset’s layout, not a stress solution.',
  },
];

for (const preset of presetDetails)
  LESSONS.push({
    id: `preset-${preset.id}`,
    title: preset.title,
    group: 'presets',
    status: 'project template',
    summary: preset.summary,
    changes: [
      'Changes coarse connectivity before subdivision.',
      'Keeps the analytic support surface unchanged.',
    ],
    steps: preset.steps,
    assumptions: [
      'Uses the patch-grid strategy; N-sided construction ignores presets.',
      'All shared coarse edges must receive compatible integer counts.',
    ],
    limitations: [
      'This named preset is project-authored, not a named pattern from Oval et al.',
      'Density rounding and geometric fitting can make cells unequal in size.',
      'The layout does not define knit loops, loads or material behavior.',
    ],
    experiment: {
      title: 'Inspect the coarse overlay',
      example: example('quad', preset.id),
      instructions: [
        'Generate the example and enable the coarse overlay.',
        'Count coarse cells separately from dense cells.',
        'Change spacing and regenerate while comparing the coarse overlay.',
      ],
      expected: preset.expected,
    },
    references: [pipeline],
    wording: `We used the project-authored ${preset.id} coarse template within a topology–density–pattern–geometry pipeline informed by Oval et al. (2018). The preset is not attributed to the paper’s medial-axis method.`,
  });

export function getLesson(id: LessonId): MethodLesson {
  const lesson = LESSONS.find((entry) => entry.id === id);
  if (!lesson) throw new Error(`Unknown method lesson: ${id}`);
  return lesson;
}

export function suggestedLesson(parameters: PatternParameters): LessonId {
  return parameters.strategy === 'n-sided-patch' ? 'patch-quadrangulation' : parameters.family;
}
