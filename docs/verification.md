# Verification record

This record reports executed checks. The numerical implementation, project semantics, browser interactions, and production subpath are checked separately. No textile/material experiment or structural/manufacturing validation is claimed.

## Executable checks

```sh
npm run typecheck
npm test
npm run build
npm run test:browser
```

Core checks are in `tests/core/generation.test.ts`. They include analytic fixtures, oriented incidence and manifold links, closed cube/sphere seams and Euler characteristic, adjusted boundary valence, quad degree deficit, anisotropic strips, actual graph transformations, compatible patch counts/unsupported cases, real guide response/reversal, cancellation hooks, and sphere edge/refinement behavior.

Project checks in `tests/app/project.test.ts` cover scientific state and graph/strip round-trip, monotone history revisions, stale-job rejection, geometry attachment invalidation, malformed input rejection, and explicit OBJ/SVG semantics. JSON canonicalizes signed zero; stable graph identities/connectivity and numeric geometry are the relevant preservation contract.

Browser tests use isolated Playwright contexts and installed Chrome. Software WebGL is a reproducible test fallback; it does not establish performance or rendering on every GPU. PNG screenshots are QA artifacts under ignored `tmp/qa/`, not scientific validation. Safari is not included in the completed browser test coverage.

## Scientific limits

- This is a declared template subset, not a full implementation of either paper.
- Boundary and chart constraints can prevent requested guide alignment. Diagnostics state achieved error.
- Integer strip densities and transformed families do not ensure uniform spacing or equal feature/material budgets.
- Nondegeneracy, local Jacobians, incidence, orientation and vertex links are checked. No complete global self-intersection certificate is provided.
- Sphere/cube paths have their documented analytic/piecewise interpretation; saddle path lengths use sampling.
- Hardware GPU matrices, physical mobile touch devices, and manual assistive-technology testing remain outside the automated coverage.
- GitHub Pages compatibility is verified against a local production build and subpath. An actual remote deployment requires the user's later Git/publication actions.

## Earlier workspace baseline — 6 November 2026

- **135/135 unit tests passed:** 104 numerical/core tests and 31 project/history/persistence tests; final run 16.73 seconds.
- Type checking and the static production build passed. Lazy viewer loading reduced the initial JavaScript bundle to 288.33 kB (90.45 kB gzip); the separate viewer chunk is 577.24 kB (145.35 kB gzip). Fonts and the ES-module worker are bundled locally.
- **7/7 browser tests passed against development** in 56.1 seconds and **7/7 against the production build** in 55.5 seconds, with zero page or console errors.
- An additional native Metal production check recorded 17 requests, three worker-JS requests, four font requests, and seven scripts. There were no failed requests, external requests, or requests outside `/KnittingTopology/`.
- At mobile width 375, document and body width both remained 375. This is resized-browser coverage, not physical touch-device certification.
- Native WebGL2 used the Apple M2 Pro Metal renderer with no context loss. Software WebGL and native screenshots were visually inspected. Display-only radial bias fixes sphere line visibility without changing picking/export/diagnostic coordinates.
- Camera top/orbit transforms retained Z-up, unit rotation determinant within 5e-8, finite matrices, and unchanged camera distance in the targeted probe.

The [machine-readable results](verification-results.json) distinguish the latest regression checks from historical native-GPU/network probes. The [source fingerprint manifest](verification-manifest.json) identifies the current source snapshot; documentation-only changes do not imply rerunning every historical browser check. QA screenshots and browser reports remain under ignored `tmp/qa/production-*` and `tmp/qa/report/`.

Remaining numerical limitations are documented in `src/core/README.md`: declared incomplete patch-template coverage, chart-local guide fields with globally shared fitting backtracking, possible fail-closed rejection of unsupported/poor embeddings, no complete global intersection certificate, and sampled saddle path lengths. In N-sided mode, hard boundary counts determine density; any spacing deviation is a comparison to the stored reference spacing, not an enforced density target.

The recorded software checks do not establish material behavior, structural capacity, manufacturing feasibility, or correctness of a later remote deployment.

## Learn and Cite milestone — 6 November 2026

The new learning tests execute all 13 examples, verify closed-operator count identities, check guide connectivity preservation, validate generated teaching diagrams against real graph entities, and exercise citation selection. Project tests check accepted-versus-pending method records, optional supplementary metadata, unchanged graph round-trips and the minimal quota fallback. Browser tests add topic browsing without state mutation, actual diagram controls, qualified references, clipboard fallback, bibliography downloads, undoable example loading, accepted-versus-pending method descriptions and spacing consistency after cache restore and file import.

- **168/168 unit tests passed**: 104 core, 32 project/history/persistence and 32 learning/citation tests (17.27 seconds).
- Type checking, formatting and the production build passed. Initial JavaScript is 355.97 kB (112.69 kB gzip); the lazy viewer remains 577.24 kB (145.35 kB gzip).
- **11/11 browser tests passed against development** in 68.55 seconds and **11/11 against production** in 71.13 seconds, with no page or console errors. The production preview used `/KnittingTopology/`.

The teaching diagrams use bounded outputs of this implementation and are independent of the main viewport. Neither these diagrams nor a citation establishes reproduction of a paper or physical validity. Native-GPU/network probes above are historical baseline checks; this milestone uses isolated software-WebGL Chrome tests.

## Imported surface inspection milestone — 6 November 2026

- **252/252 unit tests passed** in 16.74 seconds: the preceding 168 checks plus 78 mesh-parser/diagnostic cases and six imported-project integration cases. Type checking and the production build passed.
- Import checks cover known plane/cube/tetrahedron measures, explicit unit scaling, preserved identities and offsets, large-offset centering, concave polygons and invalid boundaries, strict text ambiguity rejection, ASCII/binary STL discrimination, collapsed and collinear triangles, vertex links, orientation, duplicate/isolated/disconnected data, dimensional tolerance units, payload tampering and bounded triangulation work.
- Initial JavaScript is 377.56 kB (119.07 kB gzip), the lazy viewer 578.57 kB (145.69 kB gzip), the import worker 18.50 kB and the generation worker 60.73 kB. Assets remain below the repository base path.

The browser suite now includes five real import cases and the preceding eleven generation/learning regressions. Import fixtures are synthetic and small; they do not establish interoperability with every exporter or performance for every input at the maximum limits. Imported surfaces have no generation mapping, and source provenance in a saved project is not authenticated. See [the imported surface contract](imported-surfaces.md) for exact semantics and limits. Current browser results below are finalized from executed reports. Historical native-GPU/network probes above have not been rerun for this milestone.

- **16/16 browser tests passed against development** in 90.75 seconds and **16/16 against production** in 83.76 seconds, with no page or console errors. Production used `/KnittingTopology/`. The imported-surface 375px layout and desktop selection screenshots were visually inspected.

## Supplied rectangular OBJ UV generation — 6 November 2026

- **319/319 unit tests passed** in 18.34 seconds: the preceding 252 checks plus 67 chart-kernel, mapped-generation and mapped-project cases. Type checking and production build passed.
- New tests cover rectangle boundary/topology conditions, normalized orientation/conditioning, physical unit and texture-unit independence, source triangle interpolation, crease-crossing paths, rational non-dyadic diagonal and sliver-query sweeps, attachment tolerance consistency, coarse/patch tampering, all six families on representative patches, UV guide behavior, 90° bends, workload limits, freshness/round-trips and a documented fail-closed density/operator configuration.
- Initial JavaScript is 414.79 kB (130.80 kB gzip); the lazy viewer 580.72 kB (146.37 kB gzip); import and generation workers 27.85 kB and 91.24 kB.
- **19/19 browser tests passed against development** in 106.93 seconds and **19/19 against production** in 100.63 seconds, with no page or console errors. Production used `/KnittingTopology/`.
- A re-run of `npm run check` on the unchanged source passed: 319/319 unit tests in 16.65 seconds, type checking, and a production build with identical bundle sizes.

The current browser suite has 19 cases. Three new cases exercise real mapped generation/drawing/picking, source-triangle attachments, method citations, live barycentric learning without scientific-state edits, cache/file restore, stale results, chartless fallback and 375px layout. The sample OBJ and its declared millimeter units are supplied in `public/examples/`. Source fingerprints now include public assets, example data and the verification script. Numerical inputs remain local to the browser.

This is a floating-point supplied-chart screen, not automatic unwrapping, an exact-predicate bijection certificate or a global 3D or physical certificate. Paths follow the mapped image of straight normalized-UV segments and are not geodesics. Severe folds, fine support path budgets and some planar density/operator combinations can be rejected. Maximum-input performance, native-GPU matrices, physical touch and manual assistive-technology coverage have not been newly established. Initial restoration and render-index preparation still include bounded synchronous work. See [mapped surface semantics](mapped-surfaces.md). Earlier native/network probes remain historical.

## Knit program core and plane UI — 6 November 2026

- **360/360 unit tests passed**: the preceding 319 plus 41 knit program cases. Type checking, formatting and the production build passed.
- **Fidelity to Knit Grammar.** BMP files and `knit-grammar-pattern` JSON are byte-identical to files written by Knit Grammar's own code (KnittingPixelArtEditor commit `49b17992de32`). Check findings, structure data and structure tiling match it exactly. See `tests/fixtures/knit/README.md`.
- **Behaviour tests** cover:
  - automatic transfers: Accordion rows around a rib band, dropped transfers, two-layer structures left alone, unfixable bed changes reported, and an independent waiting-loop count of 0 when transfers are on;
  - edge lines exactly `width` loops wide;
  - node and extraordinary-node marks;
  - provenance from every loop to an existing element;
  - cell rules, including alternating conflicts exactly when an interior vertex has odd degree;
  - overrides, sizing from the jersey swatch with its limits, and unsupported inputs;
  - settings validation, the measurement-table file, project round trips and undo;
  - the scientific signature, which knit settings leave unchanged.
