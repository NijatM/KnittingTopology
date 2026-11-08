/** Source-located teaching content. This is not a generator or a native symbol library. */
export const KNIT_WORKFLOW = [
  {
    title: 'Calibrate and orient',
    source:
      'Choose a knitting direction, start/end curves, loop width and course height for each patch. For a tensioned target, the thesis measures physical samples under biaxial tension in a locked state.',
    here: 'Enter your stitch width and course height and select a rectangular start edge, for the whole chart or for each computational patch. Optional calibration context records the state and test conditions of those measurements.',
    gap: 'Arbitrary curve pairs and a material or prestress model are absent; patches are a grid of split lines at constant u or v. Unspecified or relaxed measurements are not silently treated as tensioned calibration.',
    locator:
      '§6.2.1, pp. 97–99; §6.5, pp. 116–117 (including footnote 13); Appendix D, pp. 204–205',
  },
  {
    title: 'Construct courses and loops',
    source:
      'Sample contours by course height, connect boundary endpoints first, and choose adjacent-contour connections using direction and continuity. Resample course segments by loop width, then form the primal knit graph and its loop dual.',
    here: 'The default course method uses distance contours, boundary anchoring and monotone alignment; needle placement and symbolic parent-loop checks are project adaptations. An opt-in second method reconstructs the written connection rules for open surfaces: candidate search, primal faces and their loop dual. Shaping includes short rows and increases/decreases within the supported grammar; short-row turns are paired so each pass starts where the yarn is (project rule).',
    gap: 'The second method is reconstructed from the thesis text, not from compas_knit; where it leaves faces that are neither quads nor triangles, the thesis fixes them by editing; here a courses stage saved by a successful build can be edited, but a first build that leaves such faces stops with an error. A passed symbolic check does not establish geometric convergence, native machine feasibility or achieved fabric shape.',
    locator: '§§6.2.2–6.2.4, pp. 99–104; Figs. 6.4–6.12; shaping background §5.2, pp. 79–81',
  },
  {
    title: 'Edit and assemble patches',
    source:
      'Inspect and edit points and edges at intermediate stages, check connectivity and duplicates, save stages, and combine aligned patterns. Computational patches can outnumber fabricated pieces.',
    here: 'The course and loop stages are saved with the project and as stage files, with input fingerprints and connectivity and duplicate checks; stale stages and failed checks block operation export. The courses stage can be edited on the surface: vertices and links (connection-rules method) or course polylines and turns (project method); each edit is recorded and the layout is rebuilt and rechecked. In shape mode on open surfaces the chart can be split into a grid of computational patches, each with its own direction, loop size, course method and stages. Each shared edge is knitted through or a seam: patches linked by knitted-through edges form one piece with one bitmap (the join is a project construction), and seams get a seam map paired by position (project rule). Project saving, selection and specific cube/sphere cut-and-seam workflows exist.',
    gap: 'Loops-stage editing is absent; patch boundaries are full-length grid lines, not free curves. Joined pieces with separate arms in one band (a U, an arch or a ring) are blocked, and needle stops inside a piece need a cast-off in the lab software. The thesis gives no combining algorithm and does not develop automatic subdivision; KnitCandela patch combination still required some manual alignment.',
    locator: '§6.3, pp. 105–112; Figs. 6.13–6.17; §7.3.4, p. 153, footnote 9',
  },
  {
    title: 'Mark feature intent',
    source:
      'Use linked 3D/2D marks to locate channels, openings, pockets, inlays, material/tension changes and colour patterns. A mark can identify a region that needs a whole symbol cluster.',
    here: 'Feature zones mark intent. Optional guide-swap recipes apply to boundary-access channel/pocket rectangles on an unpatched, unshaped two-guide plane program. The body, join bands and access are inspectable; other cells stay unchanged. Unassigned zones change no operation.',
    gap: 'Arbitrary strokes, interior access holes, overlapping applied rectangles, curved/shaped recipes and projecting ribs are absent. Marks cannot yet be drawn on the 2D bitmap. A texture alone does not manufacture a feature.',
    locator: '§5.5, pp. 89–91; §6.3.2, p. 112; Fig. 6.19, p. 115',
  },
  {
    title: 'Expand operation symbols',
    source:
      'In the thesis machine software, zones identify guides and symbols specify operations. Symbols may combine yarn-fed knitting with yarn-free transfers; clusters span several positions. Colour is a design aid and can have different meanings in different regions.',
    here: 'The class-key bitmap uses fixed exact RGB meanings. Every program is also written as a machine-neutral operation sequence: symbols of ordered yarn-fed and yarn-free steps (knit, tuck, transfers straight or diagonal, same-bed moves, drops), clusters repeated over cells, and racking per pass. The class key converts to it without loss; symbols the key cannot say are refused and block export.',
    gap: 'The first recipes produce guide-swap clusters and retain their actual expanded sequence. No recipe yet produces drops, diagonal transfers or compound two-guide transfer symbols. Two-guide shaping transfers remain unsupported. Native symbols and their RGB codes cannot be inferred from source diagrams.',
    locator: '§6.4.1, pp. 113–115, footnotes 8–12; Fig. 6.18; Fig. 7.34g–k, p. 152',
  },
  {
    title: 'Check, knit and measure',
    source:
      'Generate operations in the native software, simulate carriage/guide movement, correct the design, and export the machine file. Knit and measure specimens in the intended supported and loaded state.',
    here: 'Design-level export is gated by unresolved operations. The symbolic executor follows live loops and guides. An opt-in shared-reference check gives the two logical layers distinct IDs and compares actual parents on supported open-surface Shape/combined programs. Its failures block operation export. A separate core checker tests explicit whole-stack transfer phases; no automatic schedule is inserted. None of these is a machine or fabric simulation.',
    gap: 'The lab machine, needle allocation, usable width, software and symbol library are unconfirmed. The thesis Libra/Model 9 setup is a historical example. Native compilation and physical validation remain downstream.',
    locator: '§6.4, pp. 112–115; §6.5, pp. 116–117; Chapters 7–8',
  },
] as const;

