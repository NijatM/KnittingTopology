/** Source-located teaching content. This is not a generator or a native symbol library. */
export const KNIT_WORKFLOW = [
  {
    title: 'Calibrate and orient',
    source:
      'Choose a knitting direction, start/end curves, loop width and course height for each patch. For a tensioned target, the thesis measures physical samples under biaxial tension in a locked state.',
    here: 'Enter your stitch width and course height and select a rectangular start edge. Optional calibration context records the state and test conditions of those measurements.',
    gap: 'Arbitrary curve pairs, per-patch directions and a material or prestress model are absent. Unspecified or relaxed measurements are not silently treated as tensioned calibration.',
    locator:
      '§6.2.1, pp. 97–99; §6.5, pp. 116–117 (including footnote 13); Appendix D, pp. 204–205',
  },
  {
    title: 'Construct courses and loops',
    source:
      'Sample contours by course height, connect boundary endpoints first, and choose adjacent-contour connections using direction and continuity. Resample course segments by loop width, then form the primal knit graph and its loop dual.',
    here: 'Distance contours, boundary anchoring, monotone alignment, needle placement and symbolic parent-loop checks are project adaptations. Shaping includes short rows and increases/decreases within the supported grammar.',
    gap: 'The original candidate search and editable primal face graph are not reproduced. A passed symbolic check does not establish geometric convergence, native machine feasibility or achieved fabric shape.',
    locator: '§§6.2.2–6.2.4, pp. 99–104; Figs. 6.4–6.12; shaping background §5.2, pp. 79–81',
  },
  {
    title: 'Edit and assemble patches',
    source:
      'Inspect and edit points and edges at intermediate stages, check connectivity and duplicates, save stages, and combine aligned patterns. Computational patches can outnumber fabricated pieces.',
    here: 'Project saving, selection and specific cube/sphere cut-and-seam workflows exist. Knit results are derived from inputs rather than saved as editable intermediate graphs.',
    gap: 'General knit graph editing, patch interfaces and assembly are absent. The thesis itself does not develop automatic subdivision; KnitCandela patch combination still required some manual alignment.',
    locator: '§6.3, pp. 105–112; Figs. 6.13–6.17; §7.3.4, p. 153, footnote 9',
  },
  {
    title: 'Mark feature intent',
    source:
      'Use linked 3D/2D marks to locate channels, openings, pockets, inlays, material/tension changes and colour patterns. A mark can identify a region that needs a whole symbol cluster.',
    here: 'Linked surface/bitmap inspection and network-to-structure assignments exist. Class keys and user tiles describe a limited set of operation meanings.',
    gap: 'A textured edge is not a fabricated channel or rib. Separate semantic feature zones and verified layer-aware recipes are needed before those features can be generated.',
    locator: '§5.5, pp. 89–91; §6.3.2, p. 112; Fig. 6.19, p. 115',
  },
  {
    title: 'Expand operation symbols',
    source:
      'In the thesis machine software, zones identify guides and symbols specify operations. Symbols may combine yarn-fed knitting with yarn-free transfers; clusters span several positions. Colour is a design aid and can have different meanings in different regions.',
    here: 'The class-key bitmap uses fixed exact RGB meanings. One-guide moves and two-guide knit/tuck/float actions are a smaller language. Two-guide shaping transfers remain unsupported and block operation export.',
    gap: 'Diagonal opposite-bed transfers, drops, multiple bed actions per guide and compound two-guide transfer sequences need a richer representation. Neither native symbols nor their RGB codes can be inferred from source diagrams.',
    locator: '§6.4.1, pp. 113–115, footnotes 8–12; Fig. 6.18; Fig. 7.34g–k, p. 152',
  },
  {
    title: 'Check, knit and measure',
    source:
      'Generate operations in the native software, simulate carriage/guide movement, correct the design, and export the machine file. Knit and measure specimens in the intended supported and loaded state.',
    here: 'Design-level BMP/Knit Grammar export is gated by unresolved required operations. Symbolic checks and the input surface with computed placement are inspectable; neither is a fabric simulation.',
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
    'Candidate connections per vertex in the source search. Not a control on the current monotone DP.',
  ],
  [
    'Angle tolerance',
    'Allows a straighter continuation among similarly perpendicular candidate connections. Not implemented by the current matcher.',
  ],
  [
    'Spacing weft / warp',
    'Actual loops/courses within the computational width/height. These expand computational units, not the display aspect ratio.',
  ],
  ['Path', 'Intermediate JSON storage location, not a machine setting.'],
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
    status: 'Missing',
    text: 'A diagonal opposite-bed transfer is not a same-bed lateral shift. Multiple actions on both beds by one guide, and yarn-free transfer sequences, exceed the current key language.',
    locator: '§6.4.1, pp. 113–114; Fig. 6.18',
  },
  {
    name: 'Two-layer features and dropped stitches',
    status: 'Missing recipes',
    text: 'Basic two-guide bed assignments exist. Knit-both-then-transfer and knit-both-then-drop-front are distinct compound symbols, absent from the current two-guide key. Float is not drop.',
    locator: 'Fig. 7.34g–k, p. 152; §7.3.4, pp. 153–154',
  },
  {
    name: 'Channels, pockets and spacer layers',
    status: 'Missing recipes',
    text: 'Require separately knitted layers and controlled joins/openings or pile/tuck connections. A colour region is feature intent until expanded into a verified sequence.',
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
  'Course and loop construction is adapted from Popescu (2019), KnitCrete, §§5.2 and 6.2. Distance-field construction, monotone alignment, needle placement and symbolic operation checks are project adaptations. The thesis’s complete patch-editing workflow, feature recipes and native symbol compiler are not reproduced. Optional swatch context records user-reported measurement conditions following the calibration concerns in §6.5; it is not a material model or physical validation. DOI: https://doi.org/10.3929/ethz-b-000408640';