- **21/21 browser tests passed against development** (about 2.0 minutes) and **21/21 against production** (about 1.8 minutes), with no page or console errors. Two new cases cover:
  - the plane workflow: typed size, split view, linked provenance, exports, a jersey measurement sizing the program, undo/redo;
  - the section being offered only on the plane.
- **Real Knit Grammar check (one-off, local development servers).** A program exported here (80 × 90, seed node marks) was opened in KnittingPixelArtEditor:
  - the JSON opened as "80 × 90 · one yarn guide";
  - the BMP read as the 4.S52 basic key with 7200 exact, 0 snapped and 0 unknown pixels;
  - there were no page or console errors.
- Initial JavaScript is 464.86 kB (147.92 kB gzip); the lazy viewer 581.01 kB (146.45 kB gzip); import and generation workers 27.86 kB and 91.54 kB.

The knit program is design-level output for the lab software, which assigns the final operations and makes the machine code. Nothing has been knitted. Gauge comes only from entered swatch measurements, and unmeasured structures are flagged as assumed equal to jersey. The checks are Knit Grammar's warnings and do not certify knittability. The lab rules on first pass direction, transfer timing and yarn guide travel are still to be confirmed. Only network mode on the plane with the one-guide basic key is available. The program is built synchronously in the page, and responsiveness at the 600 × 600 maximum has not been measured.

## Open-surface knit shaping (M2) — 6 November 2026

- **409/409 unit tests passed** across 18 files, including 89 knit tests and 33 learning/citation tests. Type checking, formatting and the production build passed.
- **23/23 browser tests passed against development** (2.2 minutes) and **23/23 against production** (2.0 minutes), with no page or console errors. Both used installed Chrome with software WebGL and the `/KnittingTopology/` subpath. The final development run excludes generated trace HTML from Vite's watcher; those snapshots had previously caused live page reloads during tests.
- Shape tests cover all four plane start edges, ceiling/rounding counts, original UV positions, widening and narrowing trapezoids, an annular sector's short rows, saddle invariants, held parents, unit transfers, parent ownership, explicit unresolved placement and invalid inputs. Positive contour counts and disposable-worker cleanup have regression checks.
- Browser checks cover measured-gauge requirements, explicit generation without a geometric network, linked provenance, start-edge undo/redo, worker termination on cancel and supersession, stale export blocking, citation download and transitions to unmapped inspection surfaces. A linked saddle/bitmap screenshot was inspected locally.
- The BMP and Knit Grammar JSON writers themselves reject programs carrying export blockers. An independent symbolic replay compares actual bed/needle parent sets with declared loop parents. It is a connectivity check, not a machine simulation.
- References now distinguish the directly read Popescu thesis sections from the related chapter's metadata-only record. Downloaded BibTeX/CSL metadata and the checked-in bibliography agree.
- Separate local 600 × 600 plane probes produced 360,000 loops and placements with no moves or unresolved steps; enclosing geometry test time was 327 ms and planner time 147 ms. These are isolated kernel observations, not end-to-end browser responsiveness guarantees. Exact identity fast paths avoid redundant quadratic alignments on a plane.

The [construction and limits](knit-shaping.md) document the single-monotone-contour subset, restricted boundary trimming, asymmetric distance source, incomplete needle search and unbounded curved-surface approximation error. Curved network/combined modes and closed-surface cuts remain later work. Lab rules, the downstream Steiger importer and physical knitting remain unverified. The real Knit Grammar application-opening evidence above is historical M1 evidence; its format fixtures are still checked, but no new physical or machine validation is claimed.

## Curved network mapping and structure tiles (M3) — 6 November 2026