export const THESIS_SETTINGS = [
  [
    'Width / Height',
    'Computational loop width and course height. Current input dimensions represent one loop/pass.',
  ],
  [
    'Refinement',
    'Densifies computed contours; distinct from this project’s distance-grid resolution.',
  ],
  [
    'Result count',
    'Candidate connections per vertex in the source search. Used by the second course method (4–16, default 4); not a control on the default alignment.',
  ],
  [
    'Angle tolerance',
    'Allows a straighter continuation among similarly perpendicular candidate connections. Used by the second course method (0–45°, default 5°); not a control on the default alignment.',
  ],
  [
    'Spacing weft / warp',
    'Actual loops/courses within the computational width/height. These expand computational units, not the display aspect ratio.',
  ],
  [
    'Path',
    'Intermediate JSON storage location, not a machine setting. Here the stages are saved in the project file and as downloadable stage files.',
  ],
] as const;

export const THESIS_FEATURES = [
  {
    name: 'Basic stitches and shaping',
    status: 'Partial',
    text: 'Knit/tuck/float, held loops, short rows, increases/decreases and simplified one-guide transfers exist. General cast-on, cast-off, grafting and full native schedules are absent.',
    locator: '§5.2; Fig. 6.18; Appendices A.1–A.2',
  },
  {
    name: 'Compound and diagonal transfers',
    status: 'Represented',
    text: 'A diagonal opposite-bed transfer is not a same-bed lateral shift. The operation sequence represents diagonal transfers, multiple actions on both beds by one guide and yarn-free transfer sequences; the class key cannot write them, and no recipe produces them yet.',
    locator: '§6.4.1, pp. 113–114; Fig. 6.18',
  },
  {
    name: 'Two-layer features and dropped stitches',
    status: 'Missing recipes',
    text: 'Basic two-guide bed assignments exist. Knit-both-then-transfer and knit-both-then-drop-front are distinct compound symbols: the operation sequence can hold them and the executor follows the dropped loop, but the two-guide key cannot write them and no recipe produces them yet. Float is not drop.',
    locator: 'Fig. 7.34g–k, p. 152; §7.3.4, pp. 153–154',
  },
  {
    name: 'Channels, pockets and spacer layers',
    status: 'Bounded plane recipes',
    text: 'Guide-swap channel/pocket presets use separate bodies, join bands and declared panel-boundary access on compatible two-guide plane programs. Geometry, live layer parents and cross-bed yarn paths are checked. These finite schedules are project constructions. Interior openings, curved/shaped recipes and spacer connections remain absent; no physical closure or usable dimension is certified.',
    locator: '§5.1.3, pp. 77–79; §5.5, pp. 89–91; Fig. 6.19, p. 115',
  },
  {
    name: 'Projecting ribs, tubes and branches',
    status: 'Missing recipes',
    text: 'Need carriage direction, holding, bed switching and finishing. The 1 × 1 rib, 2 × 2 rib and tubular structures are textures, not complete architectural rib or branching schedules. Bed occupancy constrains the rib examples.',
    locator: '§§5.3–5.4, pp. 81–87; Appendix A, pp. 181–192',
  },
  {
    name: 'Racking, inlays and local settings',
    status: 'Missing',
    text: 'Require explicit rack/insert/material paths, equipment support and calibrated machine settings. Recording a tension or speed in a swatch does not issue a command.',
    locator: '§5.5, pp. 89–91; §6.5, pp. 116–117',
  },
] as const;

export const KNIT_METHOD_WORDING =
  'Course and loop construction is adapted from Popescu (2019), KnitCrete, §§5.2 and 6.2. Distance-field construction, monotone alignment, needle placement and symbolic operation checks are project adaptations. Optional plane channel/pocket presets follow the layer-connection principles of §5.5; their finite band schedules and symbolic layer/yarn-path checks are project constructions. The thesis’s complete patch-editing workflow, full feature library and native symbol compiler are not reproduced. Optional swatch context records user-reported measurement conditions following §6.5; it is not a material model or physical validation. DOI: https://doi.org/10.3929/ethz-b-000408640';
