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