- **425/425 unit tests passed** across 19 files, including 105 knit tests. Type checking, formatting and the production build passed.
- **25/25 browser tests passed against development** (2.8 minutes) and **25/25 against production** (2.6 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- New numerical tests compare reference loop IDs, positions, network source classes and graph indices across network/combined modes. Analytic plane tests check exact edge widths and node squares. A mapped annular sector checks rectangular-fill counts and retained short-row registration; typed saddle and supplied-chart layouts require no invented measurements.
- A supplied chart whose distinct boundaries meet in 3D retains separate UV edge identities. The first test fixture (a full cylindrical wrap) was correctly rejected by existing coarse-cell area validation; the accepted fixture has nondegenerate coarse corners and a coincident boundary location in its interior. Assignment uses original chart identities, not nearest-3D reprojection of that location.
- Tile tests cover project round trips, undo, measurement identity, built-in preservation, duplicate IDs, bounds and unknown operations. Browser tests paint and save a tile, undo/redo creation and assignment, export it in project JSON, switch curved output modes and verify typed dimensions without a gauge.
- Existing cancellation, superseded/stale output rejection, imports, citation downloads, persistence, geometry exports and 375px workspace checks still pass. A local curved-pattern/tile screenshot was inspected.

See [network mapping and tile semantics](knit-network-mapping.md). Mark widths use a sampled local metric and are not certified geodesic distances. Other structure measurements do not deform the fill-based reference layout. Rectangular-fill counts describe nominal additional courses, not physical shape error. Combined output still blocks unresolved required shaping/operation mismatches. Closed-surface cuts, two-guide/custom keys, machine instructions and physical validation remain outside this milestone.

## Closed-surface cuts and seam maps (M4a) — 6 November 2026

- **451/451 unit tests passed** across 20 files, including 131 knit tests. Type checking, formatting and the production build passed.
- **27/27 production browser tests passed** (2.6 minutes). Development verified all 27 cases: 26 passed in the full run (3.1 minutes); a surface-selection test initially matched both the Sphere surface button and the new Sphere cut-preset button. Its corrected exact selector passed the isolated retest (6.8 seconds). No application page or console errors were recorded.
- The 26 new cut tests exercise single-edge boundaries, path endpoints and interior fan splitting, branch vertices, empty/unknown/duplicate/cyclic/disconnected drafts, source orientation and incidence failures, source freshness, exact source preservation, face-cycle/edge-incidence reconstruction, export guards, cancellation and project round trips. Presets are checked on all six graph families for cube and sphere.
- Browser checks use real 3D edge picking to edit a draft, undo/redo, reject an empty draft, terminate an actual worker on cancellation and on a source change, preserve the previous validated result, export paired seams and citations, reopen/revalidate a saved sphere draft, and fit the 375px layout. A local cube screenshot was inspected; the sphere narrow layout passed the browser width check.
- Export rechecks the actual boundary, disk topology, paired directions, endpoint coverage and current draft. Original 3D vertex copies agree exactly. Source sampled-path endpoints use the documented relative tolerance; the measured cube gyro endpoint residual was approximately 6.94e-18 m.

The [cut method and contract](closed-surface-cuts.md) state the supported source topology, graph-path and crease presets, numeric tolerances, parallel boundary-edge identities, noncryptographic freshness signature and export bounds. This checkpoint verifies a combinatorial disk and paired seam map. Planar development, sewing order, closed-surface course/bitmap generation and physical fabrication remain subsequent work.

## Cube knit programs from crease-cut flat nets (M4b) — 6 November 2026

- **461/461 unit tests passed** across 21 files, including 141 knit tests. Type checking, formatting and the production build passed.
- **28/28 browser tests passed against development** (2.8 minutes) and **28/28 against production** (2.5 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- The 10 new cube-net tests enumerate all 384 seven-crease cuts that open the cube into one disk. For every cut, hinge points coincide within 1e-12, cut creases separate, unit face edges keep unit length, no face is mirrored, cells do not overlap, and every row and column of the net is unbroken. The cuts give 11 distinct net shapes. The first 12 also pass the M4a disk checks.
- A hand-checked cross net (12 cm cube, 6 mm × 4 mm test swatch, not a measured gauge) gives 20 needles × 30 passes per face, an 80 × 90 bitmap, two reported shifts (a late start at pass 31 and an extra course at pass 61), two needle stops, zero yarn jumps, one parent per loop and 60 new edge loops. Other tests cover face-interior and partial cut refusal, seam loop counts with opposite M4a seam sides, all four start edges, network cell coverage with both copies of every cut edge, and refusal of stale cuts and typed sizes.
- The browser test generates the cross-net shape and combined programs from the cut preset, reads the flat-net report, needle stops and seams, and checks that BMP export is enabled. A local cube shape screenshot was inspected.

See [closed-surface knitting](closed-surface-knitting.md). Needle stops are reported, not drawn, because the colour key has no cast-off; Knit Grammar's held-loop check can flag them. Sewing order, face-interior cube cuts, the coarse-cell rule on a cut cube, sphere bitmaps, machine simulation and physical validation remain outside this milestone.

## Sphere knit programs from pole-to-pole cuts (M4c) — 6 November 2026

- **484/484 unit tests passed** across 22 files, including 164 knit tests. Type checking, formatting and the production build passed.
- **28/28 browser tests passed against development** (3.1 minutes) and **28/28 against production** (2.8 minutes), with no page or console errors. Both used installed Chrome, software WebGL and `/KnittingTopology/`.
- The 23 new sphere tests check the meridian preset on six network families at three spacings: each preset is one descending path. Branched, partial and level or climbing cuts are refused.
- The short-row layout is checked on five sphere and swatch sizes (test values, not measured gauges), with both first-pass directions:
  - every pass is one unbroken run that changes only at the end where it finishes, with zero yarn jumps;
  - every needle knits the first and last passes, and outer needles knit only passes their inner neighbours knit;
  - counts are within 1.5 loops of each circle over the course height;
  - loops are within 2 to 3.5 loops of their even place around the circle. On an 18 cm sphere at 6 mm × 4 mm, this gives 48 × 141, 1.32 and 2.35 loops.
- Both start sides are checked for:
  - single parent loops;
  - which pole needle 1 sits at;
  - outward orientation;
  - seam loops on all 32 needles, with opposite M4a sides for every cut edge;
  - the report.
- Network cells are checked on six networks with a pole node, a pole inside a cell and a pole on an edge. Every loop lies in a cell, and any loop placed in a different cell from the 3D cell that holds it is within `1e-5 × sphere size` of an outline (largest seen: 0.4 µm). Cut edges are drawn on both seam sides, and a pole node marks the whole pole needle. Chart round trips and refusal of typed sizes, net start sides and stale cuts are also covered.
- In a scratch run of 96 configurations (6 families × 4 spacings × 2 diameters × 2 start sides), every loop was in a cell, with zero yarn jumps and no export blockers.
- The browser test generates the sphere from the meridian preset in shape mode, on both start sides, and in combined mode. It reads the report and checks that BMP export is enabled. Local sphere screenshots were inspected.

See [closed-surface knitting](closed-surface-knitting.md). Pole openings are reported, not drawn, because the colour key has no gather operation. Long holds near the poles can be flagged by Knit Grammar's held-loop check. Short-row turns add no wrap or tuck; the lab is still to confirm this. This milestone closes M4. Sewing order, face-interior cube cuts, other sphere cuts, the coarse-cell rule on closed surfaces, machine simulation and physical validation remain outside it.

## Two-guide and custom colour keys (M5a) — 6 November 2026

- **509/509 unit tests passed** across 23 files, including 189 knit tests. Type checking, formatting and the production build passed.
- **29/29 browser tests passed against development** (3.0 minutes) and **29/29 against production** (2.9 minutes), with no page or console errors. After the development run, the new colour-key test was changed to upload its downloaded JSON by path (a typing fix) and passed again alone against development.
- The 25 new unit tests check:
  - operation lookup by meaning, translation between keys and names built from meanings;
  - custom key validation and limits, and saving custom keys and their tiles in knit settings;
  - built-in structures under a renamed and recoloured copy (same meaning in every cell), structures dropped when an operation is missing, and class-key tiles offered only in copies of the same mode;
  - key switching (unavailable assignments move to the fill or are switched off) and the removal guards;
  - reading a key from a Knit Grammar pattern JSON (class key refused, identical key not duplicated, taken id renamed, invalid files refused);
  - programs: custom RGB in the BMP, the key in the Knit Grammar JSON, the custom marker in the report, and an automatic transfer skipped and listed when the key cannot express it.
- Two-guide shaping is checked on the existing chart fixtures (test values, not measured gauges):
  - a sector knits short rows with every loop k2f and every hold fl2, with no blocker;
  - a narrowing trapezoid is blocked because its decreases need transfers;
  - with the tuck rule, a widening trapezoid tucks new loops as t2f, and is blocked when the custom key lacks the tuck pair;
  - a custom basic copy without sideways transfers blocks the narrowing trapezoid;
  - combined mode with double knit and birdseye on a plane has no blocker. The symbolic parent check now follows every bed a yarn guide works; one-guide results are unchanged (all earlier tests pass).
- The browser test switches to the two-guide key, makes a custom copy, recolours an operation and finds the exact RGB in the exported BMP. It also checks guarded removal, reading the exported Knit Grammar JSON back without a duplicate key, and undo.
- Not claimed: custom colours are the user's choice; the lab's script, importer and handling of two yarns on short rows are unconfirmed. Output remains design-level and is not verified until knitted.

## Knit variants in Compare (M5b) — 6 November 2026

- **512/512 unit tests passed** across 24 files, including 192 knit tests. Type checking, formatting and the production build passed.
- **31/31 browser tests passed against development** (3.3 minutes) and **31/31 against production** (2.9 minutes), with no page or console errors.
- The 3 new unit tests check that a snapshot copies the cells and key and records the metrics. A recoloured custom key gives 0 differing cells. A reverse-jersey fill differs in every knitted cell. A different swatch size is not compared cell by cell and is noted as different inputs (test values, not measured gauges).
- The 2 new browser tests check:
  - a capture with its thumbnail and structure list;
  - the cell difference between jersey and reverse-jersey fills;
  - a different size not compared cell by cell;
  - restore of the knit settings;
  - a shape program captured without a network;
  - an outdated shape preview that cannot be captured.
- Not claimed: captured programs are derived and are not saved in project files. A difference count compares operation meanings, not physical results.

## Final knit workflow integration (M5c) — 6 November 2026

- **512/512 unit tests passed** across 24 files (192 knit tests); the final unit run took 18.56 seconds. Type checking and the production build passed.
- **32/32 browser tests passed against development** (3.4 minutes) and **32/32 against production** (3.2 minutes), with no page or console errors. Production ran at `/KnittingTopology/`. The added export test also passed individually on development before the full runs.
- The added end-to-end test imports the supplied bent rectangular OBJ chart in millimeters, generates its geometric network and creates a 31-needle × 23-pass network bitmap with a custom key. It independently decodes the downloaded 24-bit BMP and compares all 713 pixels with the operation colours in the downloaded Knit Grammar JSON, including bottom-up row order and padded rows. The fixture uses more than one operation.
- Saving, replacing the active surface, and loading the project restores the supplied chart, graph, custom key and swatch measurements. Regenerating produces an identical BMP and identical JSON operation cells and key. Measurements in this test are **test values, not measured gauges**; typed dimensions describe pixels.
- The full browser suites also exercise cube and sphere cut/knit workflows, curved combined-mode generation, stale and unresolved export blocking, custom-key editing, comparison, undo and project restoration. Existing analytic and invalid-input tests remain part of the unit suite.
- Documentation now distinguishes the geometric network from the derived knit program and explicitly states that open-surface Shape mode needs no network. Current machine-readable capability summaries include sphere support and custom/two-guide keys; earlier milestone entries remain historical records. Local documentation links were checked for missing targets.
- The initial JavaScript bundle remains 585.42 kB (187.50 kB gzip); the lazy viewer is 582.93 kB (147.17 kB gzip). No runtime code or dependencies changed in this milestone.
- This verifies local integration and file fidelity. A live Pages deployment, lab importer behaviour, machine execution and physical knitting were not tested.

## CI sphere audit timing correction — 6 November 2026

[Pages run 42338491659](https://github.com/NijatM/KnittingTopology/actions/runs/42338491659) on commit `72010a9` passed type checking and 511 unit tests, but the sphere seam audit exceeded its explicit 30-second timeout. No assertion failure was reported. The workflow stopped before the production build and Pages configuration.

The regression checked sphere sizes `1e-6`, `0.12` and `1000` meters inside one test. These are now three independently timed cases, each retaining the same 30-second budget, 128/127/1 strip counts and all cell-count, boundary, Euler and vertex-count assertions. No scale or assertion was removed, and runtime code is unchanged.

`npm run check` passed locally: type checking, **514/514 unit tests** across 24 files (106 core, 192 knit; 18.04 seconds), and the production build. The test count increased by two because one combined test became three cases. Formatting passed. The M5c browser results above are retained; browser tests were not rerun for this test-only change, and production asset names remain unchanged. A new workflow run on the corrected commit is still required to verify the GitHub runner and deploy.

## Persistent knit generation requirements and repair links

- **520/520 unit tests passed** across 25 files (106 core and 198 knit; 18.56 seconds). Type checking, formatting and the production build passed. The six new pure prerequisite tests cover open Shape mode without a graph, measured and typed network sizing, the existing jersey reference with two-guide fills, closed-surface cut requirements, and surface-revision mismatch.
- Development: the full run passed **34/35** cases in 3.6 minutes. The remaining test expected the old missing-measurement sentence. Its assertion was updated to check the new repair button; that complete size/export/swatches/undo scenario then passed individually in 12.5 seconds. No runtime code changed after the full development run.
- Production: the full suite passed **35/35** cases in 3.1 minutes at `/KnittingTopology/`, with no page or console errors. The three new interaction tests also passed together on development in 15.0 seconds before the full matrix.
- The new browser cases verify zero knit workers on a blocked click, persistent/focused requirement summaries, repair navigation to measurements/network/cuts, inline invalid-field associations, preservation of a partial measurement, clearing requirements after save, and a 375px layout without document overflow. A controlled message-clone failure verifies the separate red failure panel, retained accepted bitmap and successful retry. Screenshots of the amber panel, field repair, red failure and mobile repair were visually inspected under ignored `tmp/qa/`.
- See [generation requirements and recovery](knit-interaction.md) for the interaction and accessibility references. Manual screen-reader testing is not claimed. Presence/freshness checks do not certify a cut: the numerical worker still validates it. No project schema or numerical algorithm changed; no hypothetical swatch was added and uncalibrated shaping was not implemented.
- Initial JavaScript is 591.47 kB (189.35 kB gzip); the lazy viewer remains 582.93 kB (147.17 kB gzip). The prior corrected CI run on `ffe1c20` passed Verify and build before stopping at disabled Pages configuration; these new UI changes have not been checked by a remote workflow. No new live deployment or physical knitting validation is claimed.

## Course-first knit inspection — 7 November 2026

- **527/527 unit tests passed** across 26 files (106 core, 205 knit; 18.43 seconds in the final run). Type checking and the production build passed. Seven new tests distinguish reference and applied shaping, short-row shaping with zero bed transfers, unresolved two-guide output, jersey fallback, held/background exclusion and independent overlay filtering.
- **37/37 browser tests passed on development** (3.6 minutes) and **37/37 on production** (3.4 minutes), with no page or console errors. The two new cases also passed together in 17.6 seconds before the full matrix. They verify actual canvas changes for course/topology/mesh toggles, unchanged BMP bytes and no extra knit worker, explicit pattern-only/reference/assumption labels and 375px layout without overflow.
- The new toolbar and legend separate cyan computed courses, muted topology, selected courses/elements, shaping marks and surface mesh. Reference-only shaping marks are neither drawn nor pickable. Interpretation reports short-row passes and required sideways moves independently of bed transfers; operation warnings, model notes and blockers are separate. Calibration and edge-assignment coverage remain explicit. See [inspection behavior](knit-interaction.md#course-first-inspection).
- Initial JavaScript is 598.07 kB (191.50 kB gzip), lazy viewer 583.40 kB (147.36 kB gzip). Numerical worker asset names/hashes remain unchanged. No numerical, operation-encoding, measurement or project-schema changes were made. These checks validate display independence and interpretation, not physical shape.

### Open saddle diagnostic

A separate diagnostic probe used a180mm saddle, curvature 0.45, start edge `v0`, Shape mode, the basic one-guide key and uniform jersey fill. All dimensions below are **test values, not measured gauges**. Each result had constant loop count across its courses and zero turn passes, increases, decreases, new edge loops or required sideways moves.

| Stitch width × course height | Needles × passes | Discrete shaping changes |
| ---------------------------- | ---------------- | ------------------------ |
| 10 × 8 mm                    | 19 × 23          | 0                        |
| 5 × 4 mm                     | 38 × 46          | 0                        |
| 2.5 × 2 mm                   | 75 × 93          | 0                        |
| 1.25 × 1 mm                  | 149 × 186        | 0                        |

At this earlier checkpoint the result was an unresolved numerical/modelling question. That probe alone did not establish a particular algorithm defect or validate a saddle-shaped fabric. The subsequent [distance and one-guide audit](surface-distance-audit.md) identifies fixed-stencil directional bias and separate course-layout instability. Changing the test loop size did not introduce shaping in these cases. The probe was not a spatial-stencil refinement study, not an exact external project reproduction, and not a material experiment. The recorded course-rounding residuals are not error bounds on surface distances or achieved shape. Configuration and results are in the [machine-readable record](verification-results.json). Further numerical audit and physical validation remain open.

The final log audit exposed ResizeObserver delivery warnings during mobile transitions that the ordinary page/console-error fixture did not catch. Viewer and bitmap observers now coalesce size writes into the next animation frame and cancel queued callbacks on unmount. A direct window-error check and repeated 1440/375px transitions were added to the inspection browser case. The corrected source passed type checking/build, the affected development cases 2/2 (18.2 seconds, zero captured resize warnings), and a new full production run 37/37 (3.5 minutes). The earlier full development run and unit run predate this scheduling-only correction; numerical and interpretation test code was unchanged. Final bundles are 597.99 kB/191.48 kB gzip initially and 583.40 kB/147.35 kB gzip for the viewer.

The final interpretation check also separates freshness from shaping failure: a stale export gate does not make the underlying shaping graph unresolved, and the heading explicitly labels a previous program needing regeneration. That classification-only adjustment was covered by the final 527/527 unit/typecheck/build run after the browser matrix. Final bundles are 598.07 kB/191.50 kB gzip initially and 583.40 kB/147.36 kB gzip for the viewer.

## Distance correction checkpoint 9d52214 and course-layout finding

The open-chart distance kernel now uses continuous interpolation across sampled triangle edges with iterative four-direction relaxation. Plane distances are analytic. This replaces a fixed angular stencil; it does not establish exact geodesics or complete the shaping pipeline. Numerical source roles, comparison definitions, refinement results and the remaining failure are in the [surface-distance audit](surface-distance-audit.md).

Final unit verification: **537/537 across 27 files**, 24.50 seconds, including 215 knit cases. Type checking, production build and formatting passed. The final unit run extends skew-grid refinement through 128 intervals; runtime source is unchanged from the build and browser matrix. Development browser checks passed **38/38 in 4.6 minutes**, including the strong-saddle worker failure, persistent capacity explanation, blocked operation exports and two-source citation download. Production browser checks passed **38/38 in 4.1 minutes** on the final build. Both browser runs reported zero page/console errors. Both owned preview servers were stopped.

At that distance-correction checkpoint, the exact supplied geometry and settings were reproduced locally with the revised field. One-guide uniform jersey remained blocked: pass 3 requests 39 loops from 35 live parents, exceeding the current grammar’s necessary limit of 38 for that boundary/turn configuration. The original two-guide key also lacks the required shaping operations. No project measurements or operation definitions were altered to bypass these restrictions.

Strong-saddle discrete courses change under grid refinement even as the distance method improves. A coarser grid that happens to pass symbolic checks was not selected as a workaround. Course construction, patching or an alternative supported schedule remains open. A mild saddle can still produce no discrete shaping. No physical knit, lab importer, achieved shape or remote deployment validation is claimed for this source.

Final build assets: 601.16 kB initial JavaScript (192.70 kB gzip), 583.40 kB lazy viewer (147.35 kB gzip), 96.99 kB generation worker and 104.60 kB knit worker. These checks retain the 375px layout, existing cube/sphere workflows, worker cancellation, project persistence and input immutability coverage.

## Course-end correction

The follow-up preserves the first and last contour-sample connection when matching untrimmed contour pairs. It also retains a legal unchanged-needle candidate when cost-minimizing plans fail transfer-age checks during held-loop rejoining. Operation meanings, measured values and export gates are unchanged. See the [method and remaining limits](surface-distance-audit.md#course-end-correction).

All **546/546 unit tests across 27 files** passed in 19.04 seconds, including 224 knit cases; type checking and the production build passed. Direct tests cover the strong saddle at resolutions 32, 64, 128 and 256 and invalid comparison grids. Every first/last course has the analytic 47-loop boundary count, interior short rows remain and placement is resolved in these four fixtures. Integration replay accepts the actual one-guide bitmap and detects removal of a required transfer. Existing impossible-growth and unsupported-operation writer gates remain tested. Development browser verification completed with 37/38 in the main run (4.3 minutes) and the interrupted case passing its focused rerun (1/1, 19.1 seconds). A source-comment edit triggered a logged Vite page reload during that case; its expected N-sided state was reset. No numerical behavior or test assertion changed. Source was then frozen. The final production browser run passed **38/38 in 4.2 minutes**, with zero page/console errors. Both owned servers were stopped.

The exact saved project in uniform one-guide Shape mode now gives 50 needles × 48 passes, 2,225 active loops, 176 required sideways moves and no export blockers. Both operation writers succeed. The original combined two-guide case remains blocked: 176 unsupported shaping transfers and 184 parent mismatches. These are repeated messages across related causes, not 360 independent defects. The user’s input file and entered measurements are unchanged.

Counts and interior course distributions still vary under refinement. A passing symbolic graph is not a geometric-spacing, knittability or physical-shape certificate. No new machine operations, calibration defaults, simulation or remote deployment checks were introduced.

Build assets: 601.56 kB initial JavaScript (192.85 kB gzip), 583.40 kB lazy viewer (147.35 kB gzip), 96.99 kB generation worker and 105.00 kB knit worker.

## KnitCrete workflow guide and swatch calibration context — 7 November 2026

The Knit and Learn tabs include a read-only guide to the thesis workflow, with printed-page locators, thesis settings, operation and feature gaps, and citation downloads. Measurements can carry optional calibration context: a declared state (relaxed, tensioned or biaxial-locked), machine, knit point, yarn tension, knitting speed and test protocol, stored as the user's text. See the [thesis workflow audit](popescu-workflow-audit.md). Locators for the §6.3.1 settings, §6.5 footnote 13, Fig. 7.34 j–k, the KnitCandela unit (p. 153) and Table D.2 were checked against the thesis text.

All **561/561 unit tests across 28 files** passed in 18.80 seconds, including 239 knit cases. The 15 new calibration cases cover round trips of all three states through the measurement table and the project file, legacy records staying unspecified, eight malformed values rejected on both imports, context following the measurement actually used (including the jersey fallback), an unchanged scientific signature with undo and redo, and identical shape, cells, BMP bytes and export blockers when only the context changes. Type checking, formatting and the production build passed. A new browser case adds a measurement with context, checks the report and table downloads, confirms that a context-only edit keeps the program size and that undo restores the form, and opens the guide at 375px without page overflow. It passed on the development server (1/1). The final production browser run passed **39/39 in 3.9 minutes** with zero page/console errors. Both owned servers were stopped.

The context does not change loop numerics, configure a machine or certify calibration. Thesis Libra 3.130 / Model 9 settings remain a historical example; the lab's machine, needle allocation, bed width, software and symbol library are unconfirmed. Patch editing, feature recipes, compound and diagonal transfers and drops are not implemented.

Build assets: 616.52 kB initial JavaScript (198.00 kB gzip), 583.40 kB lazy viewer (147.35 kB gzip), 97.19 kB generation worker and 105.11 kB knit worker.

## Saved knit graph stages, second course method and short-row turn pairing — 8 November 2026

Shape programs now keep their course and loop stages (Popescu 2019, §§6.2.2–6.2.4 and §6.3) in the project file and as downloadable `knit-graph-stage` files with noncryptographic input fingerprints. A second, opt-in course method reconstructs the thesis connection rules for open surfaces. Short-row turns of the default method are paired so every pass starts where the previous one ended (project rule). Any remaining yarn jump blocks operation export. See [knit shaping](knit-shaping.md) and the [data contract](data-contract.md).

All **577/577 unit tests across 30 files** passed in 19.35 seconds, including 255 knit cases. The new cases cover stage extraction and a project round trip that rebuilds a byte-identical bitmap from the saved stages, staleness for each input (size, revision, start edge, measurement, method, and the first pass for the loops stage only), stage-file load order and rejection of mismatched inputs, methods and tampered fingerprints, synthetic duplicate-vertex and parent-link violations as export blockers, the second method on a plane (all quads, all checks passing, exact reload), its rejection on a sphere, and the history rule. Turn-pairing cases cover the yarn-jump list, the 200 mm saddle at the user's 2 × 2 mm measurement for rises 0.8–1.1 with zero jumps checked pass by pass in the exported BMP, the cast-on blocker and a key-order-independent stage hash. Type checking, formatting and the production build passed.

A new browser case generates a saddle, downloads both stage files, discards the stages, rejects a loops file loaded before its courses file, loads both back, and confirms that the program is current again with byte-identical BMP. It also checks that colouring the bitmap by loop role leaves the BMP unchanged, and that the second course method makes the stages stale until Generate rebuilds them with the thesis rule checks. Saving stages after a build now amends the present state rather than adding an undo step; the existing undo case passes. Browser runs passed **40/40 on the development server in 4.2 minutes** and **40/40 on the production build in 4.1 minutes**, with zero page/console errors. Both owned servers were stopped.

The rule checks are symbolic graph checks, not a machine simulation. The second method is reconstructed from the thesis text, not from compas_knit; some charts leave faces that are neither quads nor triangles and stop with an error, because the thesis fixes them by manual editing, which is not available yet. Spacing weft/warp and Refinement are not implemented. A paired turn removes loops, shortening their wales by up to one course height each. No physical knitting result is claimed.

Build assets: 660.87 kB initial JavaScript (213.79 kB gzip), 583.82 kB lazy viewer (147.50 kB gzip), 97.19 kB generation worker and 133.78 kB knit worker.

## Editing the knit graph courses stage — 8 November 2026

The courses stage can be edited on the 3D surface, as in the thesis (Popescu 2019, §6.3.2, pp. 111–112): with the connection-rules method its vertices and weft and warp links, with the project method its course polylines and their ends (short-row turns). Each edit is one undo step, is recorded in the stage (`edits`), removes the saved loops stage and rebuilds the layout and its rule checks at once. Rule violations block export as for generated stages. Generate never replaces an edited stage; when its inputs change it is kept, blocks export and offers _Download edited stage_ and _Discard edits and regenerate_. The project rules used where the thesis is silent are listed in [knit shaping](knit-shaping.md#editing-the-courses-stage).

All **584/584 unit tests across 31 files** passed in 19.63 seconds, including 262 knit cases. The new cases cover the distance interpolation on the plane (equal to the analytic distance), side snapping and start-edge rotation; every edit of both methods with its recorded target and its structural refusals; the needle order and turn-moving rules; a no-move edit that stores polylines and rebuilds a byte-identical bitmap; a short-row turn moved three points inward on the saddle (test values 6 × 4 mm), which rebuilds 567 instead of 573 loops with a changed bitmap and no export blockers; Popescu-method edits whose rule breaks block export, and a deleted vertex that stops the loop build with the editing hint; the edit log in validation and stage files; the stale-edited blocker; and the reducer (an edit is an undo step; a build never replaces an edited stage but may add its loops). Typecheck, formatting and the production build pass.

A new browser case generates the saddle, turns on _Edit on the surface_, deletes a course by clicking it, sees the automatic rebuild, restores the byte-identical bitmap with Undo, redoes the edit, changes the course method so the edited stage is stale, confirms that Generate keeps it and export stays blocked, downloads it with its edit log, and discards the edits so the new method's stages are generated. It passed on the development server; the full suite passed **41/41** on the production build (4.6 minutes) with no page or console errors.

The checks are symbolic graph checks, not a machine simulation, and no knitted piece was compared. The loops stage and cube or sphere stages are not editable yet.

Build assets: 675.14 kB initial JavaScript (218.85 kB gzip), 585.37 kB lazy viewer (148.03 kB gzip), 97.19 kB generation worker and 133.89 kB knit worker.

## Computational patches, seams first — 8 November 2026

In shape mode on open surfaces, split lines at constant chart u or v now divide the chart into a grid of rectangular computational patches (Popescu 2019, §6.3.2, pp. 109–110; the grid is a project restriction). Each patch has its own start edge, fill structure (loop size) and course method, and its own saved, editable knit graph stages, whose fingerprints include the patch rectangle. Every shared edge is a seam in this version: each patch is generated as its own piece with its own bitmap, Knit Grammar JSON, report and stage files (`-P<n>` file names), and a `knit-patch-seam-map` JSON lists the loops or course ends along both sides of each seam, paired by position along the edge (project rule). Count and length differences are reported and never block export. Split lines are added by clicking the surface, dragged, or typed; each change is one undo step. See [knit shaping](knit-shaping.md#computational-patches) and the [data contract](data-contract.md).

All **591/591 unit tests across 32 files** passed in 26.3 seconds, including 269 knit cases. The new cases cover the grid numbering and split rules (limits, settings kept when adding, moving and removing splits, the last split returning to the whole chart, file validation); the side of a patch in its own knitting frame; a plane split at u = 0.5 (test values 6 × 4 mm), where each half gets exactly 9 needles × 25 passes, spans 50 mm across, and its seam pairs 25 course ends with 25, with a 100 mm seam length; per-patch start edge and fill on the saddle; a fingerprint that changes with the patch rectangle and a stage that is fresh only for its own patch; a rebuild from saved patch stages that gives a byte-identical bitmap; stages dropped when a split divides or moves a patch; edits kept inside the patch rectangle; the pairing rule; the worker transfer of piece programs; the blocked message in other modes; the piece report; and a whole-chart window equal to the unsplit build. Typecheck, formatting and the production build pass.

A new browser case on the saddle adds a split line by clicking the surface, types its value, checks Undo and Redo, gives P2 its own start edge, generates both pieces, downloads `-P2` and `-P1` bitmaps and the `-P2` report, downloads the seam map, and removes the split so the whole chart takes P1's settings. The full suite passed **42/42 on the production build in 5.7 minutes** with no page or console errors; the new case also passed on the development server. Both owned servers were stopped.

The seam map is sewing guidance from a geometric prediction, not a sewing sequence. Patches are not combined into one knitted piece yet (knitted-through joins are the next step), patch boundaries are full-length grid lines rather than free curves, and no knitted piece was compared. Topology network patches are never used as knit patches.

Build assets: 696.85 kB initial JavaScript (226.01 kB gzip), 585.93 kB lazy viewer (148.20 kB gzip), 97.35 kB generation worker and 137.93 kB knit worker.

## Knitted-through joins between computational patches — 8 November 2026

Each shared edge between computational patches is now knitted through or a seam, and new split lines start knitted through. Patches linked by knitted-through edges form one piece of any connected shape, named after its lowest patch, with one bitmap, Knit Grammar JSON and report (`-P<lowest>` file names); stage files stay per patch. The thesis combines patch patterns into one pattern (Popescu 2019, §6.3.2, p. 107) but gives no algorithm, so the join is a project construction: side by side, the courses reaching the shared edge are paired one to one in order along it and an unpaired course turns at the edge; stacked, the needle planner links the upper patch's first course to the loops below; short-row turns are then paired over the whole piece. Fills may differ within a piece (p. 110). A Popescu-method patch keeps its loop connections inside the patch. Needle stops inside a piece are reported for cast-off in the lab software and do not block export. Different start edges across a knitted-through edge fail the piece; a seam inside one piece and separate arms in one band block export. The seam map (version 2) lists seams only, with each side's piece. See [knit shaping](knit-shaping.md#computational-patches) and the [data contract](data-contract.md).

Two planner details changed for joined pieces and leave single-patch programs unchanged (all earlier knit cases pass): bed changes are inserted after the shaping transfers, so a loop that moves sideways is followed to its new needle; and turn pairing accepts fixed parent links and never removes a Popescu-method patch's loops.

All **600/600 unit tests across 33 files** passed in 26.8 seconds, including 278 knit cases. With test values of 6 × 4 mm (reverse jersey 9 × 4 mm), not lab measurements, the new cases cover:

- the edge IDs across added, divided, moved and removed split lines, and old files whose edges all stay seams;
- validation of the `through` list;
- the in-order pairing rule and the common knitting frame for each start edge;
- a plane split at u = 0.5 and knitted through, which gives exactly the whole chart: one piece of 18 needles × 25 passes and 450 loops, no seams, no stops and no blockers. Rebuilding from the saved per-patch courses stages gives identical cells.
- a 2 × 2 saddle that builds as one piece without blockers;
- an L-shaped piece on the saddle: its stops are all P2's, reported in the issues and the report; P4 is a separate piece, and seams u1:2 and v1:2 are listed with both pieces;
- the blocker for a seam inside one piece, and the separate-arms blocker for a U on the plane;
- jersey beside reverse jersey on the plane: 9 + 6 = 15 needles on the front and back beds, with no blockers;
- a Popescu-method patch beside a project-method patch on the plane, and on the saddle with paired turns, both without blockers;
- the start-edge message;
- the reducer that saves a patch's courses-only stages.

Typecheck, formatting and the production build pass.

A new browser case on the saddle adds a u and a v split in the panel and finds all four edges knitted through. It selects P4, generates one piece P1 (P1, P2, P3, P4), sees that the loops stage is rebuilt rather than saved, and downloads a `-P1` bitmap. It then turns two edges into seams, which gives an L-shaped piece with a reported P2 stop and P4 on its own. It downloads the version 2 seam map, and Undo restores an edge. The 2c1 case now starts with the start-edge message, then makes the edge a seam. Both cases passed on the development server. The full suite passed **43/43 on the production build in 4.8 minutes** with no page or console errors, and both owned servers were stopped.

Known limits found with the same test values on the 100 mm saddle (curvature 1):

- A Popescu-method patch on the right half has saved links that cannot be placed at pass 4, and a reverse-jersey right half has a yarn jump at pass 2. Both also occur when that patch is built as its own piece, so the join does not cause them.
- Stacking a reverse-jersey patch on a jersey patch needs more loop-count change in one pass than one-needle transfers allow, so that pass blocks export.
- A narrow saddle patch (a third of the chart wide) can fail its own contour construction.

The join is a geometric construction checked by symbolic graph rules, not a machine simulation, and no knitted piece was compared. The join between loop sizes has not been validated physically.

Build assets: 713.76 kB initial JavaScript (231.96 kB gzip), 585.93 kB lazy viewer (148.20 kB gzip), 97.35 kB generation worker and 150.25 kB knit worker.

## Feature zones (intent only) — 8 November 2026

Feature zones mark where features go, as in the thesis workflow (Popescu 2019, §6.3.2, p. 112; §6.4.1, pp. 113–114). On open surfaces, in every mode, a zone is drawn on the surface as a stroke with a width in millimetres or as a closed region, and stored in chart coordinates, with a thesis kind, a name and a colour. A region marks the loops whose chart position is inside it (even-odd rule); a stroke marks the loops whose 3D centre is within half its width of its path on the surface (project rule). Zones change no operation. They are left out of the build signature, so drawing them never makes the preview outdated. The bitmap preview can colour cells by zone, and clicking a marked cell selects its zone. A zone map JSON (version 1) lists each zone's cells. A marked BMP shows the operation bitmap with zone cells in zone colours; it is not a Knit Grammar program. It is refused while a zone colour equals a key colour or another zone's colour, and it is blocked together with the operation exports. See the [data contract](data-contract.md).

All **608/608 unit tests across 34 files** passed in 20.0 seconds, including 286 knit cases. With test values of 6 × 4 mm, not lab measurements, the new cases cover:

- validation of zones, and their round trip through the knit settings;
- on the plane, a 12 mm stroke along u = 0.5: each loop is marked exactly when its 3D distance to the stroke's path is at most 6 mm, and each marked needle is marked on all 25 passes. A region marks exactly the loops whose chart position is inside it. The operation cells are identical with and without zones.
- overlap: the zone lower in the list is on top, and overlapping cells are counted;
- a typed rectangular chart without shaping: a region over half the chart marks 5 of 10 needle columns on all 6 passes, and a region without area marks nothing;
- the marked BMP pixel by pixel (zone colour on zone cells, the operation colour elsewhere), the unchanged operation BMP, and the zone map's 1-based needles and passes;
- colour clashes with the key and between zones;
- the report's zone lines;
- a zone across computational patches on the saddle: loops of both patches in a knitted-through piece, and each piece's own part when the edge is a seam.

On the production build (`vite preview`), the full browser suite passed **44/44** in 5.4 minutes with no page or console errors. The zones case was then extended with a bitmap click and passed again on the same build. It draws a three-point region and a two-point stroke on the saddle surface, and checks that the operation BMP is byte-identical before and after drawing. It colours the preview by zone, and checks that clicking a cell of the first zone in the bitmap selects that zone. It downloads the zone map, the marked BMP and the report. A key colour blocks the marked BMP, and Undo restores it; Undo also brings back a deleted zone. The production build's initial JavaScript is 730.44 kB (237.17 kB gzip); the knit worker is unchanged at 150.25 kB.

Known limits: a stroke's width is measured as straight-line 3D distance to its sampled path on the surface, not as geodesic distance. The "across" figures are median runs of marked cells, as a guide only. Marks cannot be drawn on the 2D bitmap. Closed surfaces have no zones. Zones are not expanded into operations; feature recipes are later work. Nothing has been knitted.

## Operation sequences and the symbolic executor — 8 November 2026

Every knit program is also written as a machine-neutral operation sequence, after the thesis workflow, in which symbols become operations that are simulated before the machine file is written (Popescu 2019, §6.4.1, pp. 113–114; Fig. 6.18; Fig. 7.34g–k). Each needle in a pass has a symbol of ordered steps: yarn-fed knit or tuck by a yarn guide on a bed, then yarn-free steps (transfers straight across or diagonal, the class key's same-bed moves, drops). Clusters of symbols can be repeated over cells. The executor follows the sequence symbolically. By project convention, each pass's yarn-fed steps come before its yarn-free steps, and moved loops land together after the pass's departures. It tracks the live loops on every needle of both beds and where each yarn guide stopped. A transfer or move off the program's needles, and transfers in one pass that need different rackings, block export (project rule); the other findings are reported. The shaping check runs beside the executor and still blocks shape mode as before. The sequence JSON (`knit-sequence`, version 1) can be downloaded while export is blocked; it is not a machine file. See the [data contract](data-contract.md).

All **620/620 unit tests across 35 files** passed in 20.4 seconds, including 298 knit cases. The 12 new cases cover:

- conversion of class-key programs to sequences and back to the same cells: network, typed and shape programs (plane, saddle, a narrowing chart) and two-guide short rows, with identical BMP bytes;
- a custom key with two colours for one meaning: within the same key each cell keeps its colour, and another key gets the meaning;
- refused conversion, with the approved message: Fig. 7.34j's knit-both-then-transfer symbol in the two-guide key; a drop, a diagonal transfer and a move on its own in the basic key; one yarn guide on both beds;
- loops followed through stitches and a transfer straight across, with each loop's parents;
- racking from diagonal transfers (1 from the front bed, −1 from the back bed), and the blocker when one pass needs two rackings;
- the blocker for a transfer off the program's needles; stacked loops, transfers from empty needles and drops on empty needles are reported;
- Fig. 7.34k, knit both layers then drop the front stitch: the front loop is released and the back loop stays;
- yarn-guide jumps and the wrong side, reported but not blocking;
- a 2 × 2 cluster repeated over cells from an anchor, and invalid symbols refused;
- the executor's loop parents agree with the shaping check on four shape programs (consistency, not validation);
- the eyelet transfer on the last of 62 needles: the cells of the old "transfer off the edge" warning equal the executor's blocking cells, and the BMP and Knit Grammar JSON writers refuse; with 60 needles the program exports as before;
- the sequence JSON (passes, directions, symbols and steps, 1-based cells, blockers) and the report section.

On the production build (`vite preview`), the full browser suite passed **45/45** in 5.0 minutes; the knit cases fail on any page or console error. The new case builds a typed 62 × 60 network program on the plane with the eyelet fill (test values). It checks the counts in the Operation sequence section and the blocking finding for the transfer off the last needle. It checks the matching export blocker ("needle 62: a transfer moves the loop to needle 63, outside the program's needles") and that the BMP and Knit Grammar JSON buttons are disabled. The sequence JSON still downloads, carrying the blockers. With 60 needles the blocker is gone and the BMP is enabled again, the sequence JSON has no blockers, and the report has the operation sequence section. The production build's initial JavaScript is 739.79 kB (240.75 kB gzip); the knit worker is 155.06 kB (150.25 kB before).

Known limits: the executor is symbolic, not a machine simulation. Its pass order (yarn-fed steps first) and the racking sign are project conventions, not machine values. Guide positions come from stitch positions only: floats at the ends of a pass mean the guide turns there. A custom-key operation with both yarn guides on one bed converts as it is and counts as one stitch, while symbols added otherwise may have one yarn-fed step per bed. Nothing in the app yet produces drops, diagonal transfers or clusters; feature recipes are later work. Nothing has been knitted.

## Plane channel and pocket recipes (8 November 2026)

The first bounded feature presets (`guide-swap-bands-v1`) apply to rectangular regions of compatible two-guide, unpatched, unshaped constant-width plane programs. Their separate-layer bodies, internal join bands and declared panel-boundary access follow the connection principles in Popescu (2019), §5.5, pp. 90–91, Figs. 5.26–5.27. The finite schedules, band priority and validation are project constructions. See [recipe method and limits](knit-recipes.md).

Validation is atomic. It checks actual chart-boundary access (normalized tolerance 1e-10), complete rectangular loop membership, minimum clear-body size, base compatibility and nonoverlapping applied footprints. It reads actual expanded steps to check live parent chains, separate body layers, cross-bed yarn-link coverage at joined sides and access at the declared physical boundary. Canonical expanded sequences survive worker transport and refused key conversion; no sequence is reconstructed from a placeholder bitmap. Existing symbolic and Shape export gates remain active, including selected pieces of an unsupported patched layout. New lowering checks prevent stale key-cell metadata or a reused symbol ID with a different meaning from silently replacing an operation.

`npm run check` passed: TypeScript, 650/650 unit tests across 37 files (328 knit), 25.95 s unit duration, and production build. New coverage comprises 25 recipe cases and 5 integration cases. It includes both channel axes and all four pocket mouths, mirrored directions, rotated start edges, geometry and minimum-size rejection, overlaps, unchanged outside cells, damaged joins/body, custom-key lowering refusal, cancellation, project undo/round trips, worker cloning, patched-piece export gates and canonical-operation consistency. An isolated synthetic 600 × 600 panel executes 720,000 knits without retaining loop records; these are test values, not measured gauges, and do not certify browser responsiveness at that maximum size.

Final development focus: 2/2 new browser cases passed in 24.3 s with zero page/console errors. They cover local recipe application, exact outside-footprint identity, canonical JSON and every BMP pixel, a persistent off-boundary repair, blocked exports, project reload, zone deletion/undo, pocket roles/report and settled 375 px layout. Initial pocket verification read width 421 during the canvas resize frame; a diagnostic identified the canvas, and the assertion now waits for ResizeObserver/requestAnimationFrame settling. No runtime resize workaround was introduced. A subsequent presentation-only change labels the structure table as base assignments before recipe overrides; the final build includes it.

Final build: initial JS 766.23 kB (249.48 gzip), lazy viewer 586.18 kB (148.27 gzip), knit worker 170.77 kB, generation 97.35 kB, import 27.85 kB, cut 28.28 kB. The build reports its configured 750 kB chunk warning for the initial JS. Build success does not establish maximum-input interactive performance.

Full production browser verification passed: **47/47** in **7.5 minutes**, with zero page/console errors and the final built runtime frozen throughout. Both owned development and production servers (5184/4184) are stopped and their listener check is empty. Formatting, diff checks and source fingerprints are finalized in the verification manifest. No physical seam, usable channel/pocket dimensions, machine compatibility, knittability or achieved shape is certified. Cast-on, finishing, native scheduling, curved/shaped recipes, internal face openings and other feature families remain open.

## Shared-reference layer graph and explicit transfer phases (8 November 2026)

The opt-in `shared-reference-v1` model preserves two independent logical sheet histories on the same open-surface Shape/combined reference. Physical bed changes do not relabel loops. Actual canonical steps are checked against sheet-qualified reference parents, with missing/wrong-layer/repeated-parent/ancestry findings and final held inventory. Enabled failures block operation exports; JSON/report evidence stays available. Current two-guide shaping-transfer restrictions remain active. See [method, UI and model limits](knit-layers.md).

The separate pure phase checker validates explicitly declared logical occupancy and ordered whole-stack transfer phases, not a native machine program. One project racking per phase, distinct nonempty sources, disjoint source/destination slots and bounded grid destinations are enforced. Arrivals are available to later phases; failures are atomic within the rejected phase. Mixed stacks retain all identities; an optional target checks final inventory and locations. No automatic search, extra workspace or selective unstacking is inferred.

`npm run check` passed with **688/688** units across **39 files** (**366 knit**), **19.81 s** unit duration, TypeScript and production build. The 38 new cases comprise 15 layer-graph/integration tests and 23 phase tests. The distinguishing bed-swap case has the same unqualified geometric parent IDs on both sheets but different logical-layer IDs; it is rejected. Other cases cover held/turn histories, missing/tucked or duplicate-bed stitches, invalid ancestry, unsupported contexts, strong-saddle export gates, fingerprints and undo/round trips, worker transport, selected patched-piece gates, phase atomicity, wrong racking/grid/source/target, mixing, immutable inputs and cancellation. A synthetic 150,000-loop stack is a resource/inventory test, not a measurement or machine capacity claim.

Focused development browser verification passed **2/2** in **34.3 s**, with zero page/console errors. It covers opt-in plane histories without changing BMP bytes, per-layer inspection and graph/report files, undo/redo and project reload, unsupported-mode repair, strong-saddle transfer demands with exports blocked and a 375 px layout. A teaching-text-only update followed; all numerical/UI logic is unchanged, and the final production build contains that text.

Final build: initial JS **779.31 kB** (**254.05 gzip**), lazy viewer **586.18 kB** (**148.27 gzip**), knit worker **177.66 kB**, generation 97.35 kB, import 27.85 kB and cut 28.28 kB. The configured 750 kB initial chunk warning remains; no maximum-input browser responsiveness is certified.

Full production verification passed **49/49** in **6.1 minutes**, with zero page/console errors and the built runtime frozen throughout. Visual review then corrected two display-only labels: an empty actual-parent set now says “none”, and a finding without cell locations says “global check”. The final rebuilt/typechecked runtime passed the two affected workflows again (**2/2**, **33.5s**, zero errors), including explicit wording assertions and a bitmap-visible saddle screenshot. Numerical/model code is unchanged. Both owned preview servers (5184/4184) are stopped and their listener check is empty. Final records, formatting/diff checks and source fingerprints are finalized before delivery. No physical/native feasibility, knittability, achieved shape or physical layer thickness is certified. Existing plane-only recipe scope remains unchanged.

## Bounded selected-transition transfer planning — 8 November 2026

- **736/736 unit tests passed across 42 files** (414 knit; 20.53 seconds), with type checking, formatting and the production build. The 48 added cases cover bounded search (18), disposable worker lifecycle (18), and actual-prefix preparation/artifacts (12).
- An independent tiny-grid breadth-first oracle compares all **4,160** width-1/2 two-bed assignments of three distinct tokens, including initial stacks. Reachable targets are also checked at the oracle's minimum depth bound. Every found candidate passes the separate phase checker. Analytic examples include paired-layer relocation, temporary movement/restoration of held loops, whole-stack merging, invariant proofs, each resource cutoff, deterministic transformations, cancellation and input immutability. These are **test values, not measured gauges or machine specifications**.
- **2/2 focused development browser tests passed** in 38.235 seconds. The final numerical implementation and workflows were checked; afterward one display-only line was clarified so a rejected prefix says incoming state/target not prepared rather than showing zero counts.
- **50/50 production browser tests passed** in 367.112 seconds against the final rebuilt runtime, with zero page/console errors. Source and tests stayed frozen throughout. This includes the entire preceding regression suite, the new plane planner workflow, and the expanded strong-saddle workflow. An earlier preliminary saddle assertion was corrected because the repair action already opened the bitmap; a partial production attempt before the display clarification was deliberately interrupted and is not final evidence.
- Browser evidence covers verified zero-phase plane analysis with unchanged BMP and saved project; invalid resource fields; analysis-only controls; persistent outcomes and stale exports; actual worker cancellation and supersession using held module requests; regeneration; prefix failure repair; retained strong-saddle two-guide operation blockers; one-based JSON; and 375px layout. Worker-client unit tests independently exercise late messages after cancellation/settlement, error paths and cleanup. No worker result can silently replace a newer request.
- Initial JavaScript is **793.19 kB / 258.43 kB gzip**; lazy viewer 586.18/148.27 kB; dedicated planner worker 23.40 kB; knit worker 178.54 kB; generation/import/cut workers 97.35/27.85/28.28 kB. The existing 750 kB initial-chunk warning remains. No maximum-input browser performance or physical-device/assistive-technology coverage is claimed.

The [method and limits](knit-transfer-planning.md) describe the project model, safe invariants, exact target policy, resource caps and distinct outcomes. Actual replay prefixes must preserve parent histories and the unconsumed reference inventory, including prior leaves; later failures do not contaminate an otherwise valid earlier snapshot. Other held loops keep their final bed/needle positions, and target-construction conflicts are unsupported requests. Exhaustion or a model invariant is distinct from a computational cutoff. The JSON records complete occupied initial/target states and source blockers, with one-based artifact indices. Keep the full project JSON separately.

Candidates remain separate analysis artifacts: no phases are inserted, no actual histories or bitmaps are changed, and no source export blocker is removed. Current two-guide shaping-transfer restrictions and plane-only feature recipes remain active. Full sequence planning/application, native binding, lab calibration, physical loop mechanics, achieved shape and curved feature recipes remain open. Search conventions are project constructions, not a reproduction of a thesis or native machine compiler. Owned development/production previews on 5184/4184 were stopped and listeners checked empty. Fingerprints in the manifest describe this source snapshot; remote deployment was not tested.

## Whole-program shaping schedule analysis — 8 November 2026

- **779/779 unit tests passed across 45 files** (457 knit; 28.89 seconds), with type checking, formatting and the production build. The 43 new cases cover assembly/integration (14), fresh replay/witness validation (22), and worker transport/progress (7).
- **2/2 final focused development browser tests passed** in 35.653 seconds, and **51/51 final production browser tests passed** in 419.376 seconds, with zero page/console errors. The complete source and tests stayed frozen throughout the final production run. An earlier partial production run was deliberately interrupted for a malformed-symbol guard; it is not final evidence.
- Analytic schedules test successive paired relocations with actual state carried forward, fixed final held-loop positions and temporary restoration, tuck-on-held followed by a declared decrease, preserved operations/guide assignments/directions, source drops, one-pass symbolic start, exact parent/final-inventory checks, every relevant resource bound, cancellation, immutability and one-based artifact replay. The reference graph is not used to silently replace failed actual histories. Synthetic fixtures are **test values, not measured gauges or machine specifications**.
- Fresh replay rejects tampered/reordered/omitted phases, wrong parents/layers and malformed references/source symbols. A persistent-held-parking witness first reproduced false acceptance when only parents and terminal IDs were checked; per-boundary restoration now rejects it, while temporary moves/restoration and post-source-free baselines remain valid. A later unreadable source symbol first reproduced an exception; it now yields an unsupported stop and independently verified earlier prefix. Client guards reject malformed/unverified complete results and wrong source signatures. Transport-only progress throttling is tested with a mocked clock; no timing enters numerical results.
- The real browser plane candidate verifies **45/45 source passes**, zero added phases, and unchanged source BMP and saved project. Controls, invalid-field hints, explicit run/cancel, stale JSON, supersession, regeneration and preserved direction labels are checked. Holding worker-module requests makes cancellation tests deterministic without changing numerical code. The strong saddle with aggregate tested-move budget of 1 reports **1/48 verified source passes**, an incomplete prefix, and its original **363 export blockers**; BMP/Knit Grammar exports stay disabled and the stop repair opens the linked bitmap. Existing import, topology, knit, bitmap, patch, recipe, comparison, learning and citation workflows all pass.
- Initial JavaScript is **806.18 kB / 261.21 kB gzip**; lazy viewer 586.18/148.27 kB; dedicated schedule worker 30.30 kB; selected-transition worker 23.40 kB; knit worker 178.54 kB; generation/import/cut workers 97.35/27.85/28.28 kB. The existing 750 kB initial-chunk warning remains. No maximum-input performance claim is made. The 375px document-width check passes and new complete/incomplete panels were visually inspected in desktop Chrome software WebGL; physical-device/assistive-technology coverage is not established.

The [schedule method and limits](knit-shaping-schedules.md) document action-aware targets, preserved source operations, the existing symbolic source-pass convention, separate inter-pass phases, actual state propagation, independent replay, computational budgets, complete/incomplete artifacts and evidence limits. Assembly and fresh validation share the source-pass semantic primitive, but replay never uses the planner, target constructor, builder snapshots or claimed statistics. Completion requires all source passes in order, exact parent histories and final reference inventory. Valid prefixes may end with transfer phases before an unexecuted source pass. First-pass symbolic loop creation is not a cast-on, and retained final loops are not finishing.

Candidates remain separate analysis artifacts and are not applied to the project or bitmap. Original program blockers remain, including the current two-guide transfer restriction. Native scheduling/binding, cast-on/finishing, lab calibration, physical loop mechanics, achieved fabric shape and new curved feature recipes remain open. No machine settings, measured gauges or native symbols were inferred. Owned development/production previews on 5184/4184 were stopped and listener checks were empty. The final manifest records this source snapshot; remote deployment was not tested.

## Sphere polar openings and angular coverage — 8 November 2026

- **909/909 unit tests passed across 48 files** (198 core, 495 knit; 29.47 seconds), with type checking, formatting and the production build. The 130 new cases cover core domains/generation (92), knitting/legacy fixtures (19) and cuts/persistence/integration (19). A final type check also passed after the browser-test timing correction.
- **2/2 focused development browser tests passed** in 28.5 seconds against the final geometry before a display-only method clarification. **53/53 final production browser tests passed** in **478.114 seconds**, with no failures, skipped tests, flaky retries or JavaScript/console errors. Source and tests stayed frozen during the final complete run.
- A preliminary production run passed 52/53: the half-shell check read transient width 421 immediately after resizing the viewer to 375px. The assertion now waits for the actual settled layout, rather than sampling one frame. A focused follow-up passed (1/1, 18.7 seconds), then the entire final suite passed. No application CSS was changed for that timing correction. Earlier development test expectations for report formatting and cleared export buttons were also corrected; they are not final passing evidence.
- Geometry tests check analytic rims/area, uncapped meshes, noncollapsed retained-pole fans including minimum display resolution, projection, admissible paths, all six families, representative presets/guides and numerical limits. Knitting tests preserve exact legacy numeric fixtures and check both start sides/directions, parents, yarn jumps, holds, nonperiodic sectors, source cell coverage and target versus sampled rings. These are **test values, not measured gauges or machine specifications**.
- Integrated annular cuts produce a disk while keeping polar rims natural and unpaired, on all six families. Lost, repeated and falsely paired natural-boundary records are rejected. Partial sectors generate without an extra closing cut. Mode/key gates, measured-jersey and network prerequisites, saved-project reconstruction, byte-identical program rebuild, undo, stale cuts/stages and invalid saved domains are checked.
- Browser checks exercise real workers, the shared diameter and angular controls, meridian-only seam export, polar-band and half-shell knitting, report/bitmap availability, opposite start sides, saved parameters and explicit graph restoration, invalidation, minimum fraction and settled 375px layout. Rim/half-shell and narrow-sector screenshots were visually inspected. Sphere-specific UI and report wording identify the project construction.
- Initial JavaScript is **830.46 kB / 268.99 kB gzip**; lazy viewer 586.23/148.29 kB; knit worker 189.51 kB; generation/import/cut workers 106.37/27.85/31.08 kB; schedule/planner workers remain 30.30/23.40 kB. The existing 750 kB initial-bundle warning remains. No maximum-input performance claim is made.

The [domain construction and limits](sphere-domains.md) distinguish full spheres, annular bands and natural sectors, analytic targets, chart-path metrics and sampled knitting rings. Openings can change hold durations; no safe opening or hold threshold is inferred. Default zero/full settings retain pole singularities and the legacy construction. No native finishing, calibrated fabric aperture, machine feasibility or achieved physical shape is established. Shared-layer model and feature-recipe scopes remain unchanged. Both owned local previews (5184/4184) are stopped and the listener check is empty. Source fingerprints identify this snapshot; remote deployment was not performed.

## Portable sphere regression correction — 8 November 2026

The [user-triggered Pages run 42557193559](https://github.com/NijatM/KnittingTopology/actions/runs/42557193559) stopped in Verify and build: **908/909 unit tests passed**, and the full-layout raw SHA-256 legacy fixture differed on Ubuntu 26.04 / Node 26.13.0. Pages configuration/upload/deployment were not reached. All four original fingerprints still reproduce locally under both Node 26.11.1 and26.13.0 on macOS arm64; the exact differing Ubuntu fields were not captured. A raw JSON hash is not a portable floating-point or equivalent-chart comparison.

The corrected test retains the original local hashes as provenance in a compact synthetic baseline. It checks discrete course runs, loop IDs, pass/needle allocation, parent histories and short-row steps exactly; numerical layout, lengths and rounding to absolute tolerance 1e-12; every loop against the analytic sphere within 1e-12 m; and chart attachments by reconstructed physical position. Explicit zero/full defaults still compare exactly with absent defaults in each runtime. No test is skipped and no application/export gate is relaxed. Fixture dimensions are test values, not measured gauges or machine specifications.

- Focused suite: **19/19** under Node 26.11.1 in 5.55 s and **19/19** under Node 26.13.0 in 5.41 s.
- Full `npm run check` under Node 26.13.0: **909/909 across 48 files**, 27.80 s; type check and production build pass. Separate Node 26.11.1 type check also passes. Formatting/diff and manifest checks are finalized before delivery.
- Application, public assets and runtime/configuration fingerprints are unchanged. Rebuilt asset names/sizes match the preceding production build, so the earlier **53/53 browser run** remains evidence for the same runtime; it was not rerun for a test/documentation-only change.
- Corrected Ubuntu CI and deployment await the user's commit/push and workflow dispatch. This record does not claim a successful corrected remote run or physical fabrication validation.

## Decorative copy cleanup — 9 November 2026

Removed the five user-selected decorative spans: “Geometry first. Evidence always.”, “SURFACE / PATTERN / TOPOLOGY”, “CONTROLLED EXPLORATION”, “UNDERSTAND / EXPERIMENT / CITE” and “CONTROLLED EXPERIMENT”. The product title, Compare/Learn headings, specific example titles, instructions and controls remain. No numerical or interaction logic changed.

`npm run build` (including type checking), formatting and diff checks pass. **3/3 focused production browser tests pass in 18.387 seconds**, with no JavaScript/console errors: Compare capture/difference/restore, all 13 Learn topics and diagram controls without scientific-state changes, and Learn/references at 375px without horizontal overflow. The desktop Learn screenshot was visually inspected. The full unit/browser suites were not rerun for this static-text cleanup; earlier complete-suite records remain historical evidence. Initial JavaScript is 830.07 kB / 268.87 kB gzip; the existing chunk-size warning remains. The owned production preview on 4184 is stopped and its listener check is empty. Remote publication awaits the user.

## Sidebar identity — 9 November 2026

The top label is now `[NM,IS]`, linking to `https://tailoredmateriality.com/people/`. The subtitle and existing new-tab behavior remain. Static markup assertions verify the exact label/destination and removal of the personal-site URL from this identity link. Build (including type checking), formatting and diff checks pass. Unit/browser suites were not rerun for these two literal changes. Initial JavaScript is 830.07 kB / 268.88 kB gzip; the existing chunk-size warning remains. Remote publication is user-run.
