# Data contract v1

`src/core/types.ts` is the single shared compile-time interface. The core must not import browser/UI/Three.js code.

Lengths are meters; display and editable values are millimeters. Angles in parameters are degrees. Surface size is side length for plane/cube/saddle and diameter for sphere. Coordinates are right-handed, Z-up. A plane occupies XY with +Z normal. Surfaces are centered at the origin.

`SurfaceSpec.revision` changes when scientific geometry changes. Guide samples retain surface revision, analytic patch UV, and (when picked) triangle ID/barycentric coordinates. Existing guides/results are invalidated when the geometry changes; camera changes do not change scientific state.

Graph nodes/edges/cells have stable string IDs. Cell node order is oriented; edges retain adjacent cell IDs. Render-only crossings are not adjacency. Shared cube patch edges are canonical shared graph entities, not duplicate coincident nodes. Sphere uses a cubical atlas, sharing seams and reporting extraordinary vertices; this is our engineering extension, not a result of Oval et al.

The representation separates base surface, coarse patches/template choice, subdivision density, resulting graph, pattern transformation, and embedding. Keep source cell references in transformed cells. Pattern families are geometric networks, not yarns, loops, machine instructions, or mechanical tensors.

Core public modules:

- `surfaces.ts`: `evaluateSurface(surface, patch, u, v): Vec3`, `projectToSurface(surface, position, patch?): { position: Vec3; attachment: SurfaceAttachment }`, `buildSurfaceMesh(surface, resolution?): SurfaceMesh`, plus documented analytic helpers.
- `generate.ts`: `generatePattern(input: GenerationInput, context?: GenerationContext): GenerationResult`. Preconditions and unsupported cases throw descriptive errors. Progress callbacks report stages; cancellation may throw a named `AbortError`. The browser worker wrapper also terminates jobs to ensure cancellation.
- `diagnostics.ts`: graph validation/statistics callable independently for loaded or imported graphs.
- Shared type changes must preserve the versioned serialization contract and its regression checks.

Viewer public component: `src/viewer/SurfaceViewer.tsx` default export. Props are defined in `src/viewer/types.ts`. Responsibilities include rotate/draw/select interactions, surface display, graph, guides, overlays, node/cell selection, camera fit/presets, and screenshot capture. Project history and application controls remain outside the viewer.

Project JSON saves schema version, explicit surface/graph/guide state, parameters, units by schema, seeds, provenance, and numerical diagnostic definitions/results. Restore from validated bounded data; reject nonfinite/unsupported data. UI history snapshots preserve IDs and semantics. Camera/overlays stay outside scientific project state.

Schema v1 downloads also include an optional supplementary `methodRecord`: software version, accepted algorithm/input signature, generating parameters, separately recorded pending parameters, qualified method wording and selected bibliography (including BibTeX and CSL-JSON). It describes the accepted graph when one exists and labels input-only projects explicitly. Imported records are informational, not trusted scientific state; export recomputes the record from validated project data. Older schema v1 projects remain readable. The minimal inputs-only autosave fallback omits this derived record to conserve quota; restored projects recreate it on export. Citation metadata never changes graph connectivity, coordinates or numerical results. Newly generated provenance notes summarize guide input counts. If editable guides differ from those that produced a stale graph, the input signature identifies the accepted inputs but cannot reconstruct the original stroke geometry; retain the original input project or regenerate for reproducibility.

Browser worker messages carry request ID and input revision. The app checks them against the active request and compares the scientific input signature with the current inputs. The history reducer checks the signature again before accepting a result; renaming a project does not invalidate an otherwise current computation. Old results remain visible during generation on unchanged geometry; stale result status is clearly visible. Failed/cancelled jobs preserve the previous accepted graph.

Scientific claims: topology validity, geometric quality, design intent, and physical validation remain distinct. Target spacing is a request; edge arc lengths and relative RMS error measure achieved geometric spacing. Quad strip consistency may require integer rounding. Record that deviation instead of promising uniformity.

## Imported geometry

`SurfaceSpec.kind = 'mesh'` requires an `ImportedMeshData` payload. Its centered, indexed triangle geometry uses meters; `source` records format, declared units, exact scale, original bounding-box midpoint and indexing policy. `size` is the maximum mesh extent, and `curvature` is zero. Analytic surfaces cannot contain mesh payloads. A geometry change to an analytic kind removes the imported data. Existing analytic schema v1 projects remain readable.

Imported surfaces without a selected valid mapping are inspection-only: generated graphs and guides must be absent. `mesh.uvs` optionally retains complete consistent raw OBJ coordinates (two per position). `surface.mapping = 'rectangular-obj-uv-v1'` selects a supplied chart, revalidated on load and before generation. Analytic evaluation/projection/path API names remain for compatibility but dispatch mapped meshes to the indexed piecewise-affine kernel. Mapped attachments use normalized UV, patch 0, source face ID and barycentric coordinates. Node identities remain those of the chart computation; coincident 3D locations do not weld them. Unmapped display UV zeros remain placeholders. Source triangle indices refer to the post-triangulation ordering.

`src/import/mesh.ts` contains pure bounded parsing, payload validation and local diagnostics, with no React, DOM or Three.js dependency. Import and saved-mesh analysis run in separate cancellable workers. Import jobs carry job ID and project revision; cancellation, revision changes and superseded results cannot replace the active project. Only locally recomputed reports enter the session cache; serialized diagnostics are not trusted. History accounts for distinct imported geometry as well as generated graphs in its resource budget. See [imported surface contract and limits](imported-surfaces.md).

## Supplied rectangular chart generation

Topology, fitting and graph transformations are computed on a unit chart plane before node-wise embedding. Physical strip counts use mapped coarse-edge lengths; normalized-UV guide/relaxation diagnostics are separate from physical path spacing. Canonical stored edge paths include source-triangle crossings and are checked on restore, bounded to 1024 points per edge and two million total. Nondegenerate cell UV orientation/Jacobians and rectangle boundary coverage supplement the existing local and combinatorial checks. No global 3D intersection or exact-predicate bijection certificate is claimed. See [mapped surface semantics](mapped-surfaces.md).

Immutable imported assets can reuse a content fingerprint for UI freshness; mutable callers and structured worker clones compute the same fingerprint convention without assuming a cached unchanged payload. These fingerprints remain noncryptographic UI guards. History budgets include both source meshes and resulting graphs. Chart validation and interactive import/generation use workers; bounded JSON parsing and initial restoration still perform synchronous checks, and rendering builds a cached numerical index for the active immutable support. Maximum-input responsiveness is not certified.

## Knit program

Shape mode supports the plane, saddle and supplied rectangular OBJ charts, with a selectable start edge and user-measured loop dimensions. Course and loop generation is adapted from Popescu (2019), §§5.2 and 6.2; distance-field construction, monotone alignment and needle placement are project adaptations. Short rows, increases and decreases are recorded with surface provenance. Results with unresolved required shaping steps remain inspectable, but BMP and Knit Grammar JSON export is blocked. These geometric predictions are not physical simulations or machine-ready programs.

`ProjectState.knit` (optional) holds the knit settings: mode, key, assignments of network elements to structures, the automatic-transfer switch, check limits and lab-rule switches. `ProjectState.swatches` (optional) is the measurement table. It stores, per structure, stitch width and course height in meters (mm in the UI), with date, gauge, yarn, stitch length and note as entered.

Neither field enters the scientific input signature, so changing them never makes the accepted graph stale. Schema v1 projects without them remain readable, and both fields are validated on load. The program itself is derived from the current surface, knit settings and measurements, together with the accepted graph and validated cut where the selected mode requires them; it is not stored. Shape mode on open surfaces does not require a network. The program covers grid cells, provenance and checks.

Grid: needle j runs left to right, and pass 1 is the bottom row. Every program cell records its source (graph cell, edge, node, automatic transfer or background), so provenance works in both directions.

`src/knit/` is pure and depends only on core types. Files:

- a 24-bit BMP with exact key RGB, rows bottom-up, byte-identical to Knit Grammar's writer;
- `knit-grammar-pattern` JSON v1 with Knit Grammar's field set, at most 600 × 600;
- a measurement-table JSON with declared units;
- a text report.

Round trips are tested against fixtures written by Knit Grammar's own code.

Network and combined modes support the plane, saddle and supplied rectangular OBJ charts. Measured layouts reuse one course/loop mapping across modes; network-only output fills unused bitmap cells and reports the added passes. Typed network layouts use a rectangular UV grid and do not predict physical shape. Network assignments use original-chart cell containment and a local loop-scale metric for edge and node marks; these are sampled project mappings, not geodesic or material guarantees. User structure tiles are saved as bounded, immutable copies using known key operations; new copies do not inherit measurements. Required shaping or operation conflicts in combined mode block BMP and Knit Grammar JSON export. On a cube opened by a crease cut, measured modes use flat-net positions and `knit.startEdge` names the side of the net knitted first. On a sphere opened by a pole-to-pole cut, measured modes use latitude and the longitude from the cut; `knit.startEdge` `v0` puts needle 1 at the bottom pole and `v1` at the top pole. On both, typed sizes are not used and the coarse rule is not offered. The two-guide key works in every mode. Short rows hold both yarns; shaping that needs a transfer is reported as unresolved and blocks export, because the key has no transfer operation.

Optional `knit.tiles` stores at most 24 user structures, each at most 16 × 16 operations, with a unique ID, name, key ID and rows stored last-pass-first. Built-in structures remain unchanged.

Optional `knit.keys` stores at most 8 custom keys, each with at most 32 operations. A custom key is a copy of a class key, edited here or read from a Knit Grammar pattern JSON. Each operation has a unique ID, a unique exact RGB colour, one step per yarn guide (knit, tuck or float on the front or back bed) and, with one guide, an optional transfer after the stitch (to the other bed, left or right). `knit.keyId` names a class key or one of these. Structures, tiles, automatic transfers and shaping find operations by meaning; when the key has no operation with the needed meaning, the structure is unavailable, the transfer is skipped and reported, or the export is blocked. Class keys are unchanged.

Cube and sphere cut planning works on the accepted closed geometric cell network. Validation checks source manifold incidence and orientation, a connected cut tree, duplicated vertex fans, and a connected disk with one boundary and Euler characteristic 1. Seam-map JSON pairs the two copies of every cut edge with source identities and boundary directions. The cut step itself is topological. On a cube, a cut made only of whole crease lines can then be knitted from its exact flat net in 05 Knit program; the knit report lists the loops on both sides of every seam. On a sphere, a cut that runs from pole to pole and descends at every point can be knitted with pole-to-pole courses and short rows. Other cuts do not produce bitmaps. No sewing sequence is given, and paired seams may branch.

Optional `knit.cut` stores the source surface revision, a noncryptographic graph freshness signature, a preset label and unique source edge IDs. The cut complex and seam map are derived and revalidated; older schema-v1 projects remain readable.
